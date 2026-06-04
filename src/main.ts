import { plan } from './planner.js'
import { themeFor, THEMES } from './diversity/themes.js'
import { loadHistory, emptyHistory, saveHistory } from './diversity/history.js'
import { runOne } from './pipeline.js'
import { isUnsupported } from './types.js'

function printUsage(): void {
  console.error('Usage: npm start "<你的图片需求>" [-- --image] [--seed <n>] [--batch <N>] [--debug]')
  console.error('示例: npm start "生成一个美女"                       # 只产出 Plan + 采样 + Prompt，不出图')
  console.error('示例: npm start "生成一个美女" -- --image            # 完整流程，调用即梦出图')
  console.error('示例: npm start "美女" -- --batch 6 --seed 1         # 模糊输入：逐张轮换不同主题，得 6 张多样的图')
  console.error('示例: npm start "旗袍美女" -- --batch 6              # 锁定主题：同主题下 6 个不同的人')
  console.error('示例: npm start "美女" -- --debug                    # 打印每次大模型调用的输入与输出')
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
  console.log('[main] 批量数量:', batch, batch > 1 ? '（Planner 只解析一次；每张按 seed 重新采样 → 出图）' : '')
  console.log('[main] Debug 模式:', args.debug ? '开启（--debug，打印大模型调用 I/O）' : '关闭')

  // 未显式指定 seed 时随机取一个基准 seed；每张用 baseSeed + i 驱动脸/年龄采样，可复现。
  const baseSeed = args.seed ?? Math.floor(Math.random() * 0x7fffffff)
  console.log('[main] 基准 seed:', baseSeed, batch > 1 ? `（每张用 ${baseSeed}..${baseSeed + batch - 1}）` : '')

  // 可复现性豁免：显式指定 seed → 走纯复现，不读不写 history（降权会破坏「同 seed 同结果」）。
  // 未指定 seed → 启用 history 降权，跨批/跨次运行避免连续撞同一场景/景别/光线。
  const useHistory = args.seed === undefined
  const history = useHistory ? loadHistory() : emptyHistory()
  console.log(
    '[main] 多样性历史:',
    useHistory ? '启用（降权最近用过的场景/景别/光线/姿势/服装）' : '关闭（已指定 seed，纯复现）',
  )

  // Planner 整批只调一次：识别用户钉死维度(pinned) + 碎信息(extras) + 主题是否被用户决定。
  // 主题与年龄等多样性维度交给下游确定性引擎，不再每张重调 Planner（既省钱又不把多样性交给随机）。
  console.log('\n[planner] 调用 DeepSeek 解析需求（整批一次）...')
  let result
  try {
    result = await plan(userInput)
  } catch (err) {
    console.error('[planner] 解析失败，已终止：', (err as Error).message)
    process.exit(1)
  }

  if (isUnsupported(result)) {
    console.log('\n暂不支持：', result.reason)
    return
  }

  const pinned = result.pinned ?? {}
  const extras = result.extras ?? []
  const pinnedKeys = Object.keys(pinned)
  console.log(
    `[plan] 情绪=${result.plan.mood}` +
      (pinnedKeys.length ? ` | 用户钉死=${pinnedKeys.join(',')}` : '') +
      (extras.length ? ` | extras=${extras.join('/')}` : ''),
  )

  // 主题策略：用户锁定主题(pinned.theme) → 全批固定；否则按 seed 确定性轮换 9 个主题，保证整批主题多样。
  const lockedTheme = pinned.theme ? themeFor(pinned.theme) : null
  console.log(
    '[main] 主题策略:',
    lockedTheme ? `锁定「${lockedTheme.name}」（用户指定，全批固定）` : '自动轮换（模糊输入，按 seed 逐张换不同主题）',
  )

  let success = 0
  let failed = 0
  for (let i = 0; i < batch; i++) {
    const seed = baseSeed + i
    // 锁定则固定；否则从 baseSeed 起在 THEMES 上确定性步进，batch≤9 时张张不同主题
    const theme = lockedTheme ?? THEMES[(baseSeed + i) % THEMES.length]
    console.log(`\n========== 第 ${i + 1}/${batch} 张（seed ${seed} · 主题「${theme.name}」）==========`)

    try {
      await runOne(userInput, result.plan, theme, pinned, extras, seed, withImage, history)
      success++
      if (useHistory) saveHistory(history) // 每张采完即持久化，跨次运行也能去重
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
