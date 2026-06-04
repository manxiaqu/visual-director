// 单张生成的编排逻辑（采样 → 组装 → Builder → 出图 → 落地）。
// 从 main.ts 抽出，供 CLI（main.ts）与脚本（scripts/*）共用，避免复制编排代码。

import { resolve } from 'node:path'
import { sampleFace } from './face/blueprint.js'
import { mulberry32, type Rng } from './face/rng.js'
import { sampleSkeleton } from './diversity/skeleton.js'
import type { Theme } from './diversity/themes.js'
import { pushHistory, type History } from './diversity/history.js'
import { buildPrompt } from './prompt-builder.js'
import { guardCoherence } from './coherence.js'
import { generateImage } from './image-generator.js'
import { createRunDir, saveImage, saveJson, saveText } from './storage.js'
import type { GenerationResult, PlanCore, PinnedDims, VisualPlan } from './types.js'

// 在主题的典型年龄区间内按 seed 采一个年轻年龄（用户钉死 age 时直接用）。
// age 不再取自 Planner——同一模糊输入下 Planner 倾向给同一个 age，会让整批同龄不同脸。
export function sampleAge(range: [number, number], rng: Rng): number {
  const [min, max] = range
  return min + Math.floor(rng() * (max - min + 1))
}

// 把意图层 + 指定主题 + 采样的视觉骨架 + 弱化人脸 + 用户碎信息组装成完整方案。
// theme 由调用方决定（用户锁定则全批固定，否则确定性轮换），本函数不再推断主题。
// 同一 rng 序列：先采年龄、再采脸、再采视觉骨架，结果可复现；history 对最近用过的取值降权。
export function assemblePlan(
  core: PlanCore,
  theme: Theme,
  pinned: PinnedDims,
  extras: string[],
  seed: number,
  history: History,
): VisualPlan {
  const rng = mulberry32(seed)
  const age = pinned.age ?? sampleAge(theme.ageRange, rng)
  const face = sampleFace({ age, gender: core.gender }, rng)
  const skeleton = sampleSkeleton(theme, pinned, rng, history)
  // theme/age 以本函数解析的为准，覆盖 Planner 的占位值
  return { ...core, theme: theme.name, age, ...skeleton, face, extras }
}

// 单次生成：采样 → 组装 → Builder 出 Prompt →（可选）出图 → 落地。
export async function runOne(
  userInput: string,
  core: PlanCore,
  theme: Theme,
  pinned: PinnedDims,
  extras: string[],
  seed: number,
  withImage: boolean,
  history: History,
): Promise<void> {
  const sampledPlan = assemblePlan(core, theme, pinned, extras, seed, history)

  // 自洽审查（方案二）：采样后单独调一次 LLM，检测内部打架并最小修正。
  // 下游一律用修正后的 visualPlan；coherence 报告存盘便于排查"这张为什么这样"。
  const { plan: visualPlan, report: coherence } = await guardCoherence(sampledPlan, pinned)
  if (!coherence.ok) {
    console.log(`[seed ${seed}] 自洽修正:`, coherence.changes.map((c) => `${c.field} ${c.from}→${c.to}`).join(' | '))
  }

  // 把本张【修正后】采到的视觉维度记入历史（按真实渲染内容去重）
  pushHistory(history, {
    scene: visualPlan.scene,
    shot: visualPlan.shot,
    lighting: visualPlan.lighting,
    pose: visualPlan.pose,
    clothes: visualPlan.clothes,
    hair: visualPlan.hair,
  })

  console.log(`\n[seed ${seed}] 人脸:`, JSON.stringify(visualPlan.face))
  console.log(
    `[seed ${seed}] 视觉骨架: 主题=${visualPlan.theme} | age=${visualPlan.age} | 发型=${visualPlan.hair} | 妆=${visualPlan.makeup}` +
      ` | 场景=${visualPlan.scene} | 景别=${visualPlan.shot}/${visualPlan.angle} | 光线=${visualPlan.lighting}` +
      ` | 姿势=${visualPlan.pose} | 服装=${visualPlan.clothes_color}的${visualPlan.clothes}` +
      (extras.length ? ` | extras=${extras.join('/')}` : ''),
  )

  const prompt = await buildPrompt(visualPlan)
  console.log(`[seed ${seed}] Prompt:`, prompt)

  const dir = createRunDir()
  saveJson(dir, 'visual-plan.json', visualPlan)
  saveJson(dir, 'coherence.json', coherence) // 采样原值 + 自洽修正记录，排查用
  saveJson(dir, 'blueprint.json', { seed, face: visualPlan.face })
  saveText(dir, 'prompt.txt', prompt)

  const meta: GenerationResult = {
    userInput,
    createdAt: new Date().toISOString(),
    seed,
    plan: visualPlan,
    prompt,
  }

  if (withImage) {
    console.log(`[seed ${seed}] 调用即梦生成图片...`)
    const image = await generateImage(prompt)
    meta.imagePath = saveImage(dir, image.bytes)
    meta.sourceUrl = image.sourceUrl
    meta.contentType = image.contentType
    meta.model = image.request.model
    meta.imageSeed = image.seed
    saveJson(dir, 'fal-request.json', image.request)
    saveJson(dir, 'fal-response.json', image.response)
    console.log(`[seed ${seed}] 即梦出图 seed:`, image.seed ?? '(返回未带 seed)')
  }

  saveJson(dir, 'meta.json', meta)
  console.log(`[seed ${seed}] 产物目录:`, resolve(dir))
}
