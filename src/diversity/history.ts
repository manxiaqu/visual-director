// Diversity Engine · 最近使用历史（recentHistory）。
// 纯随机也会连续撞到「咖啡馆 + 半身 + 窗边光」，故对最近出现过的取值降权。
//
// 本项目是单次执行 CLI（跑完即退），内存活不过一次运行，因此跨次运行的去重
// 落地成一个轻量 sidecar：outputs/.history.json（不是数据库，仅一个 json 旁路文件）。
// batch 内多张共享同一份内存 history（每张采完即写回）。
//
// ⚠️ 可复现性豁免：用户显式指定 seed 时应走「同 seed → 同结果」纯复现，
//    此时不读不写 history（由调用方传 useHistory=false 控制），与降权互不打架。

import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

const HISTORY_PATH = join(resolve(process.cwd(), 'outputs'), '.history.json')

// 每个维度保留最近 N 条；落在窗口内的取值采样时降权。
const KEEP = 10

export interface History {
  scenes: string[]
  shots: string[]
  lighting: string[]
  poses: string[]
  wardrobe: string[]
  hair: string[]
}

export const HISTORY_DECAY = 0.3 // 最近出现过的取值，权重 ×0.3

export function emptyHistory(): History {
  return { scenes: [], shots: [], lighting: [], poses: [], wardrobe: [], hair: [] }
}

export function loadHistory(): History {
  if (!existsSync(HISTORY_PATH)) return emptyHistory()
  try {
    const raw = JSON.parse(readFileSync(HISTORY_PATH, 'utf-8')) as Partial<History>
    return {
      scenes: raw.scenes ?? [],
      shots: raw.shots ?? [],
      lighting: raw.lighting ?? [],
      poses: raw.poses ?? [],
      wardrobe: raw.wardrobe ?? [],
      hair: raw.hair ?? [],
    }
  } catch {
    // 文件损坏不致命，退回空历史
    return emptyHistory()
  }
}

// 把本次采样到的视觉骨架追加进 history（内存内），各维度只保留最近 KEEP 条。
export function pushHistory(
  history: History,
  used: { scene: string; shot: string; lighting: string; pose: string; clothes: string; hair: string },
): void {
  const push = (arr: string[], v: string) => {
    if (v) arr.push(v)
    if (arr.length > KEEP) arr.splice(0, arr.length - KEEP)
  }
  push(history.scenes, used.scene)
  push(history.shots, used.shot)
  push(history.lighting, used.lighting)
  push(history.poses, used.pose)
  push(history.wardrobe, used.clothes)
  push(history.hair, used.hair)
}

export function saveHistory(history: History): void {
  try {
    writeFileSync(HISTORY_PATH, JSON.stringify(history, null, 2), 'utf-8')
  } catch {
    // 写失败不致命，仅本次去重失效
  }
}
