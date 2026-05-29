import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import OpenAI from 'openai'
import { config } from './config.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const SYSTEM_PROMPT_PATH = join(__dirname, 'prompts', 'refiner.system.md')

// 每次读取，便于不重启迭代 system prompt
function loadSystemPrompt(): string {
  return readFileSync(SYSTEM_PROMPT_PATH, 'utf-8')
}

const client = new OpenAI({
  apiKey: config.deepseek.apiKey,
  baseURL: config.deepseek.baseURL,
})

// 清理模型偶发的包裹：代码块围栏、首尾引号、"润色后："之类前缀
function cleanup(text: string): string {
  let out = text.trim()
  out = out.replace(/^```[a-zA-Z]*\n?/, '').replace(/```$/, '').trim()
  out = out.replace(/^["'「『]+/, '').replace(/["'」』]+$/, '').trim()
  out = out.replace(/^(润色后|优化后|结果)[：:]\s*/, '').trim()
  return out
}

// 把 planner 产出的 prompt 再顺一遍，使其更符合中文表达习惯。
// 措辞润色用稍高温度；失败或返回空则回退原始 prompt，不阻断主流程。
export async function refine(prompt: string): Promise<string> {
  const systemPrompt = loadSystemPrompt()
  const completion = await client.chat.completions.create({
    model: config.deepseek.model,
    temperature: 0.8,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: prompt },
    ],
  })

  const content = completion.choices[0]?.message?.content
  if (!content) {
    return prompt
  }
  const refined = cleanup(content)
  return refined === '' ? prompt : refined
}
