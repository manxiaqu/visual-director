// 每日产图入口：锁定一个美学主题（或在全部主题里轮换）出 N 张，落到当天 outputs/<日期>/。
// 绕过 Planner（复用 pipeline.runOne）。不锁主题时在全部主题（含身材向）内轮换。
// 发哪个平台是发布时人工决定的，与产图无关。
//
// 用法：
//   npm run daily -- --theme 氛围感情绪片 --n 9   # 锁定主题出 9 张
//   npm run daily -- --n 9                        # 不指定主题：全部主题内轮换
//   npm run daily -- --theme 古风旗袍 --no-image  # 只产 Prompt 不出图（仍调 DeepSeek Builder）

import { matchTheme, THEME_NAMES, THEMES, type Theme } from '../src/diversity/themes.js'
import { emptyHistory } from '../src/diversity/history.js'
import { runOne } from '../src/pipeline.js'
import type { PlanCore } from '../src/types.js'

interface Args {
  theme?: string
  n: number
  withImage: boolean
  seed: number
  debug: boolean
}

function parseArgs(argv: string[]): Args {
  let theme: string | undefined
  let n = 9
  let withImage = true
  let seed = 1
  let debug = false
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--theme') theme = argv[++i]
    else if (a === '--n') n = Math.max(1, Math.floor(Number(argv[++i])))
    else if (a === '--no-image') withImage = false
    else if (a === '--seed') seed = Number(argv[++i])
    else if (a === '--debug') debug = true
  }
  if (!Number.isFinite(n)) n = 9
  if (!Number.isFinite(seed)) seed = 1
  return { theme, n, withImage, seed, debug }
}

function coreForTheme(themeName: string): PlanCore {
  return { theme: themeName, age: 0, gender: '女', mood: '', visual_keywords: [] }
}

async function main(): Promise<void> {
  const { theme, n, withImage, seed: baseSeed, debug } = parseArgs(process.argv.slice(2))
  if (debug) process.env.VD_DEBUG = '1'

  // 花钱前防呆：用 matchTheme 严格解析（支持简写/关键词，如"氛围感"→氛围感情绪片）。
  // 真正认不出来才报错，避免静默回退到默认主题、花钱出成错主题。
  const locked: Theme | null = theme ? matchTheme(theme) : null
  if (theme && !locked) {
    console.error(`[daily] 未知主题「${theme}」。可用主题（支持名称或关键词）：\n  ${THEME_NAMES.join('\n  ')}`)
    process.exit(1)
  }
  const pool = THEMES // 不锁主题时的轮换池：全部主题

  console.log('[daily] 张数:', n, '| 出图:', withImage ? '开（付费）' : '关')
  console.log('[daily] 主题:', locked ? `锁定「${locked.name}」` : `轮换（${pool.map((t) => t.name).join('/')}）`)
  console.log('[daily] 基准 seed:', baseSeed)

  const history = emptyHistory() // 本轮内存去重，不写回磁盘
  let success = 0
  let failed = 0
  for (let i = 0; i < n; i++) {
    const seed = baseSeed + i
    const theme = locked ?? pool[(baseSeed + i) % pool.length]
    console.log(`\n---------- 第 ${i + 1}/${n} 张（seed ${seed} · 「${theme.name}」）----------`)
    try {
      await runOne(`[daily] ${theme.name}`, coreForTheme(theme.name), theme, {}, [], seed, withImage, history)
      success++
    } catch (err) {
      failed++
      console.error(`[seed ${seed}] 失败，已跳过：${(err as Error).message}`)
    }
  }
  console.log(`\n[daily] 完成。成功 ${success}/${n}${failed ? `，失败 ${failed}` : ''}。产物在 outputs/<今天>/ 下。`)
}

main().catch((err) => {
  console.error('[daily] 运行失败:', err)
  process.exit(1)
})
