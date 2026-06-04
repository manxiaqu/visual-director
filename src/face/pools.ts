// 人脸属性池（弱化版）——纯数据。
// 与旧版不同：不再反美化（不强行升单眼皮/偏黄、不强制法令纹/反塌缩）；
// 权重整体偏「年轻好看」，只保留轻度多样以防每张脸雷同。发型已移交主题（themes.ts）。

export interface PoolItem {
  value: string
  weight: number
  minAge?: number
  maxAge?: number
  genders?: string[] // 规范化为「男」/「女」；缺省=不限
  group?: string // 互斥组：同组特征不同现
}

export interface Pools {
  faceShape: PoolItem[]
  eyes: PoolItem[]
  browStyle: PoolItem[]
  skin: PoolItem[]
  feature: PoolItem[]
}

export const POOLS: Pools = {
  // 偏上镜脸型为主，保留少量变化
  faceShape: [
    { value: '鹅蛋脸', weight: 5 },
    { value: '瓜子脸', weight: 4 },
    { value: '椭圆脸', weight: 3 },
    { value: '圆脸', weight: 3 },
    { value: '心形脸', weight: 2 },
  ],
  // 偏好看眼型，仍含丹凤/单眼皮等东方特色但不再高权重压制大眼
  eyes: [
    { value: '杏眼', weight: 5 },
    { value: '桃花眼', weight: 4 },
    { value: '外双大眼', weight: 4 },
    { value: '丹凤眼', weight: 3 },
    { value: '圆眼', weight: 3 },
    { value: '内双', weight: 2 },
  ],
  browStyle: [
    { value: '柔和柳叶眉', weight: 4 },
    { value: '自然眉', weight: 4 },
    { value: '平直眉', weight: 3 },
    { value: '远山眉', weight: 2 },
  ],
  // 偏白皙/自然，去掉「偏黄高权重」的反美化设定
  skin: [
    { value: '白皙肤色', weight: 5 },
    { value: '自然肤色', weight: 5 },
    { value: '奶白肤色', weight: 4 },
    { value: '健康小麦色', weight: 2 },
  ],
  // 只保留讨喜特征；不再放法令纹/黑眼圈等。
  // 痣只放「眼下」这一种讨喜位置（美人痣），不放唇下等易减分位置；措辞明确指定位置，避免即梦乱点。
  feature: [
    { value: '梨涡', weight: 3 },
    { value: '酒窝', weight: 3 },
    { value: '卧蚕', weight: 3 },
    { value: '左眼下方一颗小泪痣', weight: 2 },
    { value: '虎牙', weight: 1, maxAge: 24 },
  ],
}

// 每张脸的特征点数量分布（0/1/2 项）。写真偏干净，0–1 为主。
export const FEATURE_COUNT_WEIGHTS: Array<{ count: number; weight: number }> = [
  { count: 0, weight: 4 },
  { count: 1, weight: 5 },
  { count: 2, weight: 1 },
]
