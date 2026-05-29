import { resolve } from 'node:path'
import { plan } from './planner.js'
import { refine } from './refiner.js'
import { generateImage } from './image-generator.js'
import { createRunDir, saveImage, saveJson, saveText } from './storage.js'
import { isUnsupported } from './types.js'
import type { GenerationResult } from './types.js'

function printUsage(): void {
  console.error('Usage: npm start "<你的图片需求>" [-- --image]')
  console.error('示例: npm start "生成一个美女"               # 只产出 Plan + Prompt，不出图')
  console.error('示例: npm start "生成一个美女" -- --image    # 完整流程，调用即梦出图')
  console.error('注意: 通过 npm 传 --image 必须加 `--` 分隔，否则会被 npm 吞掉')
}

interface Args {
  userInput: string
  withImage: boolean
}

function parseArgs(argv: string[]): Args | null {
  let userInput = ''
  let withImage = false
  for (const arg of argv) {
    if (arg === '--image') {
      withImage = true
    } else if (!userInput) {
      userInput = arg
    }
  }
  if (!userInput || userInput.trim() === '') {
    return null
  }
  return { userInput, withImage }
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2))
  if (!args) {
    printUsage()
    process.exit(1)
  }
  const { userInput, withImage } = args

  console.log('[main] 原始需求:', userInput)
  console.log('[main] 出图模式:', withImage ? '开启（--image）' : '关闭（仅产出 Prompt，加 --image 出图）')
  console.log('[main] 调用 Planner（DeepSeek）...')
  const result = await plan(userInput)

  if (isUnsupported(result)) {
    console.log('\n暂不支持：', result.reason)
    process.exit(0)
  }

  console.log('\n[main] Visual Plan:')
  console.log(JSON.stringify(result.plan, null, 2))
  console.log('\n[main] Planner 原始 Prompt:')
  console.log(result.prompt)

  console.log('\n[main] 调用 Refiner（DeepSeek）润色措辞...')
  const finalPrompt = await refine(result.prompt)
  console.log('\n[main] 润色后 Prompt:')
  console.log(finalPrompt)

  if (result.negativePrompt) {
    console.log('\n[main] Negative Prompt:')
    console.log(result.negativePrompt)
  }

  const createdAt = new Date().toISOString()
  const dir = createRunDir()
  saveJson(dir, 'visual-plan.json', result.plan)
  saveText(dir, 'prompt.raw.txt', result.prompt)
  saveText(dir, 'prompt.txt', finalPrompt)
  if (result.negativePrompt) {
    saveText(dir, 'negative-prompt.txt', result.negativePrompt)
  }

  const meta: GenerationResult = {
    userInput,
    createdAt,
    plan: result.plan,
    prompt: finalPrompt,
    rawPrompt: result.prompt,
    negativePrompt: result.negativePrompt,
  }

  if (withImage) {
    console.log('\n[main] 调用即梦生成图片...')
    const image = await generateImage(finalPrompt, result.negativePrompt)
    meta.imagePath = saveImage(dir, image.bytes)
    meta.sourceUrl = image.sourceUrl
    meta.contentType = image.contentType
  } else {
    console.log('\n[main] 跳过出图（如需出图，命令末尾加 --image）')
  }

  saveJson(dir, 'meta.json', meta)

  console.log('\n[main] 完成，产物目录:')
  console.log(resolve(dir))
}

main().catch((err) => {
  console.error('[main] 运行失败:', err)
  process.exit(1)
})
