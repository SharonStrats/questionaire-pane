import { sym, type LiveStore } from 'rdflib'
import { strFromU8, unzipSync } from 'fflate'
import { createContainerIfMissing } from './types'
import { ShortAnswerSidecarClient, type GradingCriterion, type ShortAnswerSidecarInput } from './shortAnswerSidecarClient'
import { VisionSidecarClient } from './visionSidecarClient'
import { QuizImportSidecarClient } from './quizImportSidecarClient'

const sourceDirectoryName = 'source-documents'
export const DOCX_MIME_TYPE = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
export const PDF_MIME_TYPE = 'application/pdf'
export const PPTX_MIME_TYPE = 'application/vnd.openxmlformats-officedocument.presentationml.presentation'
const semanticModel = 'Xenova/all-MiniLM-L6-v2'
const semanticMatchThreshold = 0.78

export type ImportedQuestionType =
  | 'multiple-choice'
  | 'selection'
  | 'true-false'
  | 'fill-in-the-blank'
  | 'short-answer'
  | 'ordering'
  | 'match'

export interface ImportedQuizQuestion {
  title: string
  type: ImportedQuestionType
  options: readonly string[]
  correctAnswers: readonly string[]
  sourceItems?: readonly string[]
  targetItems?: readonly string[]
  confidence?: number
  provenance?: QuestionProvenance
  warnings?: readonly string[]
  sourceBlock?: NormalizedSourceBlock
}

export type QuestionRegenerationResult =
  | { status: 'success', question: ImportedQuizQuestion }
  | { status: 'unavailable', reason: string }
  | { status: 'failed', reason: string }

export interface QuestionProvenance {
  sourceDocument: string
  sourceDocumentUri?: string
  mediaType: string
  page?: number
  slide?: number
  block?: number
  blockKind?: NormalizedSourceBlockKind
  excerpt?: string
}

export type ImportedQuizQuestionType = ImportedQuestionType
export type DocumentImportFormat = 'quiz' | 'survey'

export type NormalizedSourceBlockKind = 'heading' | 'paragraph' | 'list' | 'table' | 'notes'
export type TextExtractionCapability = 'text' | 'partial' | 'none'

export interface NormalizedSourceBlock {
  kind: NormalizedSourceBlockKind
  text: string
  sourceDocument: string
  mediaType: string
  page?: number
  slide?: number
  warnings: string[]
}

export interface NormalizedSourceDocument {
  name: string
  mediaType: string
  blocks: NormalizedSourceBlock[]
  warnings: string[]
  sourceDocumentUri?: string
}

/**
 * Report whether the current import can proceed with extracted text or needs
 * OCR before image-only content can be imported.
 */
export function getTextExtractionCapability (
  document: Pick<NormalizedSourceDocument, 'blocks' | 'warnings'>
): TextExtractionCapability {
  if (document.blocks.length === 0) return 'none'
  return document.warnings.some(warning => /no extractable text/i.test(warning))
    ? 'partial'
    : 'text'
}

export interface AcceptedImportMetadata {
  questionUri: string
  sourceDocument: string
  sourceDocumentUri?: string
  mediaType?: string
  page?: number
  slide?: number
  block?: number
  blockKind?: NormalizedSourceBlockKind
  excerpt?: string
  confidence: number
  warnings: string[]
}

export interface AcceptedImportSourceMetadata {
  sourceDocument: string
  sourceDocumentUri: string
  mediaType: string
}

const importedQuestionTypes: ImportedQuestionType[] = [
  'multiple-choice', 'selection', 'true-false', 'fill-in-the-blank',
  'short-answer', 'ordering', 'match'
]

function cleanStringList (value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return [...new Set(value
    .filter((item): item is string => typeof item === 'string')
    .map(item => item.replace(/\s+/g, ' ').trim())
    .filter(Boolean))]
}

