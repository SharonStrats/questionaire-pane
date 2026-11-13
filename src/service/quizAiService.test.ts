import { beforeEach, describe, expect, it, vi } from 'vitest'
import { strToU8, zipSync } from 'fflate'
import { ShortAnswerSidecarClient } from './shortAnswerSidecarClient'
import {
  configureQuizAiService,
  attachQuestionProvenance,
  extractPdfPages,
  extractPowerPointSlides,
  getTextExtractionCapability,
  isDocxFile,
  isPdfFile,
  isPptxFile,
  loadQuizAiService,
  normalizePdfDocument,
  normalizePowerPointDocument,
  normalizeTextDocument,
  normalizeImportedQuestionCandidates,
  parseQuestionAnswerPairs,
  validateDocxImportFiles,
  validatePdfImportFiles
} from './quizAiService'
import type { QuizImportSidecarClient } from './quizImportSidecarClient'
import type { VisionSidecarClient } from './visionSidecarClient'

vi.mock('@huggingface/transformers', () => ({
  pipeline: vi.fn(async () => async () => ({
    tolist: () => [[1, 0], [0.9, 0.1]]
  }))
}))

vi.mock('pdfjs-dist/legacy/build/pdf.mjs', () => ({
  getDocument: vi.fn(({ data }: { data?: ArrayBuffer }) => ({
    promise: Promise.resolve({
      numPages: 3,
      getPage: vi.fn(async (page: number) => ({
        getTextContent: async () => ({
          items: [{ str: data && new Uint8Array(data)[0] === 99 ? '' : page === 2 ? '' : `Page ${page} text` }]
        })

      }))
    })
  }))
}))

const sidecarResponse = {
  decision: 'correct',
  score: 1,
  maxScore: 1,
  confidence: 0.91,
  feedback: 'Correct.',
  matchedCriteria: ['Plants use sunlight.'],
  missingCriteria: [],
  needsReview: false
}

