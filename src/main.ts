import { resolve } from 'node:path'
import { plan } from './planner.js'
import { sampleBlueprint } from './face/blueprint.js'
import { mulberry32 } from './face/rng.js'
import { buildPrompt } from './prompt-builder.js'
import { generateImage } from './image-generator.js'
import { createRunDir, saveImage, saveJson, saveText } from './storage.js'
import { isUnsupported } from './types.js'
import type { GenerationResult, PlanCore, VisualPlan } from './types.js'

function printUsage(): void {
  console.error('Usage: npm start "<你的图片需求>" [-- --image] [--seed <n>] [--batch <N>] [--debug]')
  console.error('示例: npm start "生成一个美女"                       # 只产出 Plan + 采样 + Prompt，不出图')
  console.error('示例: npm start "生成一个美女" -- --image            # 完整流程，调用即梦出图')
  console.error('示例: npm start "高知女性" -- --batch 6 --seed 1     # 同主题重走 6 遍，得 6 个不同的人')
  console.error('示例: npm start "高知女性" -- --debug                # 打印每次大模型调用的输入与输出')
  console.error('注意: 通过 npm 传参数必须加 `--` 分隔，否则会被 npm 吞掉')
}

interface Args {
  userInput: string
  withImage: boolean
  seed?: number
  batch: number
  debug: boolean
  occupations?: string[] // --occupations：batch 时按此列表逐张强制不同职业（展示用）
}

function parseArgs(argv: string[]): Args | null {
  let userInput = ''
  let withImage = false
  let seed: number | undefined
  let batch = 1
  let debug = false
  let occupations: string[] | undefined

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === '--image') {
      withImage = true
    } else if (arg === '--debug') {
      debug = true
    } else if (arg === '--seed') {
      seed = Number(argv[++i])
    } else if (arg === '--batch') {
      batch = Math.max(1, Math.floor(Number(argv[++i])))
    } else if (arg === '--occupations') {
      occupations = (argv[++i] ?? '')
        .split(',')
        .map((s) => s.trim())
        .filter((s) => s !== '')
    } else if (!userInput) {
      userInput = arg
    }
  }

  if (!userInput || userInput.trim() === '') return null
  if (seed !== undefined && !Number.isFinite(seed)) seed = undefined
  if (!Number.isFinite(batch)) batch = 1
  if (occupations && occupations.length === 0) occupations = undefined
  return { userInput, withImage, seed, batch, debug, occupations }
}

// 把核心设定 + 采样得到的脸/发组装成完整方案。
// batch 已每张重新规划，Planner 本就给出各异且与职业自洽的年龄（17–24 内），故直接采用，不再二次浮动。
function assemblePlan(core: PlanCore, seed: number): VisualPlan {
  const rng = mulberry32(seed)
  const blueprint = sampleBlueprint({ age: core.age, gender: core.gender, archetype: core.archetype }, rng)
  return { ...core, face: blueprint.face, hair_blueprint: blueprint.hair }
}

// 单次生成：采样 → 组装 → Builder 出 Prompt →（可选）出图 → 落地。
async function runOne(userInput: string, core: PlanCore, seed: number, withImage: boolean): Promise<void> {
  const visualPlan = assemblePlan(core, seed)

  console.log(`\n[seed ${seed}] Face Blueprint:`, JSON.stringify(visualPlan.face))
  console.log(`[seed ${seed}] Hair Blueprint:`, JSON.stringify(visualPlan.hair_blueprint))

  const prompt = await buildPrompt(visualPlan)
  console.log(`[seed ${seed}] Prompt:`, prompt)

  const dir = createRunDir()
  saveJson(dir, 'visual-plan.json', visualPlan)
  saveJson(dir, 'blueprint.json', { seed, face: visualPlan.face, hair: visualPlan.hair_blueprint })
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

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2))
  if (!args) {
    printUsage()
    process.exit(1)
  }
  const { userInput, withImage, batch } = args

  // --debug：让下游 LLM 模块在调用时打印完整输入/输出（通过 VD_DEBUG 传递）
  if (args.debug) process.env.VD_DEBUG = '1'

  console.log('[main] 原始需求:', userInput)
  console.log('[main] 出图模式:', withImage ? '开启（--image）' : '关闭（仅产出 Prompt，加 --image 出图）')
  console.log('[main] 批量数量:', batch, batch > 1 ? '（每张完整重走一遍：重新规划 → 采样 → 出图）' : '')
  console.log('[main] Debug 模式:', args.debug ? '开启（--debug，打印大模型调用 I/O）' : '关闭')

  // 未显式指定 seed 时随机取一个基准 seed；每张用 baseSeed + i 驱动脸/年龄采样，可复现。
  const baseSeed = args.seed ?? Math.floor(Math.random() * 0x7fffffff)
  console.log('[main] 基准 seed:', baseSeed, batch > 1 ? `（每张用 ${baseSeed}..${baseSeed + batch - 1}）` : '')

  let success = 0
  let failed = 0
  for (let i = 0; i < batch; i++) {
    const seed = baseSeed + i
    console.log(`\n========== 第 ${i + 1}/${batch} 张（seed ${seed}）==========`)

    // 每张都重新调一次 Planner——得到不同的职业/服装/场景/年龄，配合按 seed 采样的脸，
    // 实现「同主题下 N 个不同的人」，而非「同一个人换张脸」。
    let result
    try {
      console.log('[planner] 调用 DeepSeek 重新规划...')
      // 优先级：指定了 --occupations 就逐张锁定职业；否则 batch 时给多样化提示
      const fixedOcc = args.occupations ? args.occupations[i % args.occupations.length] : undefined
      const hint = fixedOcc
        ? `[职业固定为「${fixedOcc}」，occupation 字段必须填它；请据此推断自洽的真实年龄、服装、配色与场景]`
        : batch > 1
          ? `[这是同一题材的第 ${i + 1}/${batch} 个人物，请在该 archetype 的职业子类型里选一个与最典型选择不同的具体职业，并换一组不同的服装配色，追求人物之间的多样性]`
          : undefined
      if (fixedOcc) console.log(`[planner] 指定职业：${fixedOcc}`)
      result = await plan(userInput, hint)
    } catch (err) {
      failed++
      console.error(`[seed ${seed}] Planner 失败，已跳过：${(err as Error).message}`)
      continue
    }

    if (isUnsupported(result)) {
      // 同一输入后续必然同样不支持，直接结束整批
      console.log('\n暂不支持：', result.reason)
      return
    }

    console.log(
      `[plan] archetype=${result.plan.archetype} | 职业=${result.plan.occupation} | age=${result.plan.age}` +
        ` | 服装=${result.plan.clothes_color}的${result.plan.clothes} | 场景=${result.plan.scene}`,
    )

    try {
      await runOne(userInput, result.plan, seed, withImage)
      success++
    } catch (err) {
      failed++
      console.error(`[seed ${seed}] 生成失败，已跳过：${(err as Error).message}`)
    }
  }

  console.log(`\n[main] 完成。成功 ${success}/${batch}${failed ? `，失败 ${failed}` : ''}。`)
}

main().catch((err) => {
  console.error('[main] 运行失败:', err)
  process.exit(1)
})