function duplicateQuestionKey (title: string): string {
  return title
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Treat extracted/model data as untrusted. Keep the candidate editable, but
 * make incomplete or contradictory shapes visible in the review step.
 */
export function normalizeImportedQuestionCandidates (
  questions: readonly unknown[],
  document?: Pick<NormalizedSourceDocument, 'warnings' | 'blocks'>
): ImportedQuizQuestion[] {
  const normalizedTitles = questions.map(rawQuestion => {
    const raw = rawQuestion && typeof rawQuestion === 'object'
      ? rawQuestion as Record<string, unknown>
      : {}
    return typeof raw.title === 'string' ? duplicateQuestionKey(raw.title) : ''
  })
  const titleCounts = new Map<string, number>()
  normalizedTitles.forEach(title => {
    if (title) titleCounts.set(title, (titleCounts.get(title) ?? 0) + 1)
  })

  return questions.map((rawQuestion, index): ImportedQuizQuestion => {
    const raw = rawQuestion && typeof rawQuestion === 'object'
      ? rawQuestion as Record<string, unknown>
      : {}
    const title = typeof raw.title === 'string'
      ? raw.title.replace(/\s+/g, ' ').trim()
      : ''
    const type = importedQuestionTypes.includes(raw.type as ImportedQuestionType)
      ? raw.type as ImportedQuestionType
      : 'short-answer'
    const rawOptions = Array.isArray(raw.options)
      ? raw.options.filter((item): item is string => typeof item === 'string')
      : []
    const options = cleanStringList(raw.options)
    const rawCorrectAnswers = Array.isArray(raw.correctAnswers)
      ? raw.correctAnswers.filter((item): item is string => typeof item === 'string')
      : []
    const correctAnswers = cleanStringList(rawCorrectAnswers)
    const sourceItems = cleanStringList(raw.sourceItems)
    const targetItems = cleanStringList(raw.targetItems)
    const warnings = cleanStringList(raw.warnings)
    const confidence = typeof raw.confidence === 'number' && Number.isFinite(raw.confidence)
      ? Math.min(1, Math.max(0, raw.confidence))
      : 0.55

    if (!title) warnings.push('Question text could not be extracted.')
    if (correctAnswers.length === 0) warnings.push('No answer key was extracted.')
    if (rawCorrectAnswers.length > 1) warnings.push('Multiple possible answers were extracted; verify the answer key.')
    if (rawCorrectAnswers.length > correctAnswers.length) {
      warnings.push('Duplicate answer keys were removed; verify the answer.')
    }
    if (rawOptions.length > options.length) {
      warnings.push('Duplicate answer options were removed; verify the choices.')
    }
    if ((type === 'multiple-choice' || type === 'selection') &&
        (options.length < 2 || options.every(option => correctAnswers.includes(option)))) {
      warnings.push('Distractors are missing or incomplete.')
    }
    if ((type === 'multiple-choice' || type === 'selection') &&
        correctAnswers.some(answer => !options.includes(answer))) {
      warnings.push('Answer key contains values that are not present in the options.')
    }
    if (type === 'true-false' &&
        correctAnswers.some(answer => !['true', 'false'].includes(answer.toLowerCase()))) {
      warnings.push('True/false answer key should contain only true or false.')
    }
    if (type === 'true-false' && options.length > 0 &&
        (options.length !== 2 || !['true', 'false'].every(value =>
          options.some(option => option.toLowerCase() === value)))) {
      warnings.push('True/false options should contain exactly true and false.')
    }
    if (type === 'match' && (sourceItems.length === 0 || targetItems.length === 0)) {
      warnings.push('One or more matching item lists are missing.')
    }
    if (type === 'match' && sourceItems.length !== targetItems.length) {
      warnings.push('Matching source and target lists have different lengths.')
    }
    if (type === 'ordering' && options.length < 2) {
      warnings.push('The ordering list is missing or incomplete.')
    }
    if (type === 'ordering' && options.length >= 2 &&
        (correctAnswers.length !== options.length ||
          options.some(option => !correctAnswers.includes(option)))) {
      warnings.push('Ordering answer key must contain each option exactly once.')
    }
    if (normalizedTitles[index] && (titleCounts.get(normalizedTitles[index]) ?? 0) > 1) {
      warnings.push('Duplicate question text detected; review or remove one.')
    }
    if (document?.blocks.length === 0) warnings.push('The source contains no extractable text.')
    if (document?.blocks.some(block => block.text.trim().length > 0 && block.text.trim().length < 20)) {
      warnings.push('The source block is very short; verify the extracted context.')
    }

    return {
      title: title || 'Untitled imported question',
      type,
      options,
      correctAnswers,
      ...(sourceItems.length > 0 ? { sourceItems } : {}),
      ...(targetItems.length > 0 ? { targetItems } : {}),
      confidence,
      warnings: [...new Set(warnings)]
    }
  })
}

export function attachQuestionProvenance (
  questions: readonly unknown[],
  document: NormalizedSourceDocument
): ImportedQuizQuestion[] {
  return normalizeImportedQuestionCandidates(questions, document).map((question, index) => {
    const searchable = `${question.title} ${question.correctAnswers.join(' ')}`
    const blockIndex = document.blocks.findIndex(block =>
      searchable.toLowerCase().includes(block.text.slice(0, 80).toLowerCase()) ||
      block.text.toLowerCase().includes(question.title.slice(0, 80).toLowerCase())
    )
    const sourceBlock = document.blocks[blockIndex >= 0 ? blockIndex : (index < document.blocks.length ? index : -1)]
    const warnings = [...document.warnings, ...(sourceBlock?.warnings ?? [])]
    return {
      ...question,
      confidence: sourceBlock ? (warnings.length > 0 ? 0.7 : 0.9) : question.confidence,
      provenance: sourceBlock
        ? {
            sourceDocument: sourceBlock.sourceDocument,
            sourceDocumentUri: document.sourceDocumentUri,
            mediaType: sourceBlock.mediaType,
            page: sourceBlock.page,
            slide: sourceBlock.slide,
            block: (blockIndex >= 0 ? blockIndex : index) + 1,
            blockKind: sourceBlock.kind,
            excerpt: sourceBlock.text.slice(0, 160)
          }
        : { sourceDocument: document.name, mediaType: document.mediaType, sourceDocumentUri: document.sourceDocumentUri },
      sourceBlock,
      warnings: [...new Set(warnings)]
    }
  })
}

export function normalizeTextDocument (
  file: Pick<File, 'name' | 'type'>,
  text: string
): NormalizedSourceDocument {
  const mediaType = file.type || 'application/octet-stream'
  const blocks = text
    .split(/\n\s*\n/)
    .map(value => value.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .map(value => ({
      kind: 'paragraph' as const,
      text: value,
      sourceDocument: file.name,
      mediaType,
      warnings: []
    }))

  return {
    name: file.name,
    mediaType,
    blocks,
    warnings: blocks.length === 0
      ? ['The document contains no extractable text.', 'OCR may be required for image-only content.']
      : []
  }
}

export function normalizePdfDocument (
  file: Pick<File, 'name' | 'type'>,
  pages: readonly string[]
): NormalizedSourceDocument {
  const mediaType = file.type || PDF_MIME_TYPE
  const warnings: string[] = []
  const blocks: NormalizedSourceBlock[] = []

  pages.forEach((pageText, index) => {
    const page = index + 1
    const text = pageText.replace(/\s+/g, ' ').trim()
    if (!text) {
      warnings.push(`Page ${page} contains no extractable text; OCR may be required.`)
      return
    }

    blocks.push({
      kind: 'paragraph',
      text,
      sourceDocument: file.name,
      mediaType,
      page,
      warnings: []
    })
  })

  if (pages.length === 0) {
    warnings.push('The PDF contains no pages.')
  }
  if (blocks.length === 0 && pages.length > 0) {
    warnings.push('The PDF contains no extractable text; OCR is required for image-only pages.')
  }

  return { name: file.name, mediaType, blocks, warnings }
}

export interface PowerPointSlide {
  number: number
  title?: string
  blocks: Array<{ kind: Exclude<NormalizedSourceBlockKind, 'notes'>, text: string }>
  notes?: string
}

export function normalizePowerPointDocument (
  file: Pick<File, 'name' | 'type'>,
  slides: readonly PowerPointSlide[]
): NormalizedSourceDocument {
  const mediaType = file.type || PPTX_MIME_TYPE
  const warnings: string[] = []
  const blocks: NormalizedSourceBlock[] = []
  for (const slide of slides) {
    if (slide.title?.trim()) {
      blocks.push({ kind: 'heading', text: slide.title.trim(), sourceDocument: file.name, mediaType, slide: slide.number, warnings: [] })
    }
    for (const block of slide.blocks) {
      const text = block.text.replace(/\s+/g, ' ').trim()
      if (text) {
        blocks.push({
          kind: block.kind,
          text,
          sourceDocument: file.name,
          mediaType,
          slide: slide.number,
          warnings: []
        })
      }
    }
    if (slide.notes?.trim()) {
      blocks.push({
        kind: 'notes',
        text: slide.notes.replace(/\s+/g, ' ').trim(),
        sourceDocument: file.name,
        mediaType,
        slide: slide.number,
        warnings: []
      })
    }
    if (!slide.title?.trim() && slide.blocks.length === 0 && !slide.notes?.trim()) {
      warnings.push(`Slide ${slide.number} contains no extractable text; OCR may be required.`)
    }
  }
  if (slides.length === 0) warnings.push('The PowerPoint contains no slides.')
  if (blocks.length === 0 && slides.length > 0) {
    warnings.push('The PowerPoint contains no extractable text; OCR is required for image-only slides.')
  }
  return { name: file.name, mediaType, blocks, warnings }
}

export function isDocxFile (file: Pick<File, 'name' | 'type'>): boolean {
  return file.name.toLowerCase().endsWith('.docx') || file.type === DOCX_MIME_TYPE
}

export function isPdfFile (file: Pick<File, 'name' | 'type'>): boolean {
  return file.name.toLowerCase().endsWith('.pdf') || file.type === PDF_MIME_TYPE
}

export function isPptxFile (file: Pick<File, 'name' | 'type'>): boolean {
  return file.name.toLowerCase().endsWith('.pptx') || file.type === PPTX_MIME_TYPE
}

export function validateDocxImportFiles (files: readonly Pick<File, 'name' | 'type'>[]): string | null {
  if (files.length === 0) {
    return 'Choose at least one Word document.'
  }
  const invalidFile = files.find(file => !isDocxFile(file))
  return invalidFile ? `${invalidFile.name} is not a .docx file.` : null
}

export function validatePdfImportFiles (files: readonly Pick<File, 'name' | 'type'>[]): string | null {
  if (files.length === 0) {
    return 'Choose at least one PDF document.'
  }
  const invalidFile = files.find(file => !isPdfFile(file))
  return invalidFile ? `${invalidFile.name} is not a .pdf file.` : null
}

export function validateImportFiles (files: readonly Pick<File, 'name' | 'type'>[]): string | null {
  if (files.length === 0) {
    return 'Choose at least one document.'
  }
  const invalidFile = files.find(file => !isDocxFile(file) && !isPdfFile(file) && !isPptxFile(file))
  return invalidFile ? `${invalidFile.name} is not a supported document (.docx, .pdf, or .pptx).` : null
}

type FeatureExtractorOutput = {
  tolist: () => number[][]
}

type FeatureExtractor = (
  input: string | string[],
  options: { pooling: 'mean', normalize: true }
) => Promise<FeatureExtractorOutput>

export interface ShortAnswerEvaluation {
  correct: boolean
  score: number
  maxScore: number
  feedback: string
  confidence: number
  needsReview: boolean
  method: 'exact' | 'semantic' | 'sidecar'
}

export interface QuizAiService {
  importDocuments(store: LiveStore, baseUrl: string, files: File[], format: DocumentImportFormat): Promise<ImportedQuizQuestion[]>
  regenerateQuestion(question: ImportedQuizQuestion): Promise<QuestionRegenerationResult>
  saveAcceptedSourceDocuments(store: LiveStore, baseUrl: string, files: File[], sourceUris: Array<{ sourceDocument: string, sourceDocumentUri: string }>): Promise<void>
  saveImportReviewMetadata(store: LiveStore, baseUrl: string, metadata: AcceptedImportMetadata[], sources?: AcceptedImportSourceMetadata[]): Promise<void>
  ensureSemanticModel(): Promise<void>
  evaluateShortAnswer(answer: string, expectedAnswers: string[], options?: {
    question?: string
    gradingCriteria?: GradingCriterion[]
  }): Promise<ShortAnswerEvaluation>
}

type PdfTextItem = { str?: string }
type PdfPage = {
  getTextContent: () => Promise<{ items: PdfTextItem[] }>
}

export async function extractPdfPages (contents: ArrayBuffer): Promise<string[]> {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs')
  const document = await pdfjs.getDocument({ data: new Uint8Array(contents) }).promise
  const pages: string[] = []
  for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
    const page = await document.getPage(pageNumber) as unknown as PdfPage
    const textContent = await page.getTextContent()
    pages.push(textContent.items.map(item => item.str ?? '').join(' '))
  }

  return pages
}

function xmlText (xml: string): string {
    return [...xml.matchAll(/<a:t\b[^>]*>([\s\S]*?)<\/a:t>/g)]
      .map(match => match[1]
        .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
        .replace(/&quot;/g, String.fromCharCode(34)).replace(/&apos;/g, String.fromCharCode(39)))
      .join(' ')
  }

function xmlBlocks (xml: string): PowerPointSlide['blocks'] {
    const blocks: PowerPointSlide['blocks'] = []
    for (const shape of xml.match(/<p:sp\b[\s\S]*?<\/p:sp>/g) ?? []) {
      const text = xmlText(shape).replace(/\s+/g, ' ').trim()
      if (!text) continue
      const placeholder = shape.match(/<p:ph\b[^>]*type="([^"]+)"/)?.[1]
      if (placeholder === 'title' || placeholder === 'ctrTitle') continue
      blocks.push({
        kind: /<a:bu(Char|AutoNum)\b/.test(shape) ? 'list' : 'paragraph',
        text
      })
    }
    for (const table of xml.match(/<a:tbl\b[\s\S]*?<\/a:tbl>/g) ?? []) {
      const rows = [...table.matchAll(/<a:tr\b[\s\S]*?<\/a:tr>/g)]
        .map(row => xmlText(row[0]).replace(/\s+/g, ' ').trim()).filter(Boolean)
      if (rows.length) blocks.push({ kind: 'table', text: rows.join(' | ') })
    }
    return blocks
  }

