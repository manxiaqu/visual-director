import { fal } from '@fal-ai/client'
import { config } from './config.js'

let configured = false

function ensureConfigured(): void {
  if (configured) return
  fal.config({ credentials: config.fal.apiKey })
  configured = true
}

interface FalImage {
  url: string
  content_type?: string
}

interface FalImageResult {
  images?: FalImage[]
  image?: FalImage
  seed?: number
}

export interface FalRequest {
  model: string
  input: Record<string, unknown>
}

export interface GeneratedImage {
  bytes: Buffer
  contentType: string
  sourceUrl: string
  request: FalRequest
  response: unknown
  seed?: number
}

export async function generateImage(prompt: string, negativePrompt = ''): Promise<GeneratedImage> {
  ensureConfigured()

  const input: Record<string, unknown> = {
    prompt,
    image_size: config.fal.imageSize,
  }
  if (negativePrompt.trim() !== '') {
    input.negative_prompt = negativePrompt.trim()
  }

  const { data } = await fal.subscribe(config.fal.model, {
    input,
    logs: false,
  }) as { data: FalImageResult }

  const image = data.images?.[0] ?? data.image
  if (!image?.url) {
    throw new Error(`fal.ai 返回未包含图片 URL: ${JSON.stringify(data).slice(0, 300)}`)
  }

  const response = await fetch(image.url)
  if (!response.ok) {
    throw new Error(`下载图片失败: ${response.status} ${response.statusText}`)
  }
  const arrayBuf = await response.arrayBuffer()

  return {
    bytes: Buffer.from(arrayBuf),
    contentType: image.content_type ?? response.headers.get('content-type') ?? 'image/png',
    sourceUrl: image.url,
    request: { model: config.fal.model, input },
    response: data,
    seed: typeof data.seed === 'number' ? data.seed : undefined,
  }
}
