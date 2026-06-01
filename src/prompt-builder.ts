import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import OpenAI from 'openai'
import { config } from './config.js'
import { debugLLMCall } from './debug.js'
import type { VisualPlan } from './types.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const SYSTEM_PROMPT_PATH = join(__dirname, 'prompts', 'builder.system.md')

// 每次读取，便于不重启迭代 system prompt
function loadSystemPrompt(): string {
  return readFileSync(SYSTEM_PROMPT_PATH, 'utf-8')
}

const client = new OpenAI({
  apiKey: config.deepseek.apiKey,
  baseURL: config.deepseek.baseURL,
})

const MAX_PROMPT_LEN = 150
const charLen = (s: string): number => [...s].length

// 清理模型偶发的包裹：代码块围栏、首尾引号、「Prompt：」之类前缀
function cleanup(text: string): string {
  let out = text.trim()
  out = out
    .replace(/^```[a-zA-Z]*\n?/, '')
    .replace(/```$/, '')
    .trim()
  out = out
    .replace(/^["'「『]+/, '')
    .replace(/["'」』]+$/, '')
    .trim()
  out = out.replace(/^(Prompt|提示词|结果)[：:]\s*/i, '').trim()
  return out
}

// 兜底 Prompt：LLM 失败时用采样结果直拼一段，保证主流程不断、采样到的脸不丢。
function fallbackPrompt(plan: VisualPlan): string {
  const { face, hair_blueprint: hair } = plan
  const featurePart = face.feature ? `，${face.feature}` : ''
  // Face First：脸写在最前
  return (
    `${face.face_shape}、${face.eyes}、${face.brows}、${face.skin}${featurePart}的` +
    `${plan.age}岁中国${plan.occupation || plan.gender}，${plan.temperament}气质，` +
    `${hair.length}${hair.texture}，身着${plan.clothes_color}的${plan.clothes}，${plan.pose}，` +
    `置身${plan.scene}${plan.environment}，${plan.lighting}，${plan.expression}，` +
    `${plan.mood}，${plan.style}，真实皮肤质感，原相机直出，双手结构自然，身体比例匀称`
  )
}

// 长度兜底：Builder 偶尔超 150 字（尤其富主题）。超了就压缩一次——
// 严格保留脸/身份/服装配色，优先砍场景/光线/摄影辞藻，确保 ≤150 而不伤核心信息。
async function compressPrompt(prompt: string): Promise<string> {
  const system =
    '你是中文图片 Prompt 压缩器。把下面这段压到 150 字以内（目标 130 左右），只删次要信息。' +
    '严格保留：年龄、职业、中国人身份、脸型、眼型、眉型、肤色、核心特征、发型、服装与配色，且脸放最前。' +
    '优先删除：场景与环境细节、构图与摄影术语，以及「电影感/高级感/故事感/氛围感/高级灰/通透肤色/空气感」这类空泛辞藻。' +
    '只输出压缩后的那一段中文，纯文本，无解释、无引号、无前缀。'
  const messages = [
    { role: 'system' as const, content: system },
    { role: 'user' as const, content: prompt },
  ]
  const completion = await client.chat.completions.create({
    model: config.deepseek.model,
    temperature: 0.3,
    messages,
  })
  const content = completion.choices[0]?.message?.content ?? ''
  debugLLMCall('Prompt Builder（压缩）', { model: config.deepseek.model, temperature: 0.3 }, messages, content)
  const compressed = cleanup(content)
  // 压缩失败或反而更长，则保留原文（宁可略超也不丢内容）
  return compressed !== '' && charLen(compressed) < charLen(prompt) ? compressed : prompt
}

// 把完整方案（含采样到的 face / hair）改写成交给即梦的中文自然语言 Prompt。
// system prompt 强约束：忠实采样结果、禁止美化覆盖、禁 tag 堆砌、硬上限 150 字。
export async function buildPrompt(plan: VisualPlan): Promise<string> {
  const systemPrompt = loadSystemPrompt()
  const messages = [
    { role: 'system' as const, content: systemPrompt },
    { role: 'user' as const, content: JSON.stringify(plan, null, 2) },
  ]
  const completion = await client.chat.completions.create({
    model: config.deepseek.model,
    temperature: 0.7,
    messages,
  })

  const content = completion.choices[0]?.message?.content ?? ''
  // debug 模式下打印本次调用的完整输入与输出
  debugLLMCall('Prompt Builder', { model: config.deepseek.model, temperature: 0.7 }, messages, content)
  const built = content ? cleanup(content) : ''
  let result = built === '' ? fallbackPrompt(plan) : built
  // 硬上限兜底：超 150 字压缩一次
  if (charLen(result) > MAX_PROMPT_LEN) {
    result = await compressPrompt(result)
  }
  return result
}
