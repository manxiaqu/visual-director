// 本轮改动的回归测试：古风清池 / 黑丝美腿景别降权 / 采样不漏脏 pose。
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { themeFor, matchTheme } from '../src/diversity/themes.js'
import { sampleSkeleton } from '../src/diversity/skeleton.js'
import { mulberry32 } from '../src/face/rng.js'
import { emptyHistory } from '../src/diversity/history.js'

test('古风清池：pose 不再含「自拍」，含道具动作', () => {
  const g = themeFor('古风旗袍')
  const poses = g.pose.map((p) => p.value)
  assert.ok(!poses.some((p) => p.includes('自拍')), `古风 pose 仍含自拍：${poses.join('/')}`)
  assert.ok(poses.includes('执团扇'), '古风缺「执团扇」')
  assert.ok(poses.includes('撑油纸伞'), '古风缺「撑油纸伞」')
})

test('古风采样多次都不出「自拍」', () => {
  const g = themeFor('古风旗袍')
  for (let s = 1; s <= 50; s++) {
    const sk = sampleSkeleton(g, {}, mulberry32(s), emptyHistory())
    assert.ok(!sk.pose.includes('自拍'), `seed ${s} 采到自拍：${sk.pose}`)
  }
})

test('黑丝美腿：腿部特写权重已低于全身（崩坏景别降权）', () => {
  const h = themeFor('黑丝美腿身材向')
  const leg = h.shot.find((s) => s.value === '腿部特写')?.weight ?? 0
  const full = h.shot.find((s) => s.value === '全身')?.weight ?? 0
  assert.ok(leg > 0 && full > 0, '景别项缺失')
  assert.ok(leg < full, `腿部特写(${leg}) 应低于全身(${full})`)
})

test('matchTheme：简写/关键词命中，真拼错返回 null（daily 防呆用）', () => {
  assert.equal(matchTheme('氛围感')?.name, '氛围感情绪片', '关键词「氛围感」应命中')
  assert.equal(matchTheme('氛围感情绪片')?.name, '氛围感情绪片', '精确名应命中')
  assert.equal(matchTheme('JK')?.name, 'JK校园制服', '关键词「JK」应命中')
  assert.equal(matchTheme('旗袍')?.name, '古风旗袍', '关键词「旗袍」应命中')
  assert.equal(matchTheme('不存在的主题xyz'), null, '真拼错应返回 null')
})

test('pinned 维度不被采样覆盖（不丢用户信息）', () => {
  const g = themeFor('古风旗袍')
  const sk = sampleSkeleton(g, { scene: '图书馆', pose: '自拍' }, mulberry32(1), emptyHistory())
  assert.equal(sk.scene, '图书馆', 'pinned.scene 应原样保留')
  assert.equal(sk.pose, '自拍', 'pinned.pose 应原样保留（用户显式指定不受清池影响）')
})
