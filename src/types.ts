export interface VisualPlan {
  archetype: string
  age: number
  gender: string
  temperament: string
  appearance: string
  hair: string
  clothes: string
  expression: string
  pose: string
  scene: string
  environment: string
  lighting: string
  composition: string
  mood: string
  style: string
  visual_keywords: string[]
}

export interface PlannerOutput {
  plan: VisualPlan
  prompt: string
  negativePrompt: string
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
  plan: VisualPlan
  prompt: string
  rawPrompt: string
  negativePrompt: string
  imagePath?: string
  sourceUrl?: string
  contentType?: string
}
