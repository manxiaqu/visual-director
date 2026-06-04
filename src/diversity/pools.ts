// Diversity Engine · 通用维度池（与主题无关）。
// 写真各维度的"允许池"现在归各主题（见 themes.ts）；这里只留与审美无关的中性维度。

export interface DimItem {
  value: string
  weight: number
}

// 机位角度：审美中性，任何主题通用。
export const ANGLE: DimItem[] = [
  { value: '平视', weight: 5 },
  { value: '略俯（亲和）', weight: 3 },
  { value: '略仰（气场）', weight: 2 },
  { value: '高角度俯拍', weight: 2 },
  { value: '低角度仰拍', weight: 1 },
]