describe('quiz short-answer sidecar opt-in', () => {
  beforeEach(() => {
    configureQuizAiService()
  })

  describe('DOCX import boundaries', () => {
    it('normalizes untrusted candidates and reports answer and distractor quality issues', () => {
      const normalized = normalizeImportedQuestionCandidates([{
        title: '  Pick a plant  ',
        type: 'multiple-choice',
        options: ['Fern', 'Fern'],
        correctAnswers: ['Fern', 'Fern'],
        confidence: 4
      }])
      expect(normalized[0]).toMatchObject({
        title: 'Pick a plant',
        options: ['Fern'],
        correctAnswers: ['Fern'],
        confidence: 1
      })
      expect(normalized[0].warnings).toEqual(expect.arrayContaining([
        'Multiple possible answers were extracted; verify the answer key.',
        'Duplicate answer keys were removed; verify the answer.',
        'Distractors are missing or incomplete.'
      ]))
    })

    it('warns about missing keys, short sources, and malformed model fields', () => {
      const normalized = normalizeImportedQuestionCandidates([{
        title: 42,
        type: 'not-a-question-type',
        options: 'not-an-array',
        correctAnswers: null
      }], {
        blocks: [{
          kind: 'paragraph',
          text: 'Short',
          sourceDocument: 'lesson.docx',
          mediaType: 'application/octet-stream',
          warnings: []
        }],
        warnings: []
      })
      expect(normalized[0]).toMatchObject({
        title: 'Untitled imported question',
        type: 'short-answer',
        options: [],
        correctAnswers: []
      })
      expect(normalized[0].warnings).toEqual(expect.arrayContaining([
        'Question text could not be extracted.',
        'No answer key was extracted.',
        'The source block is very short; verify the extracted context.'
      ]))
    })

    it('flags duplicate question text for review without dropping candidates', () => {
      const normalized = normalizeImportedQuestionCandidates([
        { title: 'What is photosynthesis?', type: 'short-answer', options: [], correctAnswers: ['Sunlight'] },
        { title: ' What is photosynthesis? ', type: 'short-answer', options: [], correctAnswers: ['Plants use sunlight'] }
      ])

      expect(normalized).toHaveLength(2)
      expect(normalized[0].warnings).toContain('Duplicate question text detected; review or remove one.')
      expect(normalized[1].warnings).toContain('Duplicate question text detected; review or remove one.')
    })

    it('flags multiple-choice answer keys that do not match their options', () => {
      const normalized = normalizeImportedQuestionCandidates([{
        title: 'Which planet is closest to the sun?',
        type: 'multiple-choice',
        options: ['Earth', 'Mars'],
        correctAnswers: ['Mercury']
      }])

      expect(normalized[0].warnings).toContain(
        'Answer key contains values that are not present in the options.'
      )
    })

    it('flags invalid true/false answer values', () => {
      const normalized = normalizeImportedQuestionCandidates([{
        title: 'The sun is a star.',
        type: 'true-false',
        options: ['True', 'False'],
        correctAnswers: ['Definitely']
      }])

      expect(normalized[0].warnings).toContain(
        'True/false answer key should contain only true or false.'
      )
    })

    it('flags true/false options that are not the two boolean choices', () => {
      const normalized = normalizeImportedQuestionCandidates([{
        title: 'The sun is a star.',
        type: 'true-false',
        options: ['True', 'Maybe'],
        correctAnswers: ['True']
      }])

      expect(normalized[0].warnings).toContain(
        'True/false options should contain exactly true and false.'
      )
    })

    it('warns when duplicate answer options are normalized away', () => {
      const normalized = normalizeImportedQuestionCandidates([{
        title: 'Choose a color.',
        type: 'multiple-choice',
        options: ['Blue', 'Blue', 'Green'],
        correctAnswers: ['Blue']
      }])

      expect(normalized[0].options).toEqual(['Blue', 'Green'])
      expect(normalized[0].warnings).toContain(
        'Duplicate answer options were removed; verify the choices.'
      )
    })

    it('flags matching questions with unequal source and target lists', () => {
      const normalized = normalizeImportedQuestionCandidates([{
        title: 'Match each term to its definition.',
        type: 'match',
        options: [],
        correctAnswers: [],
        sourceItems: ['Photosynthesis', 'Respiration'],
        targetItems: ['Uses sunlight']
      }])

      expect(normalized[0].warnings).toContain(
        'Matching source and target lists have different lengths.'
      )
    })

    it('flags ordering answer keys that do not contain every option', () => {
      const normalized = normalizeImportedQuestionCandidates([{
        title: 'Order the life cycle stages.',
        type: 'ordering',
        options: ['Seed', 'Plant', 'Flower'],
        correctAnswers: ['Seed', 'Flower']
      }])

      expect(normalized[0].warnings).toContain(
        'Ordering answer key must contain each option exactly once.'
      )
    })

    it('keeps question candidates when a deterministic answer key is missing', () => {
      expect(parseQuestionAnswerPairs('Question: Which planet is nearest the sun?\nQuestion: Unanswered?')).toEqual([
        expect.objectContaining({ title: 'Which planet is nearest the sun?', correctAnswers: [] }),
        expect.objectContaining({ title: 'Unanswered?', correctAnswers: [] })
      ])
    })

    it('attaches confidence, source block location, and extraction warnings to questions', () => {
      const questions = attachQuestionProvenance([{
        title: 'What is photosynthesis?',
        type: 'short-answer',
        options: [],
        correctAnswers: ['Uses sunlight']
      }], {
        name: 'lesson.pdf',
        mediaType: 'application/pdf',
        blocks: [{
          kind: 'paragraph',
          text: 'What is photosynthesis? Uses sunlight',
          sourceDocument: 'lesson.pdf',
          mediaType: 'application/pdf',
          page: 4,
          warnings: ['Text order may be approximate.']
        }],
        warnings: ['Page 2 contains no extractable text; OCR may be required.']
      })

      expect(questions[0]).toMatchObject({
        confidence: 0.7,
        provenance: {
          sourceDocument: 'lesson.pdf',
          page: 4,
          block: 1
        },
        warnings: [
          'Page 2 contains no extractable text; OCR may be required.',
          'Text order may be approximate.'
        ]
      })
    })
    it('regenerates one staged question without changing its provenance or review metadata', async () => {
      const original = {
        title: 'Old question',
        type: 'short-answer' as const,
        options: [],
        correctAnswers: ['old answer'],
        confidence: 0.72,
        warnings: ['Review the answer.'],
        provenance: {
          sourceDocument: 'lesson.docx',
          sourceDocumentUri: 'https://example.test/lesson.docx',
          mediaType: 'text/plain',
          block: 2,
          excerpt: 'Photosynthesis uses sunlight to make food.'
        },
        sourceBlock: {
          kind: 'paragraph' as const,
          text: 'Photosynthesis uses sunlight to make food.',
          sourceDocument: 'lesson.docx',
          mediaType: 'text/plain',
          warnings: []
        }
      }
      const result = await (await loadQuizAiService()).regenerateQuestion(original)
      expect(result).toMatchObject({
        status: 'success',
        question: {
          confidence: 0.72,
          warnings: ['Review the answer.'],
          provenance: original.provenance,
          sourceBlock: original.sourceBlock
        }
      })
    })

    it('reports regeneration as unavailable when the normalized source block is missing', async () => {
      const result = await (await loadQuizAiService()).regenerateQuestion({
        title: 'Question',
        type: 'short-answer',
        options: [],
        correctAnswers: ['answer'],
        confidence: 0.8
      })
      expect(result).toEqual({
        status: 'unavailable',
        reason: 'The source text for this question is unavailable.'
      })
    })
    it('normalizes extracted text into reusable source blocks', () => {
      expect(normalizeTextDocument(
        { name: 'study.docx', type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' },
        'Heading one\n\nA paragraph with source text.'
      )).toEqual({
        name: 'study.docx',
        mediaType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        blocks: [
          {
            kind: 'paragraph',
            text: 'Heading one',
            sourceDocument: 'study.docx',
            mediaType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            warnings: []
          },
          {
            kind: 'paragraph',
            text: 'A paragraph with source text.',
            sourceDocument: 'study.docx',
            mediaType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            warnings: []
          }
        ],
        warnings: []
      })
    })

    it('reports documents with no extractable text', () => {
      expect(normalizeTextDocument({ name: 'empty.docx', type: '' }, '  ')).toMatchObject({
        name: 'empty.docx',
        mediaType: 'application/octet-stream',
        blocks: [],
        warnings: [
          'The document contains no extractable text.',
          'OCR may be required for image-only content.'
        ]
      })
      expect(getTextExtractionCapability(normalizeTextDocument({ name: 'empty.docx', type: '' }, '  '))).toBe('none')
    })

    it('accepts DOCX names or the official DOCX MIME type only', () => {
      expect(isDocxFile({ name: 'study.DOCX', type: '' })).toBe(true)
      expect(isDocxFile({
        name: 'study',
        type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
      })).toBe(true)
      expect(isDocxFile({ name: 'notes.pdf', type: 'application/pdf' })).toBe(false)
    })

    it('rejects empty and mixed file selections before extraction', () => {
      expect(validateDocxImportFiles([])).toBe('Choose at least one Word document.')
      expect(validateDocxImportFiles([
        { name: 'quiz.docx', type: '' },
        { name: 'notes.txt', type: 'text/plain' }
      ])).toBe('notes.txt is not a .docx file.')
    })

    it('validates PDF extension and MIME type', () => {
      expect(isPdfFile({ name: 'study.PDF', type: '' })).toBe(true)
      expect(isPdfFile({ name: 'study', type: 'application/pdf' })).toBe(true)
      expect(isPdfFile({ name: 'study.docx', type: 'application/pdf' })).toBe(true)
      expect(isPdfFile({ name: 'notes.txt', type: 'text/plain' })).toBe(false)
      expect(validatePdfImportFiles([])).toBe('Choose at least one PDF document.')
      expect(validatePdfImportFiles([{ name: 'notes.txt', type: 'text/plain' }])).toBe('notes.txt is not a .pdf file.')
    })

    it('validates and extracts PowerPoint slide content with provenance', () => {
      expect(isPptxFile({ name: 'lesson.PPTX', type: '' })).toBe(true)
      expect(isPptxFile({ name: 'lesson', type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation' })).toBe(true)
      expect(isPptxFile({ name: 'lesson.pdf', type: 'application/pdf' })).toBe(false)
      const slides = extractPowerPointSlides(zipSync({
        'ppt/slides/slide1.xml': strToU8('<p:sld><p:sp><p:nvSpPr><p:nvPr><p:ph type="title"/></p:nvPr></p:nvSpPr><a:t>Photosynthesis</a:t></p:sp><p:sp><a:buChar char="•"/><a:t>Uses sunlight</a:t></p:sp><p:graphicFrame><a:tbl><a:tr><a:tc><a:t>Input</a:t></a:tc><a:tc><a:t>Output</a:t></a:tc></a:tr></a:tbl></p:graphicFrame></p:sld>'),
        'ppt/slides/_rels/slide1.xml.rels': strToU8('<Relationships><Relationship Target="../notesSlides/notesSlide1.xml"/></Relationships>'),
        'ppt/notesSlides/notesSlide1.xml': strToU8('<p:notes><a:t>Teacher explanation</a:t></p:notes>')
      }))
      expect(normalizePowerPointDocument({ name: 'lesson.pptx', type: '' }, slides)).toMatchObject({
        blocks: [
          { kind: 'heading', text: 'Photosynthesis', slide: 1 },
          { kind: 'list', text: 'Uses sunlight', slide: 1 },
          { kind: 'table', text: 'Input Output', slide: 1 },
          { kind: 'notes', text: 'Teacher explanation', slide: 1 }
        ],
        warnings: []
      })
    })

    it('extracts PDF pages in order and preserves page numbers', async () => {
      const pages = await extractPdfPages(new ArrayBuffer(0))
      expect(normalizePdfDocument({ name: 'study.pdf', type: 'application/pdf' }, pages)).toEqual({
        name: 'study.pdf',
        mediaType: 'application/pdf',
        blocks: [
          {
            kind: 'paragraph',
            text: 'Page 1 text',
            sourceDocument: 'study.pdf',
            mediaType: 'application/pdf',
            page: 1,
            warnings: []
          },
          {
            kind: 'paragraph',
            text: 'Page 3 text',
            sourceDocument: 'study.pdf',
            mediaType: 'application/pdf',
            page: 3,
            warnings: []
          }
        ],
        warnings: ['Page 2 contains no extractable text; OCR may be required.']
      })
      expect(getTextExtractionCapability(normalizePdfDocument(
        { name: 'study.pdf', type: 'application/pdf' },
        pages
      ))).toBe('partial')
    })

    it('warns when a PDF has no extractable text', () => {
      expect(normalizePdfDocument({ name: 'scan.pdf', type: '' }, ['', '   '])).toMatchObject({
        blocks: [],
        warnings: [
          'Page 1 contains no extractable text; OCR may be required.',
          'Page 2 contains no extractable text; OCR may be required.',
          'The PDF contains no extractable text; OCR is required for image-only pages.'
        ]
      })
      expect(getTextExtractionCapability(normalizePdfDocument({ name: 'scan.pdf', type: '' }, ['', '   ']))).toBe('none')
    })

    it('uses the configured vision client for image-only documents', async () => {
      const extractedDocument = {
        name: 'scan.pdf',
        mediaType: 'application/pdf',
        blocks: [{
          kind: 'paragraph' as const,
          text: 'Question: What is photosynthesis?\nAnswer: Plants use sunlight.',
          sourceDocument: 'scan.pdf',
          mediaType: 'application/pdf',
          page: 1,
          warnings: []
        }],
        warnings: []
      }
      const extract = vi.fn().mockResolvedValue(extractedDocument)
      configureQuizAiService({
        visionClient: { extract } as unknown as VisionSidecarClient
      })
      const service = await loadQuizAiService()
      const file = {
        name: 'scan.pdf',
        type: 'application/pdf',
        arrayBuffer: async () => new Uint8Array([99]).buffer
      } as unknown as File

      const questions = await service.importDocuments({} as never, 'https://example.test/quiz/', [file], 'survey')

      expect(extract).toHaveBeenCalledOnce()
      expect(questions[0]).toMatchObject({
        title: 'What is photosynthesis?',
        correctAnswers: ['Plants use sunlight.'],
        provenance: { sourceDocument: 'scan.pdf', page: 1 }
      })
    })

    it('rejects invalid files at the import entry point before reading them', async () => {
      const file = {
        name: 'notes.txt',
        type: 'text/plain',
        arrayBuffer: vi.fn()
      } as unknown as File
      const service = await loadQuizAiService()

      await expect(service.importDocuments({} as never, 'https://example.test/quiz/', [file], 'survey'))
        .rejects.toThrow('notes.txt is not a supported document (.docx, .pdf, or .pptx).')
      expect(file.arrayBuffer).not.toHaveBeenCalled()
    })

    it('uses validated AI questions for quiz review while keeping surveys deterministic', async () => {
      const generate = vi.fn().mockResolvedValue({
        questions: [{
          title: 'AI question',
          type: 'short-answer',
          options: [],
          correctAnswers: ['AI answer'],
          confidence: 0.94,
          warnings: ['Review generated wording.']
        }],
        warnings: ['Generated by the configured import service.']
      })
      configureQuizAiService({ quizImportClient: { generate } as unknown as QuizImportSidecarClient })
      const service = await loadQuizAiService()
      const file = {
        name: 'lesson.pdf',
        type: 'application/pdf',
        arrayBuffer: async () => new ArrayBuffer(0)
      } as unknown as File

      const quizQuestions = await service.importDocuments({} as never, 'https://example.test/quiz/', [file], 'quiz')
      expect(quizQuestions[0]).toMatchObject({
        title: 'AI question',
        provenance: { sourceDocument: 'lesson.pdf', page: 1 },
        warnings: expect.arrayContaining(['Generated by the configured import service.'])
      })
      expect(generate).toHaveBeenCalledOnce()

      generate.mockClear()
      await service.importDocuments({} as never, 'https://example.test/quiz/', [file], 'survey')
      expect(generate).not.toHaveBeenCalled()
    })

    it('persists source metadata alongside accepted question provenance', async () => {
      const fetcher = {
        _fetch: vi.fn(async () => ({ status: 201 }))
      }
      const service = await loadQuizAiService()
      await service.saveImportReviewMetadata(
        { fetcher } as never,
        'https://example.test/quiz/',
        [{
          questionUri: 'https://example.test/quiz/draft/questions/q1.ttl',
          sourceDocument: 'lesson.docx',
          sourceDocumentUri: 'https://example.test/quiz/source-documents/one-lesson.docx',
          confidence: 0.9,
          warnings: []
        }],
        [{
          sourceDocument: 'lesson.docx',
          sourceDocumentUri: 'https://example.test/quiz/source-documents/one-lesson.docx',
          mediaType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
        }]
      )

      const request = fetcher._fetch.mock.calls[0] as unknown as [string, RequestInit]
      expect(request[0]).toBe('https://example.test/quiz/source-documents/import-review.json')
      expect(JSON.parse(request[1].body as string)).toMatchObject({
        version: 1,
        sources: [{
          sourceDocument: 'lesson.docx',
          sourceDocumentUri: 'https://example.test/quiz/source-documents/one-lesson.docx'
        }],
        questions: [{ questionUri: 'https://example.test/quiz/draft/questions/q1.ttl' }]
      })
    })

    it('extracts explicit and question-mark question/answer pairs deterministically', () => {
      expect(parseQuestionAnswerPairs(`Question: What is 2 + 2?
  Answer: 4

  What is the capital of Australia?
  Canberra

  Answer: orphan`)).toEqual([
        {
          title: 'What is 2 + 2?',
          type: 'short-answer',
          options: [],
          correctAnswers: ['4']
        },
        {
          title: 'What is the capital of Australia?',
          type: 'short-answer',
          options: [],
          correctAnswers: ['Canberra']
        }
      ])
    })
  })

  it('does not invoke the sidecar unless explicitly configured', async () => {
    const fetch = vi.fn()
    const service = await loadQuizAiService()

    await service.evaluateShortAnswer('Plants use sunlight.', ['Plants use sunlight.'])

    expect(fetch).not.toHaveBeenCalled()
  })

  it('uses the configured sidecar for a non-exact answer', async () => {
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify(sidecarResponse), { status: 200 }))
    configureQuizAiService({ sidecarClient: new ShortAnswerSidecarClient({ endpoint: 'http://localhost:5001', fetch }) })

    const result = await (await loadQuizAiService()).evaluateShortAnswer(
      'Plants make food.',
      ['Plants use sunlight.'],
      { question: 'Why do plants need sunlight?' }
    )

    expect(fetch).toHaveBeenCalledOnce()
    expect(result).toMatchObject({ correct: true, confidence: 0.91, method: 'sidecar' })
  })

  it('uses creator criteria when present and accepted answers when absent', async () => {
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      ...sidecarResponse,
      maxScore: 3,
      score: 3
    }), { status: 200 }))
    configureQuizAiService({ sidecarClient: new ShortAnswerSidecarClient({ endpoint: 'http://localhost:5001', fetch }) })

    await (await loadQuizAiService()).evaluateShortAnswer(
      'Plants make food.',
      ['legacy accepted answer'],
      {
        question: 'Why do plants need sunlight?',
        gradingCriteria: [
          { criterion: 'mentions sunlight', points: 1 },
          { criterion: 'explains food production', points: 2 }
        ]
      }
    )

    const request = JSON.parse(fetch.mock.calls[0][1].body as string)
    expect(request.rubric).toEqual([
      { criterion: 'mentions sunlight', points: 1 },
      { criterion: 'explains food production', points: 2 }
    ])
    expect(request.maxScore).toBe(3)
  })

  it('falls back to local semantic grading when the sidecar fails', async () => {
    const fetch = vi.fn().mockRejectedValue(new Error('sidecar unavailable'))
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => {})
    configureQuizAiService({ sidecarClient: new ShortAnswerSidecarClient({ endpoint: 'http://localhost:5001', fetch }) })

    const result = await (await loadQuizAiService()).evaluateShortAnswer(
      'Plants make food.',
      ['Plants use sunlight.'],
      { question: 'Why do plants need sunlight?' }
    )

    expect(result.method).toBe('semantic')
    expect(result.correct).toBe(true)
    expect(warning).toHaveBeenCalled()
    warning.mockRestore()
  })
})
