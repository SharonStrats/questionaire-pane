import { describe, expect, it, vi } from 'vitest'
import {
  MAX_AI_IMPORT_DOCUMENT_CHARACTERS,
  MAX_AI_IMPORT_QUESTIONS,
  parseQuizImportResponse,
  QuizImportSidecarClient
} from './quizImportSidecarClient'
import type { NormalizedSourceDocument } from './quizAiService'

const document: NormalizedSourceDocument = {
  name: 'lesson.docx',
  mediaType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  blocks: [{
    kind: 'paragraph',
    text: 'Plants use sunlight to make food.',
    sourceDocument: 'lesson.docx',
    mediaType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    warnings: []
  }],
  warnings: []
}

const response = {
  questions: [{
    title: 'What do plants use to make food?',
    type: 'short-answer',
    options: [],
    correctAnswers: ['Sunlight'],
    confidence: 0.9,
    warnings: []
  }],
  warnings: []
}

describe('QuizImportSidecarClient', () => {
  it('rejects disabled or invalid endpoints before making requests', () => {
    expect(() => new QuizImportSidecarClient({ endpoint: ' ' })).toThrow('endpoint is disabled')
    expect(() => new QuizImportSidecarClient({ endpoint: 'file:///local' })).toThrow('must use HTTP(S)')
  })

  it('sends normalized source blocks and validates structured questions', async () => {
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify(response), { status: 200 }))
    const client = new QuizImportSidecarClient({ endpoint: 'https://ai.example.test/', fetch })

    await expect(client.generate(document, 'quiz')).resolves.toEqual(response)
    expect(JSON.parse(fetch.mock.calls[0][1].body as string)).toMatchObject({
      format: 'quiz',
      maxQuestions: 6,
      document: { blocks: document.blocks }
    })
  })

  it('rejects malformed question output', () => {
    expect(() => parseQuizImportResponse({
      questions: [{ title: 'Question', type: 'unsupported', options: [], correctAnswers: [] }]
    })).toThrow('malformed questions')
  })

  it('enforces bounded question and normalized document payloads', async () => {
    const client = new QuizImportSidecarClient({ endpoint: 'https://ai.example.test', fetch: vi.fn() })
    await expect(client.generate(document, 'quiz', MAX_AI_IMPORT_QUESTIONS + 1))
      .rejects.toMatchObject({ code: 'payload' })
    const oversized = {
      ...document,
      blocks: [{ ...document.blocks[0], text: 'x'.repeat(MAX_AI_IMPORT_DOCUMENT_CHARACTERS + 1) }]
    }
    await expect(client.generate(oversized, 'quiz', 1)).rejects.toMatchObject({ code: 'payload' })
  })
})
