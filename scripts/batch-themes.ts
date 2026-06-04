// 批量出图脚本：遍历全部 9 个主题，每个主题各跑 N 张（默认 2），一次看全所有主题效果。
//
// 直接「锁定」每个主题、绕过 Planner（既精确命中每个主题，又省掉 Planner 的 DeepSeek 调用）。
// 用内存内 history 做整轮去重（同主题两张 + 跨主题不撞场景/景别/光线），但**不写回**
// outputs/.history.json，避免污染 `npm start` 的跨次去重。
//
// 用法：
//   npm run batch:themes                 # 9 主题 × 2 张，调即梦出图
//   npm run batch:themes -- --per 3      # 每主题 3 张
//   npm run batch:themes -- --no-image   # 只产出 Prompt 不出图（省钱预览）
//   npm run batch:themes -- --seed 42    # 指定基准 seed（可复现）
//   npm run batch:themes -- --debug      # 打印每次 Builder 的大模型 I/O

import { THEMES } from '../src/diversity/themes.js'
import { emptyHistory } from '../src/diversity/history.js'
import { runOne } from '../src/pipeline.js'
import type { PlanCore } from '../src/types.js'

interface ScriptArgs {
  per: number
  withImage: boolean
  seed: number
  debug: boolean
}

function parseArgs(argv: string[]): ScriptArgs {
  let per = 2
  let withImage = true
  let seed = 1
  let debug = false
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === '--per') per = Math.max(1, Math.floor(Number(argv[++i])))
    else if (arg === '--no-image') withImage = false
    else if (arg === '--seed') seed = Number(argv[++i])
    else if (arg === '--debug') debug = true
  }
  if (!Number.isFinite(per)) per = 2
  if (!Number.isFinite(seed)) seed = 1
  return { per, withImage, seed, debug }
}

// 锁定主题时给 runOne 的占位意图层：theme/age 会被 assemblePlan 覆盖，这里只需提供 gender。
function coreForTheme(themeName: string): PlanCore {
  return { theme: themeName, age: 0, gender: '女', mood: '', visual_keywords: [] }
}

async function main(): Promise<void> {
  const { per, withImage, seed: baseSeed, debug } = parseArgs(process.argv.slice(2))
  if (debug) process.env.VD_DEBUG = '1'

  const total = THEMES.length * per
  console.log('[batch] 主题数:', THEMES.length, '| 每主题:', per, '张 | 合计:', total, '张')
  console.log('[batch] 出图模式:', withImage ? '开启（调即梦，付费）' : '关闭（仅产出 Prompt）')
  console.log('[batch] 预计调用: DeepSeek Builder ×', total, withImage ? `+ 即梦出图 ×${total}` : '（不出图）')
  console.log('[batch] 基准 seed:', baseSeed, '| 多样性历史: 启用（仅本轮内存内去重，不写回磁盘）')

  // 整轮共享一份内存 history：同主题两张 + 跨主题都参与降权，但不持久化
  const history = emptyHistory()

  let success = 0
  let failed = 0
  let counter = 0
  for (let t = 0; t < THEMES.length; t++) {
    const theme = THEMES[t]
    console.log(`\n########## 主题 ${t + 1}/${THEMES.length}：「${theme.name}」 ##########`)
    for (let j = 0; j < per; j++) {
      const seed = baseSeed + counter++
      console.log(`\n---------- 「${theme.name}」第 ${j + 1}/${per} 张（seed ${seed}）----------`)
      try {
        // 锁定主题、无 pinned、无 extras：所有视觉维度在该主题池内采样
        await runOne(`[批量] ${theme.name}`, coreForTheme(theme.name), theme, {}, [], seed, withImage, history)
        success++
      } catch (err) {
        failed++
        console.error(`[seed ${seed}] 生成失败，已跳过：${(err as Error).message}`)
      }
    }
  }

  console.log(
    `\n[batch] 完成。成功 ${success}/${total}${failed ? `，失败 ${failed}` : ''}。产物在 outputs/ 下各独立子目录。`,
  )
}

main().catch((err) => {
  console.error('[batch] 运行失败:', err)
  process.exit(1)
})
