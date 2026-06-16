// B-2 存量文案回填：对历史图按 (日期, 主题) 分组，调 DeepSeek 生成文案，写到 posts/。
// 复用 caption.ts。默认 dry-run（只打印将生成哪些组，免费）；--apply 才真正调 DeepSeek（付费）。
// 发哪个平台是发布时人工决定的，不绑定平台。
//
// 用法：
//   npm run backfill:captions                          # dry-run，列出所有日期的分组
//   npm run backfill:captions -- 2026-06-02            # 只回填某天（dry-run）
//   npm run backfill:captions -- 2026-06-02 --apply    # 实际生成文案（付费）

import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { writeFileSync } from 'node:fs'
import { extname, join, resolve } from 'node:path'
import { generateCaption, captionToMarkdown } from '../src/caption.js'

const OUTPUTS_ROOT = resolve(process.cwd(), 'outputs')
const POSTS_ROOT = resolve(process.cwd(), 'posts')
const MAX_PER_GROUP = 9 // 每组最多带几张图进 post

interface Img {
  dir: string // outputs/<date>/<dir>
  image: string // 图片文件名
  theme: string
  lighting: string
  scene: string
  shot: string
}

function str(v: unknown): string {
  return typeof v === 'string' ? v : ''
}

function collect(date: string): Map<string, Img[]> {
  const dayDir = join(OUTPUTS_ROOT, date)
  const groups = new Map<string, Img[]>()
  for (const sub of readdirSync(dayDir).sort()) {
    const dir = join(dayDir, sub)
    if (sub === 'rating.json' || !statSync(dir).isDirectory()) continue
    const planPath = join(dir, 'visual-plan.json')
    if (!existsSync(planPath)) continue
    const imgFile = readdirSync(dir).find((x) => x.startsWith('image.'))
    if (!imgFile) continue // 无图（失败/未出图）不回填
    let plan: Record<string, unknown>
    try {
      plan = JSON.parse(readFileSync(planPath, 'utf-8')) as Record<string, unknown>
    } catch {
      continue
    }
    const theme = str(plan.theme)
    if (!theme) continue // 老数据无主题，跳过
    const arr = groups.get(theme) ?? []
    arr.push({
      dir: sub,
      image: imgFile,
      theme,
      lighting: str(plan.lighting),
      scene: str(plan.scene),
      shot: str(plan.shot),
    })
    groups.set(theme, arr)
  }
  return groups
}

function topUnique(values: string[], n: number): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const v of values) {
    if (v && !seen.has(v)) {
      seen.add(v)
      out.push(v)
      if (out.length >= n) break
    }
  }
  return out
}

function dates(arg?: string): string[] {
  if (arg) return [arg]
  return readdirSync(OUTPUTS_ROOT)
    .filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d) && statSync(join(OUTPUTS_ROOT, d)).isDirectory())
    .sort()
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2)
  const date = argv.find((a) => /^\d{4}-\d{2}-\d{2}$/.test(a))
  const apply = argv.includes('--apply')

  const targetDates = dates(date)
  console.log(
    `[backfill] 日期: ${targetDates.join(', ') || '(无)'} | ${apply ? '--apply 实际生成（付费）' : 'dry-run'}`,
  )

  for (const d of targetDates) {
    const groups = collect(d)
    for (const [theme, imgs] of groups) {
      console.log(`  ${d} · ${theme} · ${imgs.length} 张`)
      if (!apply) continue

      const picked = imgs.slice(0, MAX_PER_GROUP)
      const highlights = [
        ...topUnique(
          picked.map((g) => g.lighting),
          2,
        ),
        ...topUnique(
          picked.map((g) => g.scene),
          2,
        ),
      ]
      const caption = await generateCaption({
        theme,
        count: imgs.length,
        picked: picked.length,
        highlights,
      })

      const postDir = join(POSTS_ROOT, `${d}_${theme}`)
      mkdirSync(postDir, { recursive: true })
      picked.forEach((g, idx) => {
        const ext = extname(g.image) || '.png'
        copyFileSync(
          join(OUTPUTS_ROOT, d, g.dir, g.image),
          join(postDir, `${String(idx + 1).padStart(2, '0')}${idx === 0 ? '_cover' : ''}${ext}`),
        )
      })
      writeFileSync(join(postDir, 'caption.md'), captionToMarkdown(caption), 'utf-8')
      console.log(`    → ${postDir}`)
    }
  }

  if (!apply) console.log('\n[backfill] 以上为 dry-run。确认分组无误后加 --apply 实际生成（每组 1 次 DeepSeek 调用）。')
}

main().catch((err) => {
  console.error('[backfill] 运行失败:', err)
  process.exit(1)
})
