// 人脸/发型属性池——纯数据，不含逻辑。
// 采样逻辑见 blueprint.ts。词表与权重可边跑边调；将来可抽成可插拔数据包。

export interface PoolItem {
  value: string
  weight: number // 基础权重；主流类型偏高，但非主流给保底权重以防整体塌缩
  minAge?: number // 仅当 age ≥ minAge 才可采（成熟向特征）
  maxAge?: number // 仅当 age ≤ maxAge 才可采（如虎牙偏年轻）
  genders?: string[] // 允许的性别（规范化为「男」/「女」）；缺省=不限
  group?: string // 互斥组：同组特征不同现
}

export interface Pools {
  faceShape: PoolItem[]
  eyes: PoolItem[]
  browStyle: PoolItem[]
  skin: PoolItem[]
  feature: PoolItem[]
  hairLength: PoolItem[]
  hairTexture: PoolItem[]
}

// 反塌缩基准：以下值被视为「标准美」，采样结果不得三者全中（见 blueprint.ts）
export const STANDARD_FACE_SHAPE = '鹅蛋脸'
export const STANDARD_SKIN = '冷白肤色'

export const POOLS: Pools = {
  faceShape: [
    { value: '鹅蛋脸', weight: 5 },
    { value: '圆脸', weight: 4 },
    { value: '方圆脸', weight: 3 },
    { value: '长脸', weight: 3 },
    { value: '菱形脸', weight: 2 },
    { value: '方脸', weight: 2 },
  ],
  // 眼型：降「外双+大眼」（易回归 AI 网红脸），升内双/单眼皮/丹凤，更贴东方面孔分布
  eyes: [
    { value: '内双', weight: 5 },
    { value: '单眼皮', weight: 4 },
    { value: '杏眼', weight: 4 },
    { value: '丹凤眼', weight: 4 },
    { value: '细长眼', weight: 3 },
    { value: '外双', weight: 2 },
  ],
  // 眉型：东方面孔里「眉+眼」比鼻梁/唇厚更影响辨识度，单列一维以拉开人脸差异
  browStyle: [
    { value: '平直眉', weight: 4 },
    { value: '自然野生眉', weight: 4 },
    { value: '柳叶眉', weight: 3 },
    { value: '英气眉', weight: 3 },
    { value: '细眉', weight: 2 },
  ],
  // 肤色：即梦天然偏冷白皮，降其权重反向拉回自然/偏黄
  skin: [
    { value: '自然肤色', weight: 6 },
    { value: '偏黄肤色', weight: 5 },
    { value: '健康小麦色', weight: 3 },
    { value: '冷白肤色', weight: 2 },
  ],
  feature: [
    { value: '泪痣', weight: 3 },
    { value: '酒窝', weight: 3 },
    { value: '雀斑', weight: 2, maxAge: 35 },
    { value: '卧蚕', weight: 3 },
    { value: '虎牙', weight: 2, maxAge: 32 },
    { value: '唇下痣', weight: 2 },
    { value: '金属细框眼镜', weight: 2 },
  ],
  // 发型（长度/造型）：长发/中长发/锁骨发彼此太像，补入视觉差异明显的造型拉开区分
  hairLength: [
    { value: '短发', weight: 2 },
    { value: '齐肩短发', weight: 3, genders: ['女'] },
    { value: '法式短发', weight: 2, genders: ['女'] },
    { value: '锁骨发', weight: 4 },
    { value: '中长发', weight: 4 },
    { value: '长发', weight: 4 },
    { value: '高马尾', weight: 3, genders: ['女'] },
    { value: '低马尾', weight: 2, genders: ['女'] },
    { value: '丸子头', weight: 2, genders: ['女'] },
    { value: '盘发', weight: 2, genders: ['女'] },
  ],
  hairTexture: [
    { value: '直发', weight: 4 },
    { value: '自然微卷', weight: 4 },
    { value: '卷发', weight: 3 },
  ],
}

// 每张脸的特征点数量分布（0/1/2 项）
export const FEATURE_COUNT_WEIGHTS: Array<{ count: number; weight: number }> = [
  { count: 0, weight: 3 },
  { count: 1, weight: 5 },
  { count: 2, weight: 2 },
]

// archetype → 属性值权重倍率。
// key 以「子串包含」匹配 archetype（如「高知」命中「高知女性」）；命中的倍率叠乘到对应值的权重上。
// 这样「高知女性」更容易戴眼镜、「运动少女」更容易马尾/小麦色，杜绝「高知女性配双马尾 JK」。
export type ArchetypeBias = Record<string, Record<string, number>>

export const ARCHETYPE_BIAS: ArchetypeBias = {
  高知: { 金属细框眼镜: 4, 方圆脸: 1.8, 长脸: 1.6, 平直眉: 2, 内双: 1.3 },
  教师: { 金属细框眼镜: 3, 盘发: 1.5, 平直眉: 1.5 },
  白领: { 锁骨发: 1.5, 直发: 1.4, 平直眉: 1.5 },
  运动: { 健康小麦色: 3, 高马尾: 4, 雀斑: 2, 自然野生眉: 2, 短发: 1.5 },
  学生: { 齐肩短发: 1.5, 高马尾: 1.8, 虎牙: 1.6, 自然野生眉: 1.5 },
  初恋: { 锁骨发: 1.5, 自然微卷: 1.4, 酒窝: 1.8, 柳叶眉: 1.3 },
  咖啡: { 圆脸: 1.6, 酒窝: 2, 卷发: 2.5, 柳叶眉: 1.2 },
  国风: { 鹅蛋脸: 1.6, 长发: 2, 盘发: 2.5, 丹凤眼: 2, 柳叶眉: 3 },
  文艺: { 雀斑: 2, 自然微卷: 2, 泪痣: 1.5, 细眉: 1.3 },
  博主: { 锁骨发: 1.5, 卷发: 1.5, 柳叶眉: 1.3 },
}
