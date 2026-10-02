import { isBinaryFileSync } from 'isbinaryfile-browser'
import mime from 'mime'

import type { Score } from '@/lib/api'

/** 批改页的学生条目（上游提交者 + 本地成绩匹配） */
export type GradeStudent = {
  /** 学在浙大 person id */
  personId: number
  /** 本地 Student.stuId；未按学号匹配到为 null */
  stuId: string | null
  name: string
  studentNo: string
  /** 本地报告分（Score type=2） */
  score: Score | null
}

/** 展示分数：整数不带小数，其余保留一位小数 */
export function formatScore(value: number): string {
  return Number.isInteger(value) ? String(value) : String(Math.round(value * 10) / 10)
}

export type FileKind = 'pdf' | 'image' | 'other'

/** 推断 MIME（mime 查不到时给通用二进制） */
export function lookupMime(name: string): string {
  return mime.getType(name) ?? 'application/octet-stream'
}

/** 按 MIME（mime）判断预览类型；文本与否交给 isProbablyText 按内容判断 */
export function detectFileKind(name: string): FileKind {
  const type = mime.getType(name)
  if (type === 'application/pdf') return 'pdf'
  if (type?.startsWith('image/')) return 'image'
  return 'other'
}

/** 按内容判断是否为纯文本（isbinaryfile 的浏览器移植版，采样前 512 字节） */
export function isProbablyText(bytes: Uint8Array): boolean {
  return !isBinaryFileSync(bytes)
}

/** 文件名扩展名（小写，无扩展名返回空串） */
export function fileExtension(name: string): string {
  const dot = name.lastIndexOf('.')
  return dot >= 0 ? name.slice(dot + 1).toLowerCase() : ''
}

/** 流式下载进度：total 为 null 表示未知（无法算百分比） */
export type FetchProgress = {
  loaded: number
  /** 响应 Content-Length，缺失为 null */
  total: number | null
}

/** 流式下载并上报进度；无 body 时不报总长、一次性返回 */
export async function fetchBytesWithProgress(
  url: string,
  onProgress?: (progress: FetchProgress) => void,
): Promise<Uint8Array> {
  const response = await fetch(url)
  if (!response.ok) throw new Error(`下载失败（${response.status}）`)

  const lengthHeader = response.headers.get('content-length')
  const parsed = lengthHeader ? Number(lengthHeader) : Number.NaN
  const total = Number.isFinite(parsed) && parsed > 0 ? parsed : null

  if (!response.body) {
    const bytes = new Uint8Array(await response.arrayBuffer())
    onProgress?.({ loaded: bytes.length, total: total ?? bytes.length })
    return bytes
  }

  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let loaded = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    chunks.push(value)
    loaded += value.length
    onProgress?.({ loaded, total })
  }

  const bytes = new Uint8Array(loaded)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.length
  }
  return bytes
}

/** 触发浏览器保存已下载的字节 */
export function saveBytes(bytes: Uint8Array, name: string): void {
  const copy = Uint8Array.from(bytes)
  const url = URL.createObjectURL(new Blob([copy.buffer], { type: 'application/octet-stream' }))
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = name
  anchor.click()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}

/** 下载百分比（0–100，总长未知返回 null） */
export function downloadPercent(
  progress: FetchProgress | null,
  fallbackTotal: number,
): number | null {
  const total = progress?.total ?? (fallbackTotal > 0 ? fallbackTotal : null)
  if (!total) return null
  const loaded = progress?.loaded ?? 0
  return Math.min(100, Math.round((loaded / total) * 100))
}
