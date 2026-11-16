import type { NormalizedSourceBlock, NormalizedSourceDocument } from './quizAiService'
import { normalizeSidecarEndpoint } from './sidecarEndpoint'
import { appServicesFetch } from './appServicesFetch'

export const MAX_VISION_FILE_BYTES = 25 * 1024 * 1024

export interface VisionSidecarClientOptions {
  /** Base URL for the server-side OCR/vision service. */
  endpoint: string
  fetch?: typeof globalThis.fetch
}

export class VisionSidecarError extends Error {
  constructor (
    message: string,
    readonly code: 'network' | 'http' | 'malformed' | 'payload',
    readonly status?: number
  ) {
    super(message)
    this.name = 'VisionSidecarError'
  }
}

function isSourceBlock (value: unknown): value is NormalizedSourceBlock {
  if (!value || typeof value !== 'object') return false
  const block = value as Record<string, unknown>
  return (
    (block.kind === 'heading' || block.kind === 'paragraph' || block.kind === 'list' ||
      block.kind === 'table' || block.kind === 'notes') &&
    typeof block.text === 'string' &&
    typeof block.sourceDocument === 'string' &&
    typeof block.mediaType === 'string' &&
    Array.isArray(block.warnings) &&
    block.warnings.every(warning => typeof warning === 'string') &&
    (block.page === undefined || Number.isInteger(block.page)) &&
    (block.slide === undefined || Number.isInteger(block.slide))
  )
}

function isNormalizedSourceDocument (value: unknown): value is NormalizedSourceDocument {
  if (!value || typeof value !== 'object') return false
  const document = value as Record<string, unknown>
  return (
    typeof document.name === 'string' &&
    typeof document.mediaType === 'string' &&
    Array.isArray(document.blocks) &&
    document.blocks.every(isSourceBlock) &&
    Array.isArray(document.warnings) &&
    document.warnings.every(warning => typeof warning === 'string')
  )
}

async function responseMessage (response: Response): Promise<string> {
  try {
    const body = await response.json() as { message?: unknown }
    return typeof body.message === 'string'
      ? body.message
      : `Vision sidecar request failed with HTTP ${response.status}`
  } catch {
    return `Vision sidecar request failed with HTTP ${response.status}`
  }
}

export class VisionSidecarClient {
  private readonly url: string
  private readonly requestFetch: typeof globalThis.fetch

  constructor (options: VisionSidecarClientOptions) {
    this.url = `${normalizeSidecarEndpoint(options.endpoint, 'Vision sidecar')}/api/extract/vision`
    this.requestFetch = options.fetch ?? appServicesFetch(options.endpoint)
  }

  async extract (file: Pick<File, 'name' | 'type'>, contents: ArrayBuffer): Promise<NormalizedSourceDocument> {
    if (contents.byteLength > MAX_VISION_FILE_BYTES) {
      throw new VisionSidecarError(
        `The source file exceeds the ${MAX_VISION_FILE_BYTES}-byte vision import limit.`,
        'payload'
      )
    }
    const form = new FormData()
    form.append('file', new Blob([contents], { type: file.type || 'application/octet-stream' }), file.name)
    let response: Response
    try {
      response = await this.requestFetch(this.url, { method: 'POST', body: form })
    } catch (error) {
      throw new VisionSidecarError(
        error instanceof Error ? error.message : 'Unable to reach vision sidecar',
        'network'
      )
    }
    if (!response.ok) {
      throw new VisionSidecarError(await responseMessage(response), 'http', response.status)
    }
    let body: unknown
    try {
      body = await response.json()
    } catch {
      throw new VisionSidecarError('Vision sidecar returned invalid JSON', 'malformed', response.status)
    }
    if (!isNormalizedSourceDocument(body)) {
      throw new VisionSidecarError('Vision sidecar returned a malformed source document', 'malformed', response.status)
    }
    return body
  }
}
