// 「同一 prompt 批量」一键产线：采一份 plan → 出唯一一个 prompt → 用它出 N 张同 prompt 的图 →
// pick 生成评分表 → pack --prompt-as-body 打包（标题 DeepSeek 总结，正文 = 出图 prompt）。
// 与 go/daily（多样性引擎：每张不同 prompt）并存，互不影响。
//
// 用法：
//   npm run same -- --theme 氛围感 --n 9                  # 锁定主题，同一 prompt 出 9 张变体并打包
//   npm run same -- --theme 古风旗袍 --note "试油纸伞"     # 附一句心得（实际只透传给 pack，本模式正文是 prompt）
//   npm run same -- --theme 氛围感 --n 6 --no-image        # 只出唯一 prompt 预览，不出图不打包
//   npm run same -- --theme 氛围感 --seed 42               # 指定 seed 复现同一份 plan/prompt
//
// 透传给 pack：--note（注：本模式正文固定为 prompt，note 不进正文，仅占位兼容）

import { spawnSync } from 'node:child_process'
import { matchTheme, THEMES, THEME_NAMES, type Theme } from '../src/diversity/themes.js'
import { emptyHistory } from '../src/diversity/history.js'
import { runSamePrompt } from '../src/pipeline.js'
import type { PlanCore } from '../src/types.js'

interface Args {
  theme?: string
  n: number
  withImage: boolean
  seed?: number
  debug: boolean
  note?: string
}

function parseArgs(argv: string[]): Args {
  let theme: string | undefined
  let n = 9
  let withImage = true
  let seed: number | undefined
  let debug = false
  let note: string | undefined
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--theme') theme = argv[++i]
    else if (a === '--n') n = Math.max(1, Math.floor(Number(argv[++i])))
    else if (a === '--no-image') withImage = false
    else if (a === '--seed') seed = Number(argv[++i])
    else if (a === '--debug') debug = true
    else if (a === '--note') note = argv[++i]
  }
  if (!Number.isFinite(n)) n = 9
  if (seed !== undefined && !Number.isFinite(seed)) seed = undefined
  return { theme, n, withImage, seed, debug, note }
}

// 与 storage.ts 的 dateAndTime() 用同一套本地日期，保证产图当天目录和 pick/pack 取的日期一致。
function today(): string {
  const now = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
}

function coreForTheme(themeName: string): PlanCore {
  return { theme: themeName, age: 0, gender: '女', mood: '', visual_keywords: [] }
}

function run(script: string, scriptArgs: string[]): void {
  const res = spawnSync('npm', ['run', script, '--', ...scriptArgs], { stdio: 'inherit' })
  if (res.status !== 0) {
    console.error(`\n[same] 步骤「${script}」失败（退出码 ${res.status}），已中止。`)
    process.exit(res.status ?? 1)
  }
}

async function main(): Promise<void> {
  const { theme, n, withImage, seed: argSeed, debug, note } = parseArgs(process.argv.slice(2))
  if (debug) process.env.VD_DEBUG = '1'

  // 花钱前防呆：用 matchTheme 严格解析（支持简写/关键词）。不锁主题时按 seed 在全部主题里定一个。
  const baseSeed = argSeed ?? Math.floor(Math.random() * 0x7fffffff)
  const locked: Theme | null = theme ? matchTheme(theme) : null
  if (theme && !locked) {
    console.error(`[same] 未知主题「${theme}」。可用主题（支持名称或关键词）：\n  ${THEME_NAMES.join('\n  ')}`)
    process.exit(1)
  }
  const picked: Theme = locked ?? THEMES[baseSeed % THEMES.length]

  const date = today()
  console.log('[same] 同一 prompt 批量产线启动 · 当天目录 outputs/' + date + '/')
  console.log('[same] 张数:', n, '| 出图:', withImage ? '开（付费）' : '关')
  console.log('[same] 主题:', locked ? `锁定「${picked.name}」` : `未锁定 → 按 seed 取「${picked.name}」`)
  console.log('[same] 基准 seed:', baseSeed, '（决定唯一的 plan/prompt）')

  // 1) 出图：prompt 只构建一次，再用它出 N 张同 prompt 的图。
  console.log('\n[same] (1/3) 产图 runSamePrompt ...')
  const history = emptyHistory()
  const { prompt } = await runSamePrompt(
    `[same] ${picked.name}`,
    coreForTheme(picked.name),
    picked,
    {},
    [],
    baseSeed,
    n,
    withImage,
    history,
  )

  if (!withImage) {
    console.log('\n[same] --no-image：仅产出唯一 prompt 预览，跳过 pick/pack。')
    console.log('[same] 唯一 Prompt:\n' + prompt)
    return
  }

  // 2) 生成评分表（免费，纯本地扫描）。
  console.log('\n[same] (2/3) 生成评分表 pick ...')
  run('pick', [date])

  // 3) 打包：--prompt-as-body → 标题 DeepSeek 总结，正文 = 出图 prompt。
  console.log('\n[same] (3/3) 打包 pack --all --prompt-as-body ...')
  const packArgs = [date, '--all', '--prompt-as-body']
  if (note) packArgs.push('--note', note)
  run('pack', packArgs)

  console.log('\n[same] 完成。可发目录在 posts/ 下（标题=DeepSeek 总结，正文=出图 prompt）。')
}

main().catch((err) => {
  console.error('[same] 运行失败:', err)
  process.exit(1)
})
