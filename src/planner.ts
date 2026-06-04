import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import OpenAI from 'openai'
import { config } from './config.js'
import { debugLLMCall } from './debug.js'
import type { PlannerResult, PlannerOutput, UnsupportedOutput, PlanCore, PinnedDims } from './types.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const SYSTEM_PROMPT_PATH = join(__dirname, 'prompts', 'planner.system.md')

// 每次读取，便于不重启迭代 system prompt
function loadSystemPrompt(): string {
  return readFileSync(SYSTEM_PROMPT_PATH, 'utf-8')
}

const client = new OpenAI({
  apiKey: config.deepseek.apiKey,
  baseURL: config.deepseek.baseURL,
})

// Planner 已瘦身为「意图层」：只识别主题 + 年龄等，视觉细节交给主题引擎/采样器，
// prompt 交给 Builder。故只校验意图层字段。
const PLAN_FIELDS: Array<keyof PlanCore> = ['theme', 'age', 'gender', 'mood', 'visual_keywords']

// pinned 全维度（不丢用户信息）。宽松解析：模型多塞字段也不报错，按需取用。
const PINNED_KEYS: Array<keyof PinnedDims> = [
  'theme',
  'gender',
  'age',
  'hair',
  'makeup',
  'clothes',
  'clothes_color',
  'scene',
  'lighting',
  'pose',
  'expression',
  'shot',
  'angle',
  'style',
]

function extractPinned(record: Record<string, unknown>): PinnedDims {
  const raw = record.pinned
  if (!raw || typeof raw !== 'object') return {}
  const src = raw as Record<string, unknown>
  const pinned: PinnedDims = {}
  for (const key of PINNED_KEYS) {
    const v = src[key]
    if (v === undefined || v === null || v === '') continue
    if (key === 'age') {
      if (typeof v === 'number') pinned.age = v
    } else if (typeof v === 'string') {
      pinned[key] = v as never
    }
  }
  return pinned
}

// 抽取 extras：用户说了、但不归任何已知维度的碎信息。宽松：取字符串数组项。
function extractExtras(record: Record<string, unknown>): string[] {
  const raw = record.extras
  if (!Array.isArray(raw)) return []
  return raw.filter((x): x is string => typeof x === 'string' && x.trim() !== '').map((x) => x.trim())
}

function isUnsupportedShape(obj: Record<string, unknown>): boolean {
  return obj.unsupported === true
}

// 校验解析后的对象是否符合 PlannerResult 结构；不符合则抛错触发重试
function validate(obj: unknown): PlannerResult {
  if (!obj || typeof obj !== 'object') {
    throw new Error('返回不是 JSON 对象')
  }
  const record = obj as Record<string, unknown>

  if (isUnsupportedShape(record)) {
    const reason = typeof record.reason === 'string' ? record.reason : '当前版本仅支持人物题材。'
    return { unsupported: true, reason } satisfies UnsupportedOutput
  }

  const plan = record.plan
  if (!plan || typeof plan !== 'object') {
    throw new Error('缺少合法的 plan 字段')
  }

  const planRecord = plan as Record<string, unknown>
  for (const field of PLAN_FIELDS) {
    if (planRecord[field] === undefined || planRecord[field] === null) {
      throw new Error(`plan 缺少字段: ${field}`)
    }
  }
  if (typeof planRecord.age !== 'number') {
    throw new Error('plan.age 必须是 number')
  }
  if (!Array.isArray(planRecord.visual_keywords)) {
    throw new Error('plan.visual_keywords 必须是数组')
  }

  return {
    plan: planRecord as unknown as PlanCore,
    pinned: extractPinned(record),
    extras: extractExtras(record),
  } satisfies PlannerOutput
}

interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

async function callDeepSeek(label: string, messages: ChatMessage[]): Promise<string> {
  const completion = await client.chat.completions.create({
    model: config.deepseek.model,
    response_format: { type: 'json_object' },
    temperature: 0.7,
    messages,
  })
  const content = completion.choices[0]?.message?.content
  if (!content) {
    throw new Error('DeepSeek 返回空内容')
  }
  // debug 模式下打印本次调用的完整输入与输出
  debugLLMCall(
    label,
    { model: config.deepseek.model, temperature: 0.7, response_format: 'json_object' },
    messages,
    content,
  )
  return content
}

function parseAndValidate(raw: string): PlannerResult {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch (err) {
    throw new Error(`JSON 解析失败: ${(err as Error).message}`)
  }
  return validate(parsed)
}

export async function plan(userInput: string): Promise<PlannerResult> {
  const systemPrompt = loadSystemPrompt()
  const messages: ChatMessage[] = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userInput },
  ]

  const firstRaw = await callDeepSeek('Planner', messages)
  try {
    return parseAndValidate(firstRaw)
  } catch (firstErr) {
    // 把上一轮非法输出 + 错误回灌，要求严格重出；仅重试一次
    const retryMessages: ChatMessage[] = [
      ...messages,
      { role: 'assistant', content: firstRaw },
      {
        role: 'user',
        content:
          `你上一轮的输出不是合法的目标 JSON，错误是：${(firstErr as Error).message}。` +
          '请严格按 system prompt 的格式只返回一个 JSON 对象，不要任何额外文字。',
      },
    ]
    const retryRaw = await callDeepSeek('Planner（重试）', retryMessages)
    return parseAndValidate(retryRaw)
  }
}
