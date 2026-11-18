import { appServicesFetch } from './appServicesFetch'

export interface GeneratedEnglishPrompt {
  id: string
  title: string
  prompt: string
  suggestedWordRange: string
  suggestedMinutes: string
  writingType: string
  skills: string[]
  rubric: Array<{ criterion: string, description: string }>
}

interface PromptGenerationResponse {
  prompts: Array<Omit<GeneratedEnglishPrompt, 'id' | 'prompt' | 'suggestedWordRange' | 'suggestedMinutes'> & {
    instruction: string
    suggestedWordCount: string
  }>
}

export class EnglishPromptGenerationClient {
  private readonly url: string
  private readonly requestFetch: typeof globalThis.fetch

  constructor (options: { endpoint: string, fetch?: typeof globalThis.fetch }) {
    this.url = `${options.endpoint.replace(/\/+$/, '')}/api/generate/english-prompts`
    this.requestFetch = options.fetch ?? appServicesFetch(options.endpoint)
  }

  async generate (input: {
    yearLevel: number
    curriculum: string
    subject: string
    writingType: 'paragraph' | 'essay'
    topic: string
    difficulty: 'easy' | 'medium' | 'hard'
    wordCount: { min: number, max: number }
    count: number
  }): Promise<GeneratedEnglishPrompt[]> {
    const response = await this.requestFetch(this.url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input)
    })
    if (!response.ok) {
      throw new Error(`Prompt generation failed with HTTP ${response.status}`)
    }
    const result = await response.json() as PromptGenerationResponse
    if (!Array.isArray(result.prompts) || result.prompts.length === 0) {
      throw new Error('Prompt generation returned no prompts.')
    }
    return result.prompts.map((prompt, index) => ({
      id: `generated-${Date.now()}-${index}`,
      title: prompt.title,
      prompt: prompt.instruction,
      suggestedWordRange: prompt.suggestedWordCount,
      suggestedMinutes: '10–20 minutes',
      writingType: prompt.writingType,
      skills: prompt.skills,
      rubric: prompt.rubric
    }))
  }
}
