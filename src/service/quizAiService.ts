import { sym, type Store } from 'rdflib'
import { createContainerIfMissing } from './questionaireTypes'

const sourceDirectoryName = 'source-documents'
const semanticModel = 'Xenova/all-MiniLM-L6-v2'
const semanticMatchThreshold = 0.78

export type ImportedQuizQuestionType =
  | 'multiple-choice'
  | 'selection'
  | 'true-false'
  | 'fill-in-the-blank'
  | 'short-answer'
  | 'ordering'
  | 'match'

export interface ImportedQuizQuestion {
  title: string
  type: ImportedQuizQuestionType
  options: string[]
  correctAnswers: string[]
  sourceItems?: string[]
  targetItems?: string[]
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
  confidence: number
  method: 'exact' | 'semantic'
}

export interface QuizAiService {
  importDocuments(store: Store, baseUrl: string, files: File[], format: 'quiz' | 'survey'): Promise<ImportedQuizQuestion[]>
  ensureSemanticModel(): Promise<void>
  evaluateShortAnswer(answer: string, expectedAnswers: string[]): Promise<ShortAnswerEvaluation>
}

let servicePromise: Promise<QuizAiService> | null = null
let transformersPromise: Promise<typeof import('@huggingface/transformers')> | null = null

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

function parseQuestions (text: string): ImportedQuizQuestion[] {
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
    if (answer) {
      questions.push({
        title,
        type: 'short-answer',
        options: [],
        correctAnswers: [answer],
      })
      if (answerMatch) {
        index += 1
      }
    }
  }

  return questions
}

async function createService (): Promise<QuizAiService> {
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

  async function saveSourceDocument (store: Store, baseUrl: string, file: File, contents: ArrayBuffer) {
    const fetcher = store.fetcher
    if (!fetcher) {
      throw new Error('Missing fetcher on questionnaire store')
    }

    const sourceDirectory = `${baseUrl.replace(/\/?$/, '/')}${sourceDirectoryName}/`
    await createContainerIfMissing(store, sourceDirectory)
    const safeFileName = file.name.replace(/[^a-zA-Z0-9._-]+/g, '-')
    const documentId = globalThis.crypto?.randomUUID?.() ?? String(Date.now())
    const document = sym(`${sourceDirectory}${documentId}-${safeFileName}`)
    const response = await fetcher._fetch(document.uri, {
      method: 'PUT',
      headers: {
        'Content-Type': file.type || 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
      },
      body: contents
    })
    if (response.status < 200 || response.status >= 300) {
      throw new Error(`Failed to save ${file.name}: HTTP ${response.status}`)
    }
  }

  async function importDocuments (store: Store, baseUrl: string, files: File[], format: 'quiz' | 'survey') {
    const importedQuestions: ImportedQuizQuestion[] = []
    for (const file of files) {
      if (!file.name.toLowerCase().endsWith('.docx')) {
        throw new Error(`${file.name} is not a .docx file`)
      }

      const contents = await file.arrayBuffer()
      const result = await mammoth.extractRawText({ arrayBuffer: contents })
      await saveSourceDocument(store, baseUrl, file, contents)
      importedQuestions.push(...(format === 'quiz'
        ? await generateQuizQuestions(result.value)
        : parseQuestions(result.value)))
    }

    return importedQuestions
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

  async function evaluateShortAnswer (answer: string, expectedAnswers: string[]) {
    const normalizedAnswer = normalizeAnswer(answer)
    const normalizedExpected = expectedAnswers.map(normalizeAnswer).filter(Boolean)
    if (normalizedExpected.includes(normalizedAnswer)) {
      return { correct: true, confidence: 1, method: 'exact' as const }
    }

    if (!normalizedAnswer || normalizedExpected.length === 0) {
      return { correct: false, confidence: 0, method: 'exact' as const }
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

    return {
      correct: confidence >= semanticMatchThreshold,
      confidence,
      method: 'semantic' as const
    }
  }

  return {
    importDocuments,
    ensureSemanticModel,
    evaluateShortAnswer
  }
}

export function loadQuizAiService () {
  servicePromise ??= createService()
  return servicePromise
}
