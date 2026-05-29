export interface VisualPlan {
  age: number
  gender: string
  temperament: string
  face: string
  hair: string
  clothes: string
  scene: string
  camera: string
  lighting: string
}

export interface PlannerOutput {
  plan: VisualPlan
  prompt: string
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
  imagePath?: string
  sourceUrl?: string
  contentType?: string
}
