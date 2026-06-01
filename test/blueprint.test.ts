import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mulberry32 } from '../src/face/rng.js'
import { sampleBlueprint } from '../src/face/blueprint.js'
import { STANDARD_FACE_SHAPE, STANDARD_SKIN } from '../src/face/pools.js'

const SEEDS = 400

function featuresOf(feature: string): string[] {
  return feature ? feature.split('、') : []
}

test('确定性：同 seed → 同 blueprint', () => {
  const a = sampleBlueprint({ age: 28, gender: '女' }, mulberry32(42))
  const b = sampleBlueprint({ age: 28, gender: '女' }, mulberry32(42))
  assert.deepEqual(a, b)
})

test('差异性：不同 seed 大概率产出不同的脸', () => {
  const faces = new Set<string>()
  for (let s = 1; s <= 50; s++) {
    faces.add(JSON.stringify(sampleBlueprint({ age: 28, gender: '女' }, mulberry32(s)).face))
  }
  // 50 个 seed 至少要采出 10 种以上不同的脸，否则说明塌缩
  assert.ok(faces.size >= 10, `差异化不足，仅 ${faces.size} 种`)
})

test('眉型：每张脸都有非空眉型', () => {
  for (let s = 1; s <= 50; s++) {
    const bp = sampleBlueprint({ age: 22, gender: '女' }, mulberry32(s))
    assert.ok(bp.face.brows && bp.face.brows.length > 0, `seed ${s} 缺眉型`)
  }
})

test('年龄门控：偏大不出虎牙', () => {
  for (let s = 1; s <= SEEDS; s++) {
    const bp = sampleBlueprint({ age: 40, gender: '女' }, mulberry32(s))
    assert.ok(!bp.face.feature.includes('虎牙'), `seed ${s} 不该出虎牙`)
  }
})

test('特征数量 ≤ 2', () => {
  for (let s = 1; s <= SEEDS; s++) {
    const bp = sampleBlueprint({ age: 22, gender: '女' }, mulberry32(s))
    const feats = featuresOf(bp.face.feature)
    assert.ok(feats.length <= 2, `seed ${s} 特征超过 2 个：${bp.face.feature}`)
  }
})

test('反塌缩：每张脸至少 1 个非标准美信号', () => {
  for (let s = 1; s <= SEEDS; s++) {
    const bp = sampleBlueprint({ age: 30, gender: '女' }, mulberry32(s))
    const nonStandard =
      bp.face.skin !== STANDARD_SKIN || bp.face.face_shape !== STANDARD_FACE_SHAPE || bp.face.feature.length > 0
    assert.ok(nonStandard, `seed ${s} 塌缩为标准美：${JSON.stringify(bp.face)}`)
  }
})

test('性别门控：男性不出仅限女性的发型（盘发）', () => {
  for (let s = 1; s <= SEEDS; s++) {
    const bp = sampleBlueprint({ age: 30, gender: '男' }, mulberry32(s))
    assert.notEqual(bp.hair.length, '盘发', `seed ${s} 男性不该盘发`)
  }
})

test('archetype 偏置：高知女性更容易戴眼镜', () => {
  let withGlasses = 0
  let withoutBias = 0
  for (let s = 1; s <= SEEDS; s++) {
    if (
      sampleBlueprint({ age: 33, gender: '女', archetype: '高知女性' }, mulberry32(s)).face.feature.includes(
        '金属细框眼镜',
      )
    ) {
      withGlasses++
    }
    if (
      sampleBlueprint({ age: 33, gender: '女', archetype: '普通人像' }, mulberry32(s)).face.feature.includes(
        '金属细框眼镜',
      )
    ) {
      withoutBias++
    }
  }
  assert.ok(withGlasses > withoutBias, `高知应更常戴眼镜：高知 ${withGlasses} vs 普通 ${withoutBias}`)
})
