import { generateImage } from '../src/image-generator.js'
import { createRunDir, saveImage, saveText, saveJson } from '../src/storage.js'

const HARDCODED_PROMPT =
  '一位 22 岁的甜美女孩，鹅蛋脸，长直黑发，身穿白色连衣裙，置身夏日校园之中，' +
  '85mm 人像镜头逆光拍摄，画面氛围温暖柔和。'

async function main(): Promise<void> {
  console.log('[smoke] 使用硬编码 prompt 调 fal.ai...')
  console.log('[smoke] prompt:', HARDCODED_PROMPT)

  const image = await generateImage(HARDCODED_PROMPT)
  const dir = createRunDir()
  const imagePath = saveImage(dir, image.bytes)
  saveText(dir, 'prompt.txt', HARDCODED_PROMPT)
  saveJson(dir, 'meta.json', {
    kind: 'smoke-step0',
    sourceUrl: image.sourceUrl,
    contentType: image.contentType,
    createdAt: new Date().toISOString(),
  })

  console.log('[smoke] 完成，产物目录:', dir)
  console.log('[smoke] image:', imagePath)
}

main().catch((err) => {
  console.error('[smoke] 失败:', err)
  process.exit(1)
})