export function extractPowerPointSlides (contents: ArrayBuffer | Uint8Array): PowerPointSlide[] {
    const files = unzipSync(new Uint8Array(contents))
    const slideNames = Object.keys(files)
      .filter(name => /^ppt\/slides\/slide\d+\.xml$/.test(name))
      .sort((a, b) => Number(a.match(/\d+/)?.[0]) - Number(b.match(/\d+/)?.[0]))
    return slideNames.map((name, index) => {
      const xml = strFromU8(files[name])
      const titleShape = (xml.match(/<p:sp\b[\s\S]*?<\/p:sp>/g) ?? [])
        .find(shape => /<p:ph\b[^>]*type="(?:title|ctrTitle)"/.test(shape))
      const relName = name.replace('slides/slide', 'slides/_rels/slide').replace('.xml', '.xml.rels')
      const relationship = files[relName] ? strFromU8(files[relName]).match(/Target="([^"]*notesSlides\/notesSlide\d+\.xml)"/)?.[1] : undefined
      const notesName = relationship ? `ppt/${relationship.replace(/^(\.\.\/)+/, '')}` : undefined
      const notes = notesName && files[notesName] ? xmlText(strFromU8(files[notesName])) : undefined
      return {
        number: index + 1,
        title: titleShape ? xmlText(titleShape).replace(/\s+/g, ' ').trim() : undefined,
        blocks: xmlBlocks(xml),
        notes: notes?.replace(/\s+/g, ' ').trim() || undefined
      }
    })
  }

