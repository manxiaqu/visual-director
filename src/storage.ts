import { mkdirSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { randomBytes } from 'node:crypto'

const OUTPUTS_ROOT = resolve(process.cwd(), 'outputs')

function dateAndTime(): { date: string; time: string } {
  const now = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  const date = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
  const time = `${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`
  return { date, time }
}

// 两级结构：outputs/<日期>/<时间_短hash>/。
// 第一级按天归档，方便「每日一帖」产线按天取当天的图；第二级是单张的产物目录。
export function createRunDir(): string {
  const { date, time } = dateAndTime()
  const shortHash = randomBytes(3).toString('hex')
  const dir = join(OUTPUTS_ROOT, date, `${time}_${shortHash}`)
  mkdirSync(dir, { recursive: true })
  return dir
}

export function saveImage(dir: string, bytes: Buffer, fileName = 'image.png'): string {
  const path = join(dir, fileName)
  writeFileSync(path, bytes)
  return path
}

export function saveJson(dir: string, fileName: string, data: unknown): string {
  const path = join(dir, fileName)
  writeFileSync(path, JSON.stringify(data, null, 2), 'utf-8')
  return path
}

export function saveText(dir: string, fileName: string, content: string): string {
  const path = join(dir, fileName)
  writeFileSync(path, content, 'utf-8')
  return path
}
