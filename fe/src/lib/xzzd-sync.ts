import type { XzzdSyncMode, XzzdSyncRow } from '@/lib/api'

export type XzzdSyncAction = 'create' | 'update' | 'unchanged' | 'skip' | 'unmatched'

export type XzzdSyncSummary = {
  create: number
  update: number
  unchanged: number
  skip: number
  unmatched: number
}

export function xzzdSyncAction(
  row: XzzdSyncRow,
  mode: XzzdSyncMode,
): { action: XzzdSyncAction; reason: string | null } {
  if (!row.userId) return { action: 'unmatched', reason: row.issue ?? '本地名单中未找到该学号' }
  if (row.issue) return { action: 'skip', reason: row.issue }
  if (row.upstreamScore == null) return { action: 'skip', reason: '缺少可导入的成绩' }
  if (row.localScore == null) return { action: 'create', reason: null }
  if (Math.abs(row.localScore - row.upstreamScore) < 1e-9) {
    return { action: 'unchanged', reason: null }
  }
  if (mode === 'onlyEmpty') return { action: 'skip', reason: '本地已有成绩' }
  return { action: 'update', reason: null }
}

export function summarizeXzzdSync(
  rows: XzzdSyncRow[],
  mode: XzzdSyncMode,
): XzzdSyncSummary {
  const summary: XzzdSyncSummary = {
    create: 0,
    update: 0,
    unchanged: 0,
    skip: 0,
    unmatched: 0,
  }
  for (const row of rows) {
    summary[xzzdSyncAction(row, mode).action] += 1
  }
  return summary
}
