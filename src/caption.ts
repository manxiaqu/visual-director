// 文案生成：把一组精选图的视觉要点 → DeepSeek → 中英双版文案（各含标题/正文/标签）。
// 中文走小红书实验室口径，英文走 X/国际口径（自带 AI generated 声明 + 英文 hashtag）。
// 发哪个平台、用哪版文案是发布时人工决定的。system prompt 在 prompts/caption.system.md。

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import OpenAI from 'openai'
import { config } from './config.js'
import { debugLLMCall } from './debug.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const SYSTEM_PROMPT_PATH = join(__dirname, 'prompts', 'caption.system.md')
const TITLE_SYSTEM_PROMPT_PATH = join(__dirname, 'prompts', 'caption-title.system.md')

function loadSystemPrompt(): string {
  return readFileSync(SYSTEM_PROMPT_PATH, 'utf-8')
}

function loadTitleSystemPrompt(): string {
  return readFileSync(TITLE_SYSTEM_PROMPT_PATH, 'utf-8')
}

const client = new OpenAI({ apiKey: config.deepseek.apiKey, baseURL: config.deepseek.baseURL })

export interface CaptionInput {
  theme: string
  count: number // 总生成张数
  picked: number // 精选张数
  highlights: string[] // 从精选图归纳的视觉要点
  note?: string // 本轮踩坑/心得，可空
}

// 单语版本（中文或英文各一份）。
export interface CaptionVariant {
  title: string
  body: string
  tags: string[]
}

export interface Caption {
  zh: CaptionVariant // 小红书实验室口径
  en: CaptionVariant // X / 国际口径
}

function parseVariant(v: unknown): CaptionVariant {
  const o = (v ?? {}) as Record<string, unknown>
  return {
    title: typeof o.title === 'string' ? o.title : '',
    body: typeof o.body === 'string' ? o.body : '',
    tags: Array.isArray(o.tags) ? o.tags.filter((t): t is string => typeof t === 'string') : [],
  }
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
    const zh = parseVariant(parsed.zh)
    const en = parseVariant(parsed.en)
    // 任一版正文为空视为输出不可用，整体兜底，保证打包流程不断
    if (!zh.body || !en.body) return fallbackCaption(input)
    return { zh, en }
  } catch {
    return fallbackCaption(input)
  }
}

// 「同一 prompt 批量」模式专用文案：标题由 DeepSeek 起一个总结性名字，
// 中英两版正文都直接是那条出图 prompt（不再写实验感文案）。
export interface PromptCaptionInput {
  theme: string
  prompt: string // 本组图统一使用的中文出图 prompt
}

export async function generatePromptCaption(input: PromptCaptionInput): Promise<Caption> {
  // 账号固定标识 tag（识别度）+ 主题；内容关键词由 DeepSeek 从 prompt 提取后追加。
  const baseTags = ['AI绘画', 'AI写真', '即梦', input.theme]
  const enTags = ['AIart', 'AIgenerated', 'AIgirl', '即梦']

  let title = ''
  let contentTags: string[] = []
  const messages = [
    { role: 'system' as const, content: loadTitleSystemPrompt() },
    { role: 'user' as const, content: JSON.stringify(input, null, 2) },
  ]
  try {
    const completion = await client.chat.completions.create({
      model: config.deepseek.model,
      response_format: { type: 'json_object' },
      temperature: 0.8,
      messages,
    })
    const content = completion.choices[0]?.message?.content ?? ''
    debugLLMCall(
      'CaptionTitle',
      { model: config.deepseek.model, temperature: 0.8, response_format: 'json_object' },
      messages,
      content,
    )
    const parsed = JSON.parse(content) as Record<string, unknown>
    if (typeof parsed.title === 'string') title = parsed.title.trim()
    if (Array.isArray(parsed.tags)) {
      contentTags = parsed.tags
        .filter((t): t is string => typeof t === 'string')
        .map((t) => t.trim().replace(/^#+/, '').replace(/\s+/g, ''))
        .filter((t) => t.length > 0)
    }
  } catch {
    // 起标题/取标签失败不致命：title 下面兜底成主题名，tags 退回 baseTags
  }
  if (!title) title = `「${input.theme}」`

  // 固定标识 tag + 从 prompt 提取的内容关键词，去重（保持顺序：固定在前，内容在后）。
  const tags = [...new Set([...baseTags, ...contentTags])]

  // 中英两版正文都直接是出图 prompt；英文版无标题（推特无标题）。
  return {
    zh: { title, body: input.prompt, tags },
    en: { title: '', body: input.prompt, tags: enTags },
  }
}

function fallbackCaption(input: CaptionInput): Caption {
  const hlZh = input.highlights.join('、')
  const hlEn = input.highlights.join(', ')
  return {
    zh: {
      title: `今天试了「${input.theme}」`,
      body:
        `用 Agent 跑了 ${input.count} 张，精选 ${input.picked} 张。` +
        `${hlZh ? '观察：' + hlZh + '。' : ''}${input.note ? input.note + '。' : ''}你觉得哪张最好看？`,
      tags: ['AI绘画', 'AI写真', '即梦', '氛围感', '胶片感', input.theme],
    },
    en: {
      title: '',
      body:
        `AI-generated portraits — "${input.theme}". ${input.picked}/${input.count} picked.` +
        `${hlEn ? ' Notes: ' + hlEn + '.' : ''} Which one looks best?`,
      tags: ['AIart', 'AIgenerated', 'AIgirl', '即梦'],
    },
  }
}

// 把中英双版渲染成 caption.md（pack / backfill 共用）。中文段在前（小红书），英文段在后（X）。
export function captionToMarkdown(caption: Caption): string {
  const section = (v: CaptionVariant): string => {
    const tagLine = v.tags.map((t) => `#${t}`).join(' ')
    return (v.title ? `**${v.title}**\n\n` : '') + `${v.body}\n\n${tagLine}\n`
  }
  return `## 中文（小红书）\n\n${section(caption.zh)}\n---\n\n## English（X / 推特）\n\n${section(caption.en)}`
}
