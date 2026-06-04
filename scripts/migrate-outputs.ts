// 一次性迁移：把历史的一级产物目录 outputs/<日期>_<时间>_<hash>/
// 归并成两级 outputs/<日期>/<时间>_<hash>/（与 storage.ts 新结构对齐）。
//
// 默认 dry-run（只打印将要做的移动，不动文件）；加 --apply 才真正移动。
//
// 用法：
//   npm run migrate:outputs              # dry-run，打印全量「A → B」清单
//   npm run migrate:outputs -- --apply   # 实际移动

import { existsSync, mkdirSync, readdirSync, renameSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'

const OUTPUTS_ROOT = resolve(process.cwd(), 'outputs')

// 一级目录名：YYYY-MM-DD_HHMMSS_hash → 拆出 date 和 time_hash 两段
const ONE_LEVEL = /^(\d{4}-\d{2}-\d{2})_(\d{6}_[0-9a-zA-Z]+)$/

interface Move {
  from: string
  toDate: string
  toName: string
}

function planMoves(): { moves: Move[]; skipped: string[] } {
  const moves: Move[] = []
  const skipped: string[] = []
  if (!existsSync(OUTPUTS_ROOT)) return { moves, skipped }

  for (const name of readdirSync(OUTPUTS_ROOT)) {
    if (name.startsWith('.')) continue // .history.json / .gitkeep
    const full = join(OUTPUTS_ROOT, name)
    if (!statSync(full).isDirectory()) continue

    const m = ONE_LEVEL.exec(name)
    if (!m) continue // 已是 <日期> 两级目录或其它，跳过

    const [, date, rest] = m
    const target = join(OUTPUTS_ROOT, date, rest)
    if (existsSync(target)) {
      skipped.push(`${name} （目标已存在，跳过：${date}/${rest}）`)
      continue
    }
    moves.push({ from: name, toDate: date, toName: rest })
  }
  return { moves, skipped }
}

function main(): void {
  const apply = process.argv.slice(2).includes('--apply')
  const { moves, skipped } = planMoves()

  console.log(
    `[migrate] 扫描 outputs/，发现 ${moves.length} 个一级目录待迁移${apply ? '（--apply：实际移动）' : '（dry-run：不动文件）'}`,
  )
  for (const mv of moves) {
    console.log(`  ${mv.from}  →  ${mv.toDate}/${mv.toName}`)
  }
  if (skipped.length) {
    console.log(`\n[migrate] 跳过 ${skipped.length} 项：`)
    for (const s of skipped) console.log(`  - ${s}`)
  }

  if (!apply) {
    console.log('\n[migrate] 以上为 dry-run 预览。确认无误后加 --apply 实际移动。')
    return
  }

  let done = 0
  for (const mv of moves) {
    const from = join(OUTPUTS_ROOT, mv.from)
    const toDir = join(OUTPUTS_ROOT, mv.toDate)
    const to = join(toDir, mv.toName)
    mkdirSync(toDir, { recursive: true })
    renameSync(from, to)
    done++
  }
  console.log(`\n[migrate] 完成。已移动 ${done} 个目录；跳过 ${skipped.length} 个。`)
}

main()