let servicePromise: Promise<QuizAiService> | null = null
let transformersPromise: Promise<typeof import('@huggingface/transformers')> | null = null
let configuredSidecarClient: ShortAnswerSidecarClient | null = null
let configuredVisionClient: VisionSidecarClient | null = null
let configuredQuizImportClient: QuizImportSidecarClient | null = null

export interface QuizAiServiceConfiguration {
  sidecarEndpoint?: string
  sidecarClient?: ShortAnswerSidecarClient
  visionEndpoint?: string
  visionClient?: VisionSidecarClient
  quizImportEndpoint?: string
  quizImportClient?: QuizImportSidecarClient
}

/**
 * Opt in to sidecar grading. Calling this before loadQuizAiService is the
 * only way to enable remote grading; no endpoint is used by default.
 */
export function configureQuizAiService (configuration: QuizAiServiceConfiguration = {}) {
  configuredSidecarClient = configuration.sidecarClient ??
    (configuration.sidecarEndpoint?.trim() ? new ShortAnswerSidecarClient({ endpoint: configuration.sidecarEndpoint }) : null)
  configuredVisionClient = configuration.visionClient ??
    (configuration.visionEndpoint?.trim() ? new VisionSidecarClient({ endpoint: configuration.visionEndpoint }) : null)
  configuredQuizImportClient = configuration.quizImportClient ??
    (configuration.quizImportEndpoint?.trim() ? new QuizImportSidecarClient({ endpoint: configuration.quizImportEndpoint }) : null)
  servicePromise = null
}

