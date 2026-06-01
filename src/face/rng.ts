// 可复现随机源：给定同一个 seed，产出的随机序列完全一致。
// 用于人脸采样——同 seed 复现同一张脸；batch 用 seed+index 产出「不同但可控」的一组。

export type Rng = () => number

// mulberry32：小而稳的 32 位 PRNG，足够本项目的采样需求。
export function mulberry32(seed: number): Rng {
  let a = seed >>> 0
  return function next(): number {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// 按权重从候选中采一项。getWeight 返回的权重已可叠加 archetype 偏置。
export function weightedPick<T>(items: T[], getWeight: (item: T) => number, rng: Rng): T {
  const total = items.reduce((sum, item) => sum + Math.max(0, getWeight(item)), 0)
  if (total <= 0) {
    return items[Math.floor(rng() * items.length)]
  }
  let r = rng() * total
  for (const item of items) {
    r -= Math.max(0, getWeight(item))
    if (r < 0) return item
  }
  return items[items.length - 1]
}
