// Diversity Engine · 视觉骨架采样器（主题驱动）。
// 纯函数，同 rng 序列同结果。每个维度：pinned 命中 → 直接用用户值（不丢用户信息）；
// 否则在【主题允许池】内按 权重 × history 降权 采样（保证同主题、组内多样）。

import type { PinnedDims, VisualSkeleton } from '../types.js'
import type { Rng } from '../face/rng.js'
import { weightedPick } from '../face/rng.js'
import type { DimItem } from './pools.js'
import { ANGLE } from './pools.js'
import type { Theme } from './themes.js'
import type { History } from './history.js'
import { HISTORY_DECAY } from './history.js'

// history 降权：刚用过的那一个（窗口最末）强压、几乎不连续重复；更早出现过的软降权 ×0.3。
const JUST_USED_PENALTY = 0.04
function penalty(value: string, recent: string[]): number {
  if (recent.length > 0 && value === recent[recent.length - 1]) return JUST_USED_PENALTY
  return recent.includes(value) ? HISTORY_DECAY : 1
}

// 从池内采一项：基础权重 × history 降权。recent 传 [] 表示该维度不参与去重。
function pick(pool: DimItem[], recent: string[], rng: Rng): string {
  if (pool.length === 0) return ''
  return weightedPick(pool, (item) => item.weight * penalty(item.value, recent), rng).value
}

// 给定主题 + 用户 pinned + rng + 历史，采出一套自洽且组内多样的视觉骨架。
export function sampleSkeleton(theme: Theme, pinned: PinnedDims, rng: Rng, history: History): VisualSkeleton {
  const hair = pinned.hair ?? pick(theme.hair, history.hair, rng)
  const makeup = pinned.makeup ?? pick(theme.makeup, [], rng)
  const clothes = pinned.clothes ?? pick(theme.outfit, history.wardrobe, rng)
  const clothes_color = pinned.clothes_color ?? pick(theme.outfitColors, [], rng)
  const scene = pinned.scene ?? pick(theme.scene, history.scenes, rng)
  const lighting = pinned.lighting ?? pick(theme.lighting, history.lighting, rng)
  const pose = pinned.pose ?? pick(theme.pose, history.poses, rng)
  const expression = pinned.expression ?? pick(theme.expression, [], rng)
  const shot = pinned.shot ?? pick(theme.shot, history.shots, rng)
  const angle = pinned.angle ?? pick(ANGLE, [], rng)

  return {
    styleLabel: pinned.style ?? theme.styleLabel,
    hair,
    makeup,
    scene,
    environment: '', // 留空，Builder 据 scene + lighting 补足
    lighting,
    shot,
    angle,
    composition: `${shot}，${angle}`,
    pose,
    expression,
    clothes,
    clothes_color,
  }
}
