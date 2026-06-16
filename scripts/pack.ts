// 打包成可发的 post 目录：读当天 rating.json 取 good 的图 → 生成文案 + 过程卡 → posts/<日期_主题>/。
// 文案走 DeepSeek（付费）。发布永远手动——本脚本只产出"拿来即发"的目录。
//
// 用法：
//   npm run pack -- 2026-06-02                      # 打包当天 good 图，文案按内容档位自动切口径
//   npm run pack -- 2026-06-02 --note "逆光明显优于棚拍"   # 附一句踩坑/心得进文案
//   npm run pack -- 2026-06-02 --all                # 跳过打分：打包当天所有图（只排除被标 bad 的）
// 发哪个平台是发布时人工决定的，本脚本不再绑定平台。

import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve, extname } from 'node:path'
import { generateCaption, generatePromptCaption, captionToMarkdown } from '../src/caption.js'

const OUTPUTS_ROOT = resolve(process.cwd(), 'outputs')
const POSTS_ROOT = resolve(process.cwd(), 'posts')

interface RatingItem {
  dir: string
  image: string | null
  theme: string
  shot: string
  pose: string
  lighting: string
  scene: string
  clothes: string
  rating: string
  reasons: string[]
}
interface RatingFile {
  date: string
  items: RatingItem[]
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

function dominantTheme(items: RatingItem[]): string {
  const count = new Map<string, number>()
  for (const it of items) count.set(it.theme, (count.get(it.theme) ?? 0) + 1)
  let best = '混合'
  let max = 0
  for (const [t, c] of count) {
    if (c > max) {
      max = c
      best = t
    }
  }
  return count.size === 1 ? [...count.keys()][0] : best
}

async function main(): Promise<void> {
  const args = process.argv.slice(2)
  const date = args.find((a) => /^\d{4}-\d{2}-\d{2}$/.test(a))
  if (!date) {
    console.error('用法: npm run pack -- <日期 YYYY-MM-DD> [--all] [--note "心得"]')
    process.exit(1)
  }
  const noteIdx = args.indexOf('--note')
  const note = noteIdx >= 0 ? args[noteIdx + 1] : undefined

  const ratingPath = join(OUTPUTS_ROOT, date, 'rating.json')
  if (!existsSync(ratingPath)) {
    console.error(`[pack] 没有 ${ratingPath}，先 npm run pick -- ${date} 并打分`)
    process.exit(1)
  }
  // --all：跳过打分，打包当天所有图（只排除被标 bad 的）。一键产线（npm run go）用这个。
  // 默认：只取 rating=good（rating 驱动的精选流程）。
  const all = args.includes('--all')
  const data = JSON.parse(readFileSync(ratingPath, 'utf-8')) as RatingFile
  const picked = (data.items ?? []).filter((i) => i.image && (all ? i.rating !== 'bad' : i.rating === 'good'))
  if (!picked.length) {
    console.error(
      all ? '[pack] 当天没有可打包的图（都缺图或都被标 bad）' : '[pack] 没有 rating=good 且有图的条目，先打分',
    )
    process.exit(1)
  }
  const label = all ? '全部' : '精选'

  const theme = dominantTheme(picked)
  const highlights = [
    ...topUnique(
      picked.map((g) => g.lighting),
      2,
    ),
    ...topUnique(
      picked.map((g) => g.scene),
      2,
    ),
    ...topUnique(
      picked.map((g) => g.shot),
      1,
    ),
  ]

  console.log(`[pack] ${date} | 主题=${theme} | ${label} ${picked.length}/${data.items.length}`)

  // --prompt-as-body：「同一 prompt 批量」模式的文案口径——
  // 标题由 DeepSeek 起一个总结性名字，中英两版正文都直接是那条出图 prompt。
  // 这组图共用同一 prompt，读第一张的 prompt.txt 即可。
  const promptAsBody = args.includes('--prompt-as-body')
  let caption
  if (promptAsBody) {
    const firstPromptPath = join(OUTPUTS_ROOT, date, picked[0].dir, 'prompt.txt')
    const sharedPrompt = existsSync(firstPromptPath) ? readFileSync(firstPromptPath, 'utf-8').trim() : ''
    if (!sharedPrompt) {
      console.error('[pack] --prompt-as-body 但读不到 prompt.txt，无法把 prompt 当正文')
      process.exit(1)
    }
    console.log('[pack] --prompt-as-body：调用 DeepSeek 起标题，正文 = 出图 prompt ...')
    caption = await generatePromptCaption({ theme, prompt: sharedPrompt })
  } else {
    console.log('[pack] 调用 DeepSeek 生成文案...')
    caption = await generateCaption({
      theme,
      count: data.items.length,
      picked: picked.length,
      highlights,
      note,
    })
  }

  const postDir = join(POSTS_ROOT, `${date}_${theme}`)
  mkdirSync(postDir, { recursive: true })

  // 复制图（封面 = 第一张）
  const copied: string[] = []
  picked.forEach((g, idx) => {
    const src = join(OUTPUTS_ROOT, date, g.image as string)
    const ext = extname(g.image as string) || '.png'
    const name = `${String(idx + 1).padStart(2, '0')}${idx === 0 ? '_cover' : ''}${ext}`
    copyFileSync(src, join(postDir, name))
    copied.push(name)
  })

  // caption.md（中英双版）
  writeFileSync(join(postDir, 'caption.md'), captionToMarkdown(caption), 'utf-8')

  // 过程卡：每张图的视觉参数 + prompt
  let card = `# 过程卡 · ${date} · ${theme}\n\n${label} ${picked.length}/${data.items.length}\n\n`
  picked.forEach((g, idx) => {
    const promptPath = join(OUTPUTS_ROOT, date, g.dir, 'prompt.txt')
    const prompt = existsSync(promptPath) ? readFileSync(promptPath, 'utf-8').trim() : '(无)'
    card +=
      `## ${String(idx + 1).padStart(2, '0')} ${copied[idx]}\n` +
      `- 主题: ${g.theme} | 景别: ${g.shot} | 姿势: ${g.pose} | 光线: ${g.lighting} | 场景: ${g.scene}\n` +
      `- 穿搭: ${g.clothes}\n\n` +
      '```\n' +
      prompt +
      '\n```\n\n'
  })
  writeFileSync(join(postDir, '过程卡.md'), card, 'utf-8')

  console.log(`[pack] 完成 → ${postDir}`)
  console.log(`[pack] 含 ${copied.length} 张图 + caption.md + 过程卡.md，可手动发布。`)
}

main().catch((err) => {
  console.error('[pack] 运行失败:', err)
  process.exit(1)
})
