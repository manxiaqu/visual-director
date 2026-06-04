import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mulberry32 } from '../src/face/rng.js'
import { sampleFace } from '../src/face/blueprint.js'

const SEEDS = 400

function featuresOf(feature: string): string[] {
  return feature ? feature.split('、') : []
}

test('确定性：同 seed → 同人脸', () => {
  const a = sampleFace({ age: 20, gender: '女' }, mulberry32(42))
  const b = sampleFace({ age: 20, gender: '女' }, mulberry32(42))
  assert.deepEqual(a, b)
})

test('差异性：不同 seed 大概率产出不同的脸', () => {
  const faces = new Set<string>()
  for (let s = 1; s <= 50; s++) {
    faces.add(JSON.stringify(sampleFace({ age: 20, gender: '女' }, mulberry32(s))))
  }
  assert.ok(faces.size >= 10, `差异化不足，仅 ${faces.size} 种`)
})

test('眉型：每张脸都有非空眉型', () => {
  for (let s = 1; s <= 50; s++) {
    const f = sampleFace({ age: 20, gender: '女' }, mulberry32(s))
    assert.ok(f.brows && f.brows.length > 0, `seed ${s} 缺眉型`)
  }
})

test('年龄门控：偏大不出虎牙', () => {
  for (let s = 1; s <= SEEDS; s++) {
    const f = sampleFace({ age: 30, gender: '女' }, mulberry32(s))
    assert.ok(!f.feature.includes('虎牙'), `seed ${s} 不该出虎牙`)
  }
})

test('特征数量 ≤ 2', () => {
  for (let s = 1; s <= SEEDS; s++) {
    const f = sampleFace({ age: 20, gender: '女' }, mulberry32(s))
    assert.ok(featuresOf(f.feature).length <= 2, `seed ${s} 特征超过 2 个：${f.feature}`)
  }
})
