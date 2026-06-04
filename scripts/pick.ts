// 选图/评分工具：把某天的产物整理成 rating.json 供人工打分，并按维度聚合崩坏率。
// 挂钩 visual-plan.json——打分能反查回"哪个 主题/pose/shot/lighting"，进而指导采样池权重。
//
// 用法：
//   npm run pick -- 2026-06-02            # 生成/增量更新 outputs/2026-06-02/rating.json
//   npm run pick -- 2026-06-02 --report   # 读已填的 rating.json，输出按维度的 good/bad 统计
//
// 打分方式（人工）：编辑 rating.json，每条填
//   rating: "good" | "usable" | "bad"
//   reasons: ["脸好","光影好","手脚崩","古风弱","太性感","不像好图", ...]

import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

const OUTPUTS_ROOT = resolve(process.cwd(), 'outputs')

type Rating = '' | 'good' | 'usable' | 'bad'

interface RatingItem {
  dir: string
  image: string | null
  theme: string
  shot: string
  pose: string
  lighting: string
  scene: string
  clothes: string
  rating: Rating
  reasons: string[]
}

interface RatingFile {
  date: string
  items: RatingItem[]
}

function readPlan(dir: string): Record<string, unknown> | null {
  const p = join(dir, 'visual-plan.json')
  if (!existsSync(p)) return null
  try {
    return JSON.parse(readFileSync(p, 'utf-8')) as Record<string, unknown>
  } catch {
    return null
  }
}

function findImage(dir: string): string | null {
  const f = readdirSync(dir).find((x) => x.startsWith('image.'))
  return f ?? null
}

function str(v: unknown): string {
  return typeof v === 'string' ? v : ''
}

function buildItem(dayDir: string, sub: string): RatingItem | null {
  const dir = join(dayDir, sub)
  if (!statSync(dir).isDirectory()) return null
  const plan = readPlan(dir)
  if (!plan) return null
  const img = findImage(dir)
  return {
    dir: sub,
    image: img ? join(sub, img) : null,
    theme: str(plan.theme),
    shot: str(plan.shot),
    pose: str(plan.pose),
    lighting: str(plan.lighting),
    scene: str(plan.scene),
    clothes: `${str(plan.clothes_color)}的${str(plan.clothes)}`,
    rating: '',
    reasons: [],
  }
}

function generate(date: string): void {
  const dayDir = join(OUTPUTS_ROOT, date)
  if (!existsSync(dayDir)) {
    console.error(`[pick] 目录不存在：outputs/${date}/（先迁移或先产图）`)
    process.exit(1)
  }
  const ratingPath = join(dayDir, 'rating.json')

  // 已有评分：按 dir 保留已填的 rating/reasons，增量合并
  const prev = new Map<string, RatingItem>()
  if (existsSync(ratingPath)) {
    try {
      const old = JSON.parse(readFileSync(ratingPath, 'utf-8')) as RatingFile
      for (const it of old.items ?? []) prev.set(it.dir, it)
    } catch {
      /* 损坏则重建 */
    }
  }

  const items: RatingItem[] = []
  for (const sub of readdirSync(dayDir).sort()) {
    if (sub === 'rating.json') continue
    const item = buildItem(dayDir, sub)
    if (!item) continue
    const old = prev.get(item.dir)
    if (old) {
      item.rating = old.rating ?? ''
      item.reasons = old.reasons ?? []
    }
    items.push(item)
  }

  const out: RatingFile = { date, items }
  writeFileSync(ratingPath, JSON.stringify(out, null, 2), 'utf-8')
  const filled = items.filter((i) => i.rating).length
  console.log(`[pick] 写入 ${ratingPath}`)
  console.log(`[pick] 共 ${items.length} 张（已评 ${filled}，待评 ${items.length - filled}）。`)
  console.log('[pick] 去编辑 rating.json 填 rating(good/usable/bad)+reasons，再 --report 看统计。')
}

// 按某个维度聚合 good/usable/bad 计数与崩坏率
function aggregate(items: RatingItem[], key: keyof RatingItem): void {
  const groups = new Map<string, { good: number; usable: number; bad: number; none: number }>()
  for (const it of items) {
    const k = String(it[key]) || '(空)'
    const g = groups.get(k) ?? { good: 0, usable: 0, bad: 0, none: 0 }
    if (it.rating === 'good') g.good++
    else if (it.rating === 'usable') g.usable++
    else if (it.rating === 'bad') g.bad++
    else g.none++
    groups.set(k, g)
  }
  const rows = [...groups.entries()].sort((a, b) => b[1].bad - a[1].bad)
  for (const [k, g] of rows) {
    const rated = g.good + g.usable + g.bad
    const badRate = rated ? Math.round((g.bad / rated) * 100) : 0
    console.log(`  ${k.padEnd(16)} good=${g.good} usable=${g.usable} bad=${g.bad} 待评=${g.none} | 崩坏率=${badRate}%`)
  }
}

function report(date: string): void {
  const ratingPath = join(OUTPUTS_ROOT, date, 'rating.json')
  if (!existsSync(ratingPath)) {
    console.error(`[pick] 没有 rating.json，先跑 npm run pick -- ${date} 生成并打分`)
    process.exit(1)
  }
  const data = JSON.parse(readFileSync(ratingPath, 'utf-8')) as RatingFile
  const items = data.items ?? []
  const rated = items.filter((i) => i.rating)
  console.log(`[pick:report] ${date} 共 ${items.length} 张，已评 ${rated.length}。`)
  for (const dim of ['theme', 'shot', 'pose', 'lighting'] as const) {
    console.log(`\n— 按 ${dim} —`)
    aggregate(items, dim)
  }
  // 原因标签频次
  const reasonCount = new Map<string, number>()
  for (const it of rated) for (const r of it.reasons) reasonCount.set(r, (reasonCount.get(r) ?? 0) + 1)
  if (reasonCount.size) {
    console.log('\n— 原因标签频次 —')
    for (const [r, n] of [...reasonCount.entries()].sort((a, b) => b[1] - a[1])) {
      console.log(`  ${r}: ${n}`)
    }
  }
}

function main(): void {
  const args = process.argv.slice(2)
  const date = args.find((a) => /^\d{4}-\d{2}-\d{2}$/.test(a))
  if (!date) {
    console.error('用法: npm run pick -- <日期 YYYY-MM-DD> [--report]')
    process.exit(1)
  }
  if (args.includes('--report')) report(date)
  else generate(date)
}

main()
