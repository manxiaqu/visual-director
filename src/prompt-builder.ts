import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import OpenAI from 'openai'
import { config } from './config.js'
import { debugLLMCall } from './debug.js'
import type { VisualPlan } from './types.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const SYSTEM_PROMPT_PATH = join(__dirname, 'prompts', 'builder.system.md')

// 每次读取，便于不重启迭代 system prompt
function loadSystemPrompt(): string {
  return readFileSync(SYSTEM_PROMPT_PATH, 'utf-8')
}

const client = new OpenAI({
  apiKey: config.deepseek.apiKey,
  baseURL: config.deepseek.baseURL,
})

// 即梦无独立 negative_prompt API 字段，负面词写进主 prompt 末尾、单起一段。
// 对症写真常见崩坏：变形 / 多手指 / 塑料磨皮 / 卡通 3D。
// 数据驱动负面（来自 refs/bad 归纳）：网红塑料脸 / 橡胶质感 / CG二次元 / 做作表情 / 崩坏。
// 审美雷区（影楼摆拍/平光呆板）主要靠 Builder 正文正向对冲，不堆这里。
const NEGATIVE_PROMPT =
  '网红脸, 大眼, 磨皮, 塑料感, 橡胶质感, 油光, 过度美颜, 蜡像脸, CG感, 二次元, 3D渲染, 高饱和, 过曝, 比例失真, 畸形手, 多余手指, 脚趾畸形, 脚部变形, 肢体扭曲, 做作夸张表情, 水印'

function appendNegative(positive: string): string {
  return `${positive}\n\n[负面提示] ${NEGATIVE_PROMPT}`
}

// [风格] 段固定功底尾：所有写真通用的真实质感 / 防崩坏 / 比例层，与主题无关。
// 单一来源——LLM 正常路径与兜底路径都从这里取，避免两处漂移（曾经 md 与 fallback 各写一份）。
const STYLE_TAIL =
  '超写实摄影，真实胶片颗粒与CCD相机质感，高细节真实皮肤纹理与毛孔，自然光影层次，高清，细节极致，脸部与五官不变形，身体比例匀称自然，比例9:16。'

// [风格] 段完全由代码生成：可变审美用 plan.styleLabel，固定功底用 STYLE_TAIL。
// 与 [负面提示] 同理——确定性、单一来源，故 Builder 不必写 [风格]（system prompt 已说明）。
function styleSection(plan: VisualPlan): string {
  return `[风格]\n${plan.styleLabel}，${STYLE_TAIL}`
}