function normalizeAnswer (value: string) {
  return value
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/[.,!?;:]+$/g, '')
    .toLowerCase()
}

function extractQuizFacts (text: string): string[] {
  const sentences = text
    .replace(/\s+/g, ' ')
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim().replace(/^[-*]\s*/, ''))
    .filter((sentence) => sentence.length >= 35)
  const paragraphs = text
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.replace(/\s+/g, ' ').trim())
    .filter((paragraph) => paragraph.length >= 35)

  const candidates = sentences.length > 0 ? sentences : paragraphs
  const seen = new Set<string>()
  return candidates
    .map((candidate) => candidate.length > 220 ? `${candidate.slice(0, 217).trim()}...` : candidate)
    .filter((candidate) => {
      const key = normalizeAnswer(candidate)
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
    .slice(0, 12)
}

type ElementFact = {
  atomicNumber: number
  symbol: string
  name: string
}

function extractElementFacts (text: string): ElementFact[] {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
  const facts: ElementFact[] = []

  for (let index = 0; index < lines.length - 2; index += 1) {
    const atomicNumber = Number(lines[index])
    const symbol = lines[index + 1]
    const name = lines[index + 2]
    if (
      Number.isInteger(atomicNumber) &&
      atomicNumber >= 1 &&
      atomicNumber <= 118 &&
      /^[A-Z][a-z]?$/.test(symbol) &&
      /^[A-Z][a-z]+$/.test(name)
    ) {
      facts.push({ atomicNumber, symbol, name })
      index += 2
    }
  }

  const seen = new Set<number>()
  return facts.filter((fact) => {
    if (seen.has(fact.atomicNumber)) return false
    seen.add(fact.atomicNumber)
    return true
  })
}

function createElementQuizQuestions (facts: ElementFact[]): ImportedQuizQuestion[] {
  const selectedFacts = facts.length > 12
    ? facts.filter((_, index) => index % Math.ceil(facts.length / 12) === 0).slice(0, 12)
    : facts
  const questions: ImportedQuizQuestion[] = []

  selectedFacts.forEach((fact, index) => {
    const distractors = selectedFacts
      .filter((candidate) => candidate !== fact)
      .slice(0, 3)

    switch (index % 4) {
      case 0:
        questions.push({
          title: `What is the chemical symbol for ${fact.name} (atomic number ${fact.atomicNumber})?`,
          type: 'multiple-choice',
          options: [fact.symbol, ...distractors.map((candidate) => candidate.symbol)],
          correctAnswers: [fact.symbol]
        })
        break
      case 1:
        questions.push({
          title: `Which element has the chemical symbol ${fact.symbol}?`,
          type: 'multiple-choice',
          options: [fact.name, ...distractors.map((candidate) => candidate.name)],
          correctAnswers: [fact.name]
        })
        break
      case 2:
        questions.push({
          title: `Complete the statement: ${fact.name} has atomic number _____.`,
          type: 'fill-in-the-blank',
          options: [],
          correctAnswers: [String(fact.atomicNumber)]
        })
        break
      default: {
        const isTrue = index % 2 === 1
        const statement = isTrue
          ? `${fact.symbol} is the chemical symbol for ${fact.name}.`
          : `${fact.symbol} is the chemical symbol for ${distractors[0]?.name ?? 'another element'}.`
        questions.push({
          title: `True or false: ${statement}`,
          type: 'true-false',
          options: ['True', 'False'],
          correctAnswers: [isTrue ? 'True' : 'False']
        })
      }
    }
  })

  return questions
}

function selectKeyTerm (fact: string): string {
  const stopWords = new Set([
    'about', 'after', 'again', 'being', 'could', 'first', 'from', 'have', 'into',
    'more', 'other', 'should', 'their', 'there', 'these', 'those', 'through',
    'under', 'using', 'which', 'would'
  ])
  const terms = fact.match(/[A-Za-z][A-Za-z-]{4,}/g) ?? []
  return terms.find((term) => !stopWords.has(term.toLowerCase())) ?? terms[0] ?? 'this topic'
}

function createLocalQuizQuestions (text: string): ImportedQuizQuestion[] {
  const facts = extractQuizFacts(text)
  const questions: ImportedQuizQuestion[] = []

  facts.forEach((fact, index) => {
    const term = selectKeyTerm(fact)
    switch (index % 4) {
      case 0: {
        const options = [fact, ...facts
          .filter((candidate) => candidate !== fact)
          .slice(0, 2)]
        questions.push({
          title: `Which statement about ${term} is supported by the document?`,
          type: 'multiple-choice',
          options,
          correctAnswers: [fact]
        })
        break
      }
      case 1:
        questions.push({
          title: `True or false: ${fact}`,
          type: 'true-false',
          options: ['True', 'False'],
          correctAnswers: ['True']
        })
        break
      case 2: {
        const blankedFact = fact.replace(new RegExp(`\\b${term}\\b`, 'i'), '_____')
        questions.push({
          title: `Complete the statement: ${blankedFact}`,
          type: 'fill-in-the-blank',
          options: [],
          correctAnswers: [term]
        })
        break
      }
      default:
        questions.push({
          title: `What does the document explain about ${term}?`,
          type: 'short-answer',
          options: [],
          correctAnswers: [fact]
        })
    }
  })

  return questions
}

export function parseQuestionAnswerPairs (text: string): ImportedQuizQuestion[] {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
  const questions: ImportedQuizQuestion[] = []

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]
    const questionMatch = line.match(/^(?:question|q)\s*\d*\s*[:.)-]\s*(.+)$/i)
    const title = questionMatch?.[1] ?? (line.endsWith('?') ? line : '')
    if (!title || /^(?:answer|a)\s*\d*\s*[:.)-]/i.test(title)) {
      continue
    }

    const nextLine = lines[index + 1] ?? ''
    const answerMatch = nextLine.match(/^(?:answer|a)\s*\d*\s*[:.)-]\s*(.+)$/i)
    const answer = answerMatch?.[1] ?? (!nextLine.endsWith('?') && !/^(?:question|q)\s*\d*\s*[:.)-]/i.test(nextLine) ? nextLine : '')
    if (answer || questionMatch || line.endsWith('?')) {
      questions.push({
        title,
        type: 'short-answer',
        options: [],
        correctAnswers: answer ? [answer] : [],
      })
      if (answerMatch) {
        index += 1
      }
    }
  }

  return questions
}

