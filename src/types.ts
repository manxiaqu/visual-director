// 规则采样产出的人脸蓝图（弱化版：仅做轻度、偏好看的多样，不再反美化）
export interface FaceBlueprint {
  face_shape: string // 脸型
  eyes: string // 眼型
  brows: string // 眉型
  skin: string // 肤色
  feature: string // 讨喜特征点（梨涡/卧蚕/泪痣…），0–2 项以「、」连接；无则空串
}

// Planner 产出的「意图层」：只识别主题 + 年龄 + 性别等，不含视觉细节。
// 视觉维度由 Theme Engine + 采样器决定，prompt 由 Builder 翻译。
export interface PlanCore {
  theme: string // 美学主题（日系清新 / 韩系通勤 / 港风复古 / 初恋校园感）
  age: number
  gender: string
  mood: string
  visual_keywords: string[]
  appearance?: string // 可选的人类可读摘要
}

// 用户「明确点名」的维度——这些不允许被主题/采样覆盖（不丢用户信息）。
// 用户说了才放；没说的留给采样器。
export interface PinnedDims {
  theme?: string
  gender?: string
  age?: number
  hair?: string
  makeup?: string
  clothes?: string
  clothes_color?: string
  scene?: string
  lighting?: string
  pose?: string
  expression?: string
  shot?: string
  angle?: string
  style?: string
}

// Diversity Engine 在主题允许池内采样产出的「视觉骨架」。
export interface VisualSkeleton {
  styleLabel: string // 来自主题的风格标签
  hair: string
  makeup: string
  scene: string
  environment: string
  lighting: string
  shot: string
  angle: string
  composition: string // shot + angle 派生
  pose: string
  expression: string
  clothes: string
  clothes_color: string
}

// 完整方案 = 意图层 + 视觉骨架 + 弱化人脸 + 用户兜底碎信息
export interface VisualPlan extends PlanCore, VisualSkeleton {
  face: FaceBlueprint
  extras: string[] // 用户说了、但不属于任何已知维度的细节（戴帽子/抱猫/红伞…），Builder 必须写入
}

export interface PlannerOutput {
  plan: PlanCore
  pinned?: PinnedDims // 用户明确点名的维度
  extras?: string[] // 用户说了但不归任何维度的碎信息
}

export interface UnsupportedOutput {
  unsupported: true
  reason: string
}

export type PlannerResult = PlannerOutput | UnsupportedOutput

export function isUnsupported(result: PlannerResult): result is UnsupportedOutput {
  return (result as UnsupportedOutput).unsupported === true
}

export interface GenerationResult {
  userInput: string
  createdAt: string
  seed: number // 本次采样使用的 seed（可复现）
  plan: VisualPlan
  prompt: string
  imagePath?: string
  sourceUrl?: string
  contentType?: string
  model?: string
  imageSeed?: number // 即梦返回的出图 seed
}
