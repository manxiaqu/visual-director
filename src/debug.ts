// Debug 模式：开启后把每一次大模型调用的输入（messages）与输出全部打印出来，
// 便于观察 Planner / Prompt Builder 各自吃进什么、吐出什么。
// 开启方式：CLI 加 --debug，或设环境变量 VD_DEBUG=1。

export function isDebug(): boolean {
  const v = process.env.VD_DEBUG
  return v === '1' || v === 'true'
}

interface LlmMessage {
  role: string
  content: string
}

interface LlmMeta {
  model: string
  temperature: number
  response_format?: string
}

const LINE = '─'.repeat(72)

// 打印一次完整的大模型调用：步骤名 + 参数 + 全部输入消息 + 原始输出。
export function debugLLMCall(step: string, meta: LlmMeta, messages: LlmMessage[], output: string): void {
  if (!isDebug()) return

  const parts = [`model=${meta.model}`, `temperature=${meta.temperature}`]
  if (meta.response_format) parts.push(`response_format=${meta.response_format}`)

  console.log(`\n${LINE}`)
  console.log(`🔍 [DEBUG] 大模型调用：${step}`)
  console.log(parts.join(' | '))
  for (const msg of messages) {
    console.log(`\n──── 输入 · ${msg.role} ────`)
    console.log(msg.content)
  }
  console.log('\n──── 输出 ────')
  console.log(output)
  console.log(`${LINE}\n`)
}
