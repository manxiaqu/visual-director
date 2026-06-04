// 自洽审查守卫（方案二）：采样后单独调一次 DeepSeek，检测视觉方案内部"打架"并最小修正。
// 修正后的方案会被存盘（visual-plan.json 反映真实渲染内容），并产出 coherence.json 便于排查。
//
// 护栏：① 最小改动；② 场景优先（永不改 scene）；③ 不动 pinned；④ 罕见≠冲突（保多样）。
// 失败兜底：LLM 出错/解析失败 → 原样返回，不阻断主流程（fail-open）。
// 关闭：设环境变量 VD_NO_GUARD=1 可跳过本步（省一次调用）。

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import OpenAI from 'openai'
import { config } from './config.js'
import { debugLLMCall } from './debug.js'
import type { VisualPlan, PinnedDims } from './types.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const SYSTEM_PROMPT_PATH = join(__dirname, 'prompts', 'coherence.system.md')

function loadSystemPrompt(): string {
  return readFileSync(SYSTEM_PROMPT_PATH, 'utf-8')
}

const client = new OpenAI({ apiKey: config.deepseek.apiKey, baseURL: config.deepseek.baseURL })

// 可被守卫改动的维度（不含 scene——场景是锚，永不改）
const MUTABLE: Array<keyof VisualPlan> = [
  'lighting',
  'pose',
  'shot',
  'angle',
  'clothes',
  'clothes_color',
  'expression',
  'hair',
  'makeup',
]

export interface CoherenceChange {
  field: string
  from: string
  to: string
  reason: string
}

export interface CoherenceReport {
  ok: boolean // true = 无冲突/未改
  changes: CoherenceChange[]
  // 采样原值（修正前），便于排查"这张为什么这样"
  sampled: Record<string, string>
}

function sampledSnapshot(plan: VisualPlan): Record<string, string> {
  const snap: Record<string, string> = { scene: plan.scene }
  for (const f of MUTABLE) snap[f] = String(plan[f] ?? '')
  return snap
}

// 采样后审查并最小修正。返回修正后的 plan + 报告（无论是否改动都返回 sampled 快照）。
export async function guardCoherence(
  plan: VisualPlan,
  pinned: PinnedDims,
): Promise<{ plan: VisualPlan; report: CoherenceReport }> {
  const sampled = sampledSnapshot(plan)
  const noop: CoherenceReport = { ok: true, changes: [], sampled }

  if (process.env.VD_NO_GUARD === '1') return { plan, report: noop }

  const locked = Object.keys(pinned)
  const input = {
    theme: plan.theme,
    scene: plan.scene,
    lighting: plan.lighting,
    pose: plan.pose,
    shot: plan.shot,
    angle: plan.angle,
    clothes: plan.clothes,
    clothes_color: plan.clothes_color,
    expression: plan.expression,
    hair: plan.hair,
    makeup: plan.makeup,
    locked,
  }

  const messages = [
    { role: 'system' as const, content: loadSystemPrompt() },
    { role: 'user' as const, content: JSON.stringify(input, null, 2) },
  ]

  let content = ''
  try {
    const completion = await client.chat.completions.create({
      model: config.deepseek.model,
      response_format: { type: 'json_object' },
      temperature: 0.3, // 偏低，判断更稳定
      messages,
    })
    content = completion.choices[0]?.message?.content ?? ''
  } catch {
    return { plan, report: noop } // 调用失败 → 原样放行
  }
  debugLLMCall(
    'Coherence Guard',
    { model: config.deepseek.model, temperature: 0.3, response_format: 'json_object' },
    messages,
    content,
  )

  let parsed: Record<string, unknown>
  try {
    parsed = JSON.parse(content) as Record<string, unknown>
  } catch {
    return { plan, report: noop } // 解析失败 → 原样放行
  }

  const rawChanges = Array.isArray(parsed.changes) ? parsed.changes : []
  const changes: CoherenceChange[] = []
  const next: VisualPlan = { ...plan }

  for (const raw of rawChanges) {
    if (!raw || typeof raw !== 'object') continue
    const c = raw as Record<string, unknown>
    const field = typeof c.field === 'string' ? c.field : ''
    const to = typeof c.to === 'string' ? c.to.trim() : ''
    if (field === '' || to === '') continue
    if (!MUTABLE.includes(field as keyof VisualPlan)) continue // 只允许可改维度（排除 scene 等）
    if (locked.includes(field)) continue // 守住 pinned：锁定维度绝不改
    const from = String(plan[field as keyof VisualPlan] ?? '')
    if (from === to) continue
    ;(next as unknown as Record<string, unknown>)[field] = to
    changes.push({ field, from, to, reason: typeof c.reason === 'string' ? c.reason : '' })
  }

  // shot / angle 变了，重算派生的 composition
  if (changes.some((c) => c.field === 'shot' || c.field === 'angle')) {
    next.composition = `${next.shot}，${next.angle}`
  }

  return { plan: next, report: { ok: changes.length === 0, changes, sampled } }
}
