// 规则采样产出的人脸蓝图（4 维）
export interface FaceBlueprint {
  face_shape: string // 脸型
  eyes: string // 眼型
  brows: string // 眉型
  skin: string // 肤色
  feature: string // 特征点，0–2 项以「、」连接；无则空串
}

// 规则采样产出的发型蓝图
export interface HairBlueprint {
  length: string // 长度
  texture: string // 质感
}

// Planner 产出的核心人物设定：不含五官 / 发型 / prompt，
// 这些分别交给规则采样器与 Prompt Builder 负责，避免 LLM 自由发挥导致同质化。
export interface PlanCore {
  archetype: string
  occupation: string // archetype 下的具体职业子类型（如 高知女性 → 大学教师 / 律师 / 医生）
  age: number
  gender: string
  temperament: string
  clothes: string
  clothes_color: string // 推断出的具体服装配色
  expression: string
  pose: string
  scene: string
  environment: string
  lighting: string
  composition: string
  mood: string
  style: string
  visual_keywords: string[]
  appearance?: string // 可选的人类可读摘要，不再是五官来源
}

// 采样组装后的完整方案 = 核心设定 + 采样得到的脸/发
export interface VisualPlan extends PlanCore {
  face: FaceBlueprint
  hair_blueprint: HairBlueprint
}

export interface PlannerOutput {
  plan: PlanCore
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
  seed: number // 本次人脸采样使用的 seed（可复现）
  plan: VisualPlan
  prompt: string
  imagePath?: string
  sourceUrl?: string
  contentType?: string
  model?: string
  imageSeed?: number // 即梦返回的出图 seed，与采样 seed 不同
}