async function createService (
  sidecarClient: ShortAnswerSidecarClient | null,
  visionClient: VisionSidecarClient | null,
  quizImportClient: QuizImportSidecarClient | null
): Promise<QuizAiService> {
  const mammothModule = await import('mammoth')
  const mammoth = mammothModule.default ?? mammothModule
  let extractor: FeatureExtractor | null = null
  let extractorPromise: Promise<FeatureExtractor> | null = null

  async function loadTransformers () {
    transformersPromise ??= import('@huggingface/transformers')
    return transformersPromise
  }

  async function ensureSemanticModel () {
    if (extractor) {
      return
    }

    const transformers = await loadTransformers()
    const createFeatureExtractor = transformers.pipeline as unknown as (
      task: 'feature-extraction',
      model: string
    ) => Promise<FeatureExtractor>
    extractorPromise ??= createFeatureExtractor('feature-extraction', semanticModel)
    extractor = await extractorPromise
  }

  async function saveSourceDocument (store: LiveStore, baseUrl: string, file: File, contents: ArrayBuffer, documentUri?: string) {
    const fetcher = store.fetcher
    if (!fetcher) {
      throw new Error('Missing fetcher on questionnaire store')
    }

    const sourceDirectory = `${baseUrl.replace(/\/?$/, '/')}${sourceDirectoryName}/`
    await createContainerIfMissing(store, sourceDirectory)
    const safeFileName = file.name.replace(/[^a-zA-Z0-9._-]+/g, '-')
    const document = sym(documentUri ?? `${sourceDirectory}${globalThis.crypto?.randomUUID?.() ?? String(Date.now())}-${safeFileName}`)
    const response = await fetcher._fetch(document.uri, {
      method: 'PUT',
      headers: {
        'Content-Type': file.type || (isPdfFile(file) ? PDF_MIME_TYPE : isPptxFile(file) ? PPTX_MIME_TYPE : DOCX_MIME_TYPE)
      },
      body: contents
    })
    if (response.status < 200 || response.status >= 300) {
      throw new Error(`Failed to save ${file.name}: HTTP ${response.status}`)
    }
    return document.uri
  }

  async function importDocuments (store: LiveStore, baseUrl: string, files: File[], format: DocumentImportFormat) {
    const validationError = validateImportFiles(files)
    if (validationError) {
      throw new Error(validationError)
    }

    const importedQuestions: ImportedQuizQuestion[] = []
    for (const file of files) {
      const contents = await file.arrayBuffer()
      let normalizedDocument = isPdfFile(file)
        ? normalizePdfDocument(file, await extractPdfPages(contents))
        : isPptxFile(file)
          ? normalizePowerPointDocument(file, extractPowerPointSlides(contents))
          : normalizeTextDocument(file, (await mammoth.extractRawText({ arrayBuffer: contents })).value)
      if (visionClient && getTextExtractionCapability(normalizedDocument) === 'none') {
        try {
          normalizedDocument = await visionClient.extract(file, contents)
        } catch (error) {
          normalizedDocument.warnings = [
            ...normalizedDocument.warnings,
            `OCR/vision service unavailable: ${error instanceof Error ? error.message : String(error)}`
          ]
        }
      }
      const sourceDocumentUri = `${baseUrl.replace(/\/?$/, '/')}${sourceDirectoryName}/${globalThis.crypto?.randomUUID?.() ?? String(Date.now())}-${file.name.replace(/[^a-zA-Z0-9._-]+/g, '-')}`
      const normalizedText = normalizedDocument.blocks.map(block => block.text).join('\n\n')
      let questions: ImportedQuizQuestion[]
      if (quizImportClient && format === 'quiz') {
        try {
          const response = await quizImportClient.generate(normalizedDocument, format)
          normalizedDocument = {
            ...normalizedDocument,
            warnings: [...normalizedDocument.warnings, ...response.warnings]
          }
          questions = normalizeImportedQuestionCandidates(response.questions, normalizedDocument)
          if (questions.length === 0) throw new Error('The AI import service returned no questions.')
        } catch (error) {
          normalizedDocument = {
            ...normalizedDocument,
            warnings: [
              ...normalizedDocument.warnings,
              `AI import service unavailable: ${error instanceof Error ? error.message : String(error)}`
            ]
          }
          questions = format === 'quiz'
            ? await generateQuizQuestions(normalizedText)
            : parseQuestionAnswerPairs(normalizedText)
        }
      } else {
        questions = format === 'quiz'
          ? await generateQuizQuestions(normalizedText)
          : parseQuestionAnswerPairs(normalizedText)
      }
      importedQuestions.push(...attachQuestionProvenance(questions, {
        ...normalizedDocument,
        sourceDocumentUri
      }))
    }

    return importedQuestions
  }

  async function saveAcceptedSourceDocuments (
    store: LiveStore,
    baseUrl: string,
    files: File[],
    sourceUris: Array<{ sourceDocument: string, sourceDocumentUri: string }>
  ) {
    const remaining = [...sourceUris]
    for (const file of files) {
      const sourceIndex = remaining.findIndex(source => source.sourceDocument === file.name)
      if (sourceIndex >= 0) {
        const [source] = remaining.splice(sourceIndex, 1)
        await saveSourceDocument(store, baseUrl, file, await file.arrayBuffer(), source.sourceDocumentUri)
      }
    }
  }

  async function saveImportReviewMetadata (
    store: LiveStore,
    baseUrl: string,
    metadata: AcceptedImportMetadata[],
    sources: AcceptedImportSourceMetadata[] = []
  ) {
    const fetcher = store.fetcher
    if (!fetcher || metadata.length === 0) return
    const document = `${baseUrl.replace(/\/?$/, '/')}${sourceDirectoryName}/import-review.json`
    const response = await fetcher._fetch(document, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        version: 1,
        sources,
        questions: metadata
      })
    })
    if (response.status < 200 || response.status >= 300) {
      throw new Error(`Failed to save import review metadata: HTTP ${response.status}`)
    }
  }

  async function generateQuizQuestions (text: string): Promise<ImportedQuizQuestion[]> {
    if (!text.trim()) {
      return []
    }

    const elementFacts = extractElementFacts(text)
    if (elementFacts.length >= 5 && /atomic number|symbol|element/i.test(text)) {
      return Promise.resolve(createElementQuizQuestions(elementFacts))
    }

    return Promise.resolve(createLocalQuizQuestions(text))
  }

  async function regenerateQuestion (question: ImportedQuizQuestion): Promise<QuestionRegenerationResult> {
    const sourceText = question.sourceBlock?.text || question.provenance?.excerpt
    if (!sourceText?.trim()) {
      return { status: 'unavailable', reason: 'The source text for this question is unavailable.' }
    }

    try {
      const candidates = await generateQuizQuestions(sourceText)
      const candidate = candidates[0]
      if (!candidate) {
        return { status: 'unavailable', reason: 'The importer could not generate another question from this source block.' }
      }
      return {
        status: 'success',
        question: {
          ...candidate,
          confidence: question.confidence,
          warnings: [...(question.warnings ?? [])],
          provenance: question.provenance ? { ...question.provenance } : undefined,
          sourceBlock: question.sourceBlock
        }
      }
    } catch (error) {
      return {
        status: 'failed',
        reason: error instanceof Error ? error.message : String(error)
      }
    }
  }

  async function evaluateShortAnswer (
    answer: string,
    expectedAnswers: string[],
    options: { question?: string, gradingCriteria?: GradingCriterion[] } = {}
  ) {
    const normalizedAnswer = normalizeAnswer(answer)
    const normalizedExpected = expectedAnswers.map(normalizeAnswer).filter(Boolean)
    if (normalizedExpected.includes(normalizedAnswer)) {
      return { correct: true, score: 1, maxScore: 1, feedback: '', confidence: 1, needsReview: false, method: 'exact' as const }
    }

    if (!normalizedAnswer || normalizedExpected.length === 0) {
      return { correct: false, score: 0, maxScore: 1, feedback: '', confidence: 0, needsReview: false, method: 'exact' as const }
    }

    if (sidecarClient && options.question?.trim()) {
      const sidecarInput: ShortAnswerSidecarInput = {
        question: options.question,
        studentAnswer: answer,
        expectedAnswer: expectedAnswers[0],
        rubric: options.gradingCriteria?.length
          ? options.gradingCriteria
          : expectedAnswers.map((expectedAnswer) => ({
              criterion: expectedAnswer,
              points: 1
            })),
        maxScore: options.gradingCriteria?.length
          ? options.gradingCriteria.reduce((sum, criterion) => sum + criterion.points, 0)
          : expectedAnswers.length
      }
      try {
        const result = await sidecarClient.grade(sidecarInput)
        const needsReview = result.needsReview || result.decision === 'needs-review' || result.confidence < 0.8
        return {
          correct: result.score >= result.maxScore && !needsReview,
          score: result.score,
          maxScore: result.maxScore,
          feedback: result.feedback,
          confidence: result.confidence,
          needsReview,
          method: 'sidecar' as const
        }
      } catch (error) {
        console.warn('Short-answer sidecar unavailable; using local grading', error)
      }
    }

    await ensureSemanticModel()
    const output = await extractor!([normalizedAnswer, ...normalizedExpected], {
      pooling: 'mean',
      normalize: true
    })
    const vectors = output.tolist() as number[][]
    const answerVector = vectors[0] ?? []
    const confidence = Math.max(...vectors.slice(1).map((vector) => (
      vector.reduce((sum, value, index) => sum + value * (answerVector[index] ?? 0), 0)
    )), 0)
    const rubricRequiresReview = Boolean(options.gradingCriteria?.length)

    return {
      correct: !rubricRequiresReview && confidence >= semanticMatchThreshold,
      score: rubricRequiresReview ? 0 : confidence >= semanticMatchThreshold ? 1 : 0,
      maxScore: options.gradingCriteria?.reduce((sum, criterion) => sum + criterion.points, 0) || 1,
      feedback: '',
      needsReview: rubricRequiresReview,
      confidence,
      method: 'semantic' as const
    }
  }

  return {
    importDocuments,
    regenerateQuestion,
    saveAcceptedSourceDocuments,
    saveImportReviewMetadata,
    ensureSemanticModel,
    evaluateShortAnswer
  }
}

export function loadQuizAiService () {
  servicePromise ??= createService(configuredSidecarClient, configuredVisionClient, configuredQuizImportClient)
  return servicePromise
}
