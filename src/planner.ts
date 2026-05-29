import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import OpenAI from 'openai'
import { config } from './config.js'
import type { PlannerResult, PlannerOutput, UnsupportedOutput, VisualPlan } from './types.js'

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

const PLAN_FIELDS: Array<keyof VisualPlan> = [
  'age',
  'gender',
  'temperament',
  'face',
  'hair',
  'clothes',
  'scene',
  'camera',
  'lighting',
]

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
  const prompt = record.prompt
  if (!plan || typeof plan !== 'object') {
    throw new Error('缺少合法的 plan 字段')
  }
  if (typeof prompt !== 'string' || prompt.trim() === '') {
    throw new Error('缺少合法的 prompt 字段')
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

  return { plan: planRecord as unknown as VisualPlan, prompt: prompt.trim() } satisfies PlannerOutput
}

interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

// 设 DEBUG_PROMPT=1 时，打印实际发给 DeepSeek 的完整 messages，便于针对性调 prompt
function debugPrintMessages(messages: ChatMessage[]): void {
  if (!process.env.DEBUG_PROMPT) return
  console.log('\n========== 发送给 DeepSeek 的 messages ==========')
  console.log('model:', config.deepseek.model, '| temperature: 0.7 | response_format: json_object')
  for (const msg of messages) {
    console.log(`\n----- [${msg.role}] -----`)
    console.log(msg.content)
  }
  console.log('========== messages 结束 ==========\n')
}

async function callDeepSeek(messages: ChatMessage[]): Promise<string> {
  debugPrintMessages(messages)
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

  const firstRaw = await callDeepSeek(messages)
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
    const retryRaw = await callDeepSeek(retryMessages)
    return parseAndValidate(retryRaw)
  }
}
