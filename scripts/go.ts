// 一键产线：产图 → 生成评分表 → 打包成可发目录，一条命令跑完，不等人工打分。
// 内部依次调 daily → pick → pack --all（打包当天所有图，只排除被标 bad 的）。
// rating.json 照常生成，想打分可事后补；不要的图发布前手动删，或标 bad 后重跑 pack。
//
// 发哪个平台是发布时人工决定的，本脚本不绑定平台。
//
// 用法：
//   npm run go -- --theme 氛围感 --n 9                       # 出 9 张并打包好
//   npm run go -- --n 9                                      # 不锁主题，全部主题内轮换
//   npm run go -- --theme 古风旗袍 --note "今天试油纸伞 + 回廊"  # 附一句心得进文案
//   npm run go -- --no-image                                 # 只产 prompt 预览，不出图不打包
//
// 透传给 daily：--theme --n --seed --no-image --debug
// 透传给 pack ：--note

import { spawnSync } from 'node:child_process'

// 与 storage.ts 的 dateAndTime() 用同一套本地日期，保证 daily 写入的当天目录和 pick/pack 取的日期一致。
function today(): string {
  const now = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
}

// 串行跑一个 npm 脚本，stdio 直通（沿用各脚本自己的日志）；失败即中止整条产线。
function run(script: string, scriptArgs: string[]): void {
  const res = spawnSync('npm', ['run', script, '--', ...scriptArgs], { stdio: 'inherit' })
  if (res.status !== 0) {
    console.error(`\n[go] 步骤「${script}」失败（退出码 ${res.status}），已中止。`)
    process.exit(res.status ?? 1)
  }
}

function valueAfter(argv: string[], flag: string): string | undefined {
  const i = argv.indexOf(flag)
  return i >= 0 ? argv[i + 1] : undefined
}

function main(): void {
  const argv = process.argv.slice(2)
  const noImage = argv.includes('--no-image')
  const note = valueAfter(argv, '--note')

  const date = today()
  console.log(`[go] 一键产线启动 · 当天目录 outputs/${date}/`)

  // 1) 产图：把和 daily 相关的参数原样透传（pack 专用的 --note 不传给 daily）。
  const dailyArgs: string[] = []
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--note')
      i++ // 跳过 --note 及其值
    else dailyArgs.push(a)
  }
  console.log('\n[go] (1/3) 产图 daily ...')
  run('daily', dailyArgs)

  if (noImage) {
    console.log('\n[go] --no-image：仅预览 prompt，跳过 pick/pack。')
    return
  }

  // 2) 生成评分表（免费，纯本地扫描）。
  console.log('\n[go] (2/3) 生成评分表 pick ...')
  run('pick', [date])

  // 3) 打包当天所有图（--all），心得透传。
  console.log('\n[go] (3/3) 打包 pack --all ...')
  const packArgs = [date, '--all']
  if (note) packArgs.push('--note', note)
  run('pack', packArgs)

  console.log('\n[go] 完成。可发目录在 posts/ 下；发布前手动挑图删图，想打分去填 outputs/' + date + '/rating.json。')
}

main()
