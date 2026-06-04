import type { FaceBlueprint } from '../types.js'
import type { Rng } from './rng.js'
import { weightedPick } from './rng.js'
import type { PoolItem } from './pools.js'
import { POOLS, FEATURE_COUNT_WEIGHTS } from './pools.js'

export interface FaceContext {
  age: number
  gender: string // 原始值，内部规范化为「男」/「女」
}

function normalizeGender(gender: string): string {
  return gender.includes('男') ? '男' : '女'
}

// 条件门控：年龄区间 + 性别。不满足则该项不进候选。
function eligible(item: PoolItem, ctx: FaceContext): boolean {
  if (item.minAge !== undefined && ctx.age < item.minAge) return false
  if (item.maxAge !== undefined && ctx.age > item.maxAge) return false
  if (item.genders && !item.genders.includes(ctx.gender)) return false
  return true
}

// 从单维属性池采一项（先按条件过滤，再按权重采样）。
function pickFrom(pool: PoolItem[], ctx: FaceContext, rng: Rng): string {
  const candidates = pool.filter((item) => eligible(item, ctx))
  const list = candidates.length > 0 ? candidates : pool
  return weightedPick(list, (item) => item.weight, rng).value
}

function pickFeatureCount(rng: Rng): number {
  return weightedPick(FEATURE_COUNT_WEIGHTS, (item) => item.weight, rng).count
}

// 采样 0–2 个讨喜特征：逐个采，遵守条件门控与互斥组（同 group 只取一个）。
function sampleFeatures(ctx: FaceContext, rng: Rng): string[] {
  const count = pickFeatureCount(rng)
  if (count === 0) return []

  const chosen: PoolItem[] = []
  const usedGroups = new Set<string>()
  for (let k = 0; k < count; k++) {
    const available = POOLS.feature.filter(
      (item) => eligible(item, ctx) && !chosen.includes(item) && (!item.group || !usedGroups.has(item.group)),
    )
    if (available.length === 0) break
    const item = weightedPick(available, (it) => it.weight, rng)
    chosen.push(item)
    if (item.group) usedGroups.add(item.group)
  }
  return chosen.map((item) => item.value)
}

// 采样一张「年轻好看、轻度多样」的人脸蓝图（弱化版：无反美化、无反塌缩）。
// 纯函数：同 rng 序列同结果。发型不在此处（已交给主题）。
export function sampleFace(rawCtx: FaceContext, rng: Rng): FaceBlueprint {
  const ctx: FaceContext = { age: rawCtx.age, gender: normalizeGender(rawCtx.gender) }

  const face_shape = pickFrom(POOLS.faceShape, ctx, rng)
  const eyes = pickFrom(POOLS.eyes, ctx, rng)
  const brows = pickFrom(POOLS.browStyle, ctx, rng)
  const skin = pickFrom(POOLS.skin, ctx, rng)
  const features = sampleFeatures(ctx, rng)

  return { face_shape, eyes, brows, skin, feature: features.join('、') }
}