// 清理模型偶发的包裹：代码块围栏、首尾引号、「Prompt：」之类前缀
function cleanup(text: string): string {
  let out = text.trim()
  out = out
    .replace(/^```[a-zA-Z]*\n?/, '')
    .replace(/```$/, '')
    .trim()
  out = out
    .replace(/^["'「『]+/, '')
    .replace(/["'」』]+$/, '')
    .trim()
  out = out.replace(/^(Prompt|提示词|结果)[：:]\s*/i, '').trim()
  // 规范 [灯光] 段名：模型偶尔照抄指令里的反引号/加粗/破折号（如 `[灯光]`——），统一成干净的标题行
  out = out.replace(/[`*]*\[灯光\][`*]*[ \t]*[—–\-:：]*[ \t]*\n?/, '[灯光]\n')
  return out
}

// 兜底 Prompt：LLM 失败时用采样结果直拼黄金模板的简版，保证主流程不断。
// 不报五官参数（写真只说「五官精致」），主体定位为漂亮模特、年轻。
function fallbackPrompt(plan: VisualPlan): string {
  const age = plan.age && plan.age >= 18 && plan.age <= 30 ? plan.age : 21
  const extrasPart = plan.extras && plan.extras.length > 0 ? `，${plan.extras.join('，')}` : ''
  // 不露脸 / 身材向：不写五官与脸，笔墨给身材、腿、穿搭、光影
  const faceless = /不露脸|遮脸|背身|腿部|下半身|截到腿/.test(`${plan.pose}${plan.shot}`)
  const subject = faceless
    ? `一位${age}岁身材纤细的中国女孩，${plan.hair}，身穿${plan.clothes_color}的${plan.clothes}，` +
      `镜头聚焦身材与腿部线条、衣物质感`
    : (() => {
        const dimple = plan.face.feature ? `、${plan.face.feature.split('、')[0]}` : ''
        return (
          `一位${age}岁的漂亮中国模特，${plan.face.face_shape}${dimple}，五官精致，${plan.makeup}，${plan.hair}，` +
          `身穿${plan.clothes_color}的${plan.clothes}`
        )
      })()
  // 光不写死高光/光晕——顺着 lighting 的性质自然落（暗调/逆光就别硬加皮肤高光）。
  // 正文只写到 [灯光]；[风格] 与 [负面提示] 由 buildPrompt 统一追加，避免与正常路径重复维护。
  return (
    `${plan.scene}，${plan.lighting}。\n` +
    `${subject}。${plan.pose}，${plan.expression}${extrasPart}。` +
    `${plan.shot}构图，主体约占画面55%，背景浅景深，竖版9:16。\n\n` +
    `[灯光]\n${plan.lighting}，顺着光的方向与冷暖自然落在人物与发丝上，明暗层次真实。`
  )
}

interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

// 调一次 Builder，返回清洗后的正文（失败/空内容返回 ''）。
async function callBuilder(messages: ChatMessage[], label: string): Promise<string> {
  const completion = await client.chat.completions.create({
    model: config.deepseek.model,
    temperature: 0.7,
    messages,
  })
  const content = completion.choices[0]?.message?.content ?? ''
  // debug 模式下打印本次调用的完整输入与输出
  debugLLMCall(label, { model: config.deepseek.model, temperature: 0.7 }, messages, content)
  return content ? cleanup(content) : ''
}

// 校验：extras 是用户亲口说的碎信息，必须**逐字原样**出现在 prompt 里。返回缺失项。
function findMissingExtras(prompt: string, extras: string[]): string[] {
  return extras.filter((e) => e.trim() !== '' && !prompt.includes(e))
}

// 把完整方案改写成交给即梦的中文写真 Prompt（黄金模板：场景光线 → 主体 → 姿势神态 → 构图 → [灯光]）。
// Builder 只写到 [灯光]；[风格]（styleLabel + 固定功底尾）与 [负面提示] 由代码确定性追加，单一来源。
//
// 「不丢用户信息」的程序兜底：Builder 是自由文本生成，靠 system prompt 自觉不够稳；
// 出图前用代码校验 extras 是否逐字落进 prompt——缺了先回灌重试一次，仍缺则确定性补写，硬保证不丢。
export async function buildPrompt(plan: VisualPlan): Promise<string> {
  const systemPrompt = loadSystemPrompt()
  const messages: ChatMessage[] = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: JSON.stringify(plan, null, 2) },
  ]

  let positive = await callBuilder(messages, 'Prompt Builder')

  if (positive === '') {
    // LLM 整段失败 → 确定性兜底（已含 extras），跳过 extras 校验
    positive = fallbackPrompt(plan)
  } else {
    // 校验 extras 是否逐字落进正文，缺则回灌重试一次、仍缺则确定性补写
    const extras = plan.extras ?? []
    let missing = findMissingExtras(positive, extras)
    if (missing.length > 0) {
      // 回灌上一轮输出 + 缺失清单，要求逐字补全；仅重试一次
      const retryMessages: ChatMessage[] = [
        ...messages,
        { role: 'assistant', content: positive },
        {
          role: 'user',
          content:
            `你漏掉了用户明确提到的细节：${missing.join('、')}。` +
            '请重写整段 prompt，把这些细节**逐字原样**自然写进画面描述（其余忠实保持），只输出 prompt 正文。',
        },
      ]
      const retry = await callBuilder(retryMessages, 'Prompt Builder（补全 extras）')
      if (retry !== '') positive = retry
      missing = findMissingExtras(positive, extras)
    }

    // 重试后仍缺 → 确定性补一句，硬保证「不丢用户信息」
    if (missing.length > 0) {
      console.warn(`[builder] Builder 未写入 extras，已确定性补写：${missing.join('、')}`)
      positive = `${positive}\n画面中还包含：${missing.join('、')}。`
    }
  }

  // [风格] 与 [负面提示] 由代码统一追加：单一来源、确定性，正常/兜底两条路径一致
  return appendNegative(`${positive}\n\n${styleSection(plan)}`)
}
