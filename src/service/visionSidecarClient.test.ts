import { describe, expect, it, vi } from 'vitest'
import { MAX_VISION_FILE_BYTES, VisionSidecarClient } from './visionSidecarClient'

const sourceDocument = {
  name: 'scan.pdf',
  mediaType: 'application/pdf',
  blocks: [{
    kind: 'paragraph',
    text: 'What is photosynthesis?',
    sourceDocument: 'scan.pdf',
    mediaType: 'application/pdf',
    page: 1,
    warnings: []
  }],
  warnings: []
}

describe('VisionSidecarClient', () => {
  it('rejects disabled endpoints and oversized files before making requests', async () => {
    expect(() => new VisionSidecarClient({ endpoint: '' })).toThrow('endpoint is disabled')
    const fetch = vi.fn()
    const client = new VisionSidecarClient({ endpoint: 'https://vision.example.test', fetch })
    await expect(client.extract(
      { name: 'large.pdf', type: 'application/pdf' },
      new ArrayBuffer(MAX_VISION_FILE_BYTES + 1)
    )).rejects.toMatchObject({ code: 'payload' })
    expect(fetch).not.toHaveBeenCalled()
  })

  it('sends the source file to the server-side vision boundary and returns normalized blocks', async () => {
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify(sourceDocument), { status: 200 }))
    const client = new VisionSidecarClient({ endpoint: 'https://vision.example.test/', fetch })

    await expect(client.extract(
      { name: 'scan.pdf', type: 'application/pdf' },
      new TextEncoder().encode('pdf bytes').buffer
    )).resolves.toEqual(sourceDocument)

    expect(fetch).toHaveBeenCalledWith(
      'https://vision.example.test/api/extract/vision',
      expect.objectContaining({ method: 'POST', body: expect.any(FormData) })
    )
  })

  it('rejects malformed normalized source documents', async () => {
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      name: 'scan.pdf',
      mediaType: 'application/pdf',
      blocks: [{ kind: 'paragraph', text: 'missing provenance' }],
      warnings: []
    }), { status: 200 }))
    const client = new VisionSidecarClient({ endpoint: 'https://vision.example.test', fetch })

    await expect(client.extract({ name: 'scan.pdf', type: 'application/pdf' }, new ArrayBuffer(0)))
      .rejects.toMatchObject({ code: 'malformed' })
  })
})
