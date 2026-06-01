import type { FaceBlueprint, HairBlueprint } from '../types.js'
import type { Rng } from './rng.js'
import { weightedPick } from './rng.js'
import type { PoolItem } from './pools.js'
import { POOLS, ARCHETYPE_BIAS, FEATURE_COUNT_WEIGHTS, STANDARD_FACE_SHAPE, STANDARD_SKIN } from './pools.js'

export interface SampleContext {
  age: number
  gender: string // 原始值，内部规范化为「男」/「女」
  archetype?: string
}

export interface Blueprint {
  face: FaceBlueprint
  hair: HairBlueprint
}

function normalizeGender(gender: string): string {
  return gender.includes('男') ? '男' : '女'
}

// 条件门控：年龄区间 + 性别。不满足则该项不进候选。
function eligible(item: PoolItem, ctx: SampleContext): boolean {
  if (item.minAge !== undefined && ctx.age < item.minAge) return false
  if (item.maxAge !== undefined && ctx.age > item.maxAge) return false
  if (item.genders && !item.genders.includes(ctx.gender)) return false
  return true
}

// archetype 偏置：key 子串命中 archetype 时，把该值的权重倍率叠乘进来。
function biasFor(value: string, archetype: string | undefined): number {
  if (!archetype) return 1
  let mult = 1
  for (const key of Object.keys(ARCHETYPE_BIAS)) {
    if (archetype.includes(key)) {
      const m = ARCHETYPE_BIAS[key][value]
      if (m) mult *= m
    }
  }
  return mult
}

// 从单维属性池采一项（先按条件过滤，再按权重×偏置采样）。
function pickFrom(pool: PoolItem[], ctx: SampleContext, rng: Rng): string {
  const candidates = pool.filter((item) => eligible(item, ctx))
  const list = candidates.length > 0 ? candidates : pool // 兜底，避免过滤后空池
  const chosen = weightedPick(list, (item) => item.weight * biasFor(item.value, ctx.archetype), rng)
  return chosen.value
}

function pickFeatureCount(rng: Rng): number {
  return weightedPick(FEATURE_COUNT_WEIGHTS, (item) => item.weight, rng).count
}

// 采样 0–2 个特征：逐个采，遵守条件门控与互斥组（同 group 只取一个）。
function sampleFeatures(ctx: SampleContext, rng: Rng, forceAtLeastOne: boolean): string[] {
  const count = forceAtLeastOne ? Math.max(1, pickFeatureCount(rng)) : pickFeatureCount(rng)
  if (count === 0) return []

  const chosen: PoolItem[] = []
  const usedGroups = new Set<string>()
  for (let k = 0; k < count; k++) {
    const available = POOLS.feature.filter(
      (item) => eligible(item, ctx) && !chosen.includes(item) && (!item.group || !usedGroups.has(item.group)),
    )
    if (available.length === 0) break
    const item = weightedPick(available, (it) => it.weight * biasFor(it.value, ctx.archetype), rng)
    chosen.push(item)
    if (item.group) usedGroups.add(item.group)
  }
  return chosen.map((item) => item.value)
}

// 反塌缩判定：脸型/肤色/特征不得三者全为「标准美」。
function hasNonStandardSignal(faceShape: string, skin: string, features: string[]): boolean {
  return faceShape !== STANDARD_FACE_SHAPE || skin !== STANDARD_SKIN || features.length > 0
}

// 给定 ctx 与 rng 采样出一张自洽且差异化的人脸 + 发型蓝图。纯函数：同 rng 序列同结果。
export function sampleBlueprint(rawCtx: SampleContext, rng: Rng): Blueprint {
  const ctx: SampleContext = { ...rawCtx, gender: normalizeGender(rawCtx.gender) }

  const face_shape = pickFrom(POOLS.faceShape, ctx, rng)
  const eyes = pickFrom(POOLS.eyes, ctx, rng)
  const brows = pickFrom(POOLS.browStyle, ctx, rng)
  const skin = pickFrom(POOLS.skin, ctx, rng)

  let features = sampleFeatures(ctx, rng, false)
  // 反塌缩：若采到「标准脸型 + 标准肤色 + 无特征」，强制补一个特征打破网红脸塌缩。
  if (!hasNonStandardSignal(face_shape, skin, features)) {
    features = sampleFeatures(ctx, rng, true)
  }

  const length = pickFrom(POOLS.hairLength, ctx, rng)
  const texture = pickFrom(POOLS.hairTexture, ctx, rng)

  return {
    face: { face_shape, eyes, brows, skin, feature: features.join('、') },
    hair: { length, texture },
  }
}
