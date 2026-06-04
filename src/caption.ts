// 文案生成：把一组精选图的视觉要点 → DeepSeek → 平台风格文案（标题/正文/标签）。
// system prompt 在 prompts/caption.system.md，便于不重启迭代口径。

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import OpenAI from 'openai'
import { config } from './config.js'
import { debugLLMCall } from './debug.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const SYSTEM_PROMPT_PATH = join(__dirname, 'prompts', 'caption.system.md')

function loadSystemPrompt(): string {
  return readFileSync(SYSTEM_PROMPT_PATH, 'utf-8')
}

const client = new OpenAI({ apiKey: config.deepseek.apiKey, baseURL: config.deepseek.baseURL })

export interface CaptionInput {
  theme: string
  count: number // 总生成张数
  picked: number // 精选张数
  highlights: string[] // 从精选图归纳的视觉要点
  note?: string // 本轮踩坑/心得，可空
}

export interface Caption {
  title: string
  body: string
  tags: string[]
}

export async function generateCaption(input: CaptionInput): Promise<Caption> {
  const messages = [
    { role: 'system' as const, content: loadSystemPrompt() },
    { role: 'user' as const, content: JSON.stringify(input, null, 2) },
  ]
  const completion = await client.chat.completions.create({
    model: config.deepseek.model,
    response_format: { type: 'json_object' },
    temperature: 0.8,
    messages,
  })
  const content = completion.choices[0]?.message?.content ?? ''
  debugLLMCall(
    'Caption',
    { model: config.deepseek.model, temperature: 0.8, response_format: 'json_object' },
    messages,
    content,
  )

  try {
    const parsed = JSON.parse(content) as Record<string, unknown>
    return {
      title: typeof parsed.title === 'string' ? parsed.title : '',
      body: typeof parsed.body === 'string' ? parsed.body : '',
      tags: Array.isArray(parsed.tags) ? parsed.tags.filter((t): t is string => typeof t === 'string') : [],
    }
  } catch {
    // 解析失败兜底：直接拼一段，保证打包流程不断
    return fallbackCaption(input)
  }
}

function fallbackCaption(input: CaptionInput): Caption {
  const hl = input.highlights.join('、')
  return {
    title: `今天试了「${input.theme}」`,
    body:
      `用 Agent 跑了 ${input.count} 张，精选 ${input.picked} 张。` +
      `${hl ? '观察：' + hl + '。' : ''}${input.note ? input.note + '。' : ''}你觉得哪张最好看？`,
    tags: ['AI绘画', 'AI写真', '即梦', '氛围感', '胶片感', input.theme],
  }
}
