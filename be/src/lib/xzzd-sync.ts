import type { ZjuamCourseStudent, ZjuamHomeworkScore } from './zjuam.js'

export type XzzdSyncMode = 'onlyEmpty' | 'overwrite'

export type XzzdScoreMapping = {
  sourceMin: number
  sourceMax: number
  targetMin: number
  targetMax: number
}

export type XzzdSyncRow = {
  userId: string | null
  name: string
  studentId: string
  personId: number | null
  rawScore: number | null
  upstreamScore: number | null
  upstreamComment: string | null
  localScore: number | null
  issue: string | null
}

export type XzzdSyncAction = 'create' | 'update' | 'unchanged' | 'skip' | 'unmatched'

export type XzzdSyncSummary = {
  create: number
  update: number
  unchanged: number
  skip: number
  unmatched: number
}

export type LocalSyncStudent = {
  userId: string
  name: string
  studentId: string
}

function parseScoreValue(value: string | null): number | null {
  if (value == null) return null
  const trimmed = value.trim()
  if (!trimmed) return null
  const parsed = Number(trimmed)
  if (!Number.isFinite(parsed)) return null
  return Math.round(parsed * 10) / 10
}

function pickUpstreamScore(rows: ZjuamHomeworkScore[]): {
  score: number | null
  comment: string | null
} {
  const comment = rows.find((row) => row.instructor_comment)?.instructor_comment ?? null

  for (const row of rows) {
    const score = parseScoreValue(row.final_score)
    if (score != null) return { score, comment: row.instructor_comment ?? comment }
  }
  for (const row of rows) {
    const score = parseScoreValue(row.score)
    if (score != null) return { score, comment: row.instructor_comment ?? comment }
  }
  return { score: null, comment }
}

export function mapXzzdScore(
  rawScore: number | null,
  mapping: XzzdScoreMapping | null | undefined,
): number | null {
  if (rawScore == null || !mapping) return rawScore
  const sourceSpan = mapping.sourceMax - mapping.sourceMin
  const targetSpan = mapping.targetMax - mapping.targetMin
  if (sourceSpan === 0 || targetSpan === 0) return null
  const mapped =
    mapping.targetMin +
    ((rawScore - mapping.sourceMin) / sourceSpan) * targetSpan
  return Math.round(mapped * 10) / 10
}

/** 将学在浙大作业成绩映射到本地学生，不写库 */
export function buildXzzdSyncRows(input: {
  activityId: string
  localStudents: LocalSyncStudent[]
  upstreamStudents: ZjuamCourseStudent[]
  homeworkScores: ZjuamHomeworkScore[]
  localScores: Map<string, number>
  mapping?: XzzdScoreMapping | null
}): XzzdSyncRow[] {
  const upstreamByStudentId = new Map<string, ZjuamCourseStudent>()
  for (const student of input.upstreamStudents) {
    if (!upstreamByStudentId.has(student.studentId)) {
      upstreamByStudentId.set(student.studentId, student)
    }
  }

  const scoresByPersonId = new Map<number, ZjuamHomeworkScore[]>()
  for (const row of input.homeworkScores) {
    if (String(row.activity_id) !== input.activityId) continue
    const list = scoresByPersonId.get(row.student_id)
    if (list) list.push(row)
    else scoresByPersonId.set(row.student_id, [row])
  }

  const localStudentIds = new Set(input.localStudents.map((student) => student.studentId))
  const rows: XzzdSyncRow[] = []

  for (const student of input.localStudents) {
    const upstream = upstreamByStudentId.get(student.studentId)
    const scoreRows = upstream ? (scoresByPersonId.get(upstream.id) ?? []) : []
    const picked = pickUpstreamScore(scoreRows)
    const mappedScore = mapXzzdScore(picked.score, input.mapping)

    let issue: string | null = null
    if (!upstream) issue = '学在浙大课程中未找到该学号'
    else if (scoreRows.length === 0) issue = '学在浙大中暂无成绩'
    else if (picked.score == null) issue = '学在浙大成绩为空或格式不正确'
    else if (mappedScore == null) issue = '百分比映射配置无效'
    else if (mappedScore < -1000 || mappedScore > 1000) issue = '映射后的成绩超出允许范围'

    rows.push({
      userId: student.userId,
      name: student.name,
      studentId: student.studentId,
      personId: upstream?.id ?? null,
      rawScore: picked.score,
      upstreamScore: mappedScore,
      upstreamComment: picked.comment,
      localScore: input.localScores.get(student.userId) ?? null,
      issue,
    })
  }

  for (const upstream of input.upstreamStudents) {
    if (localStudentIds.has(upstream.studentId)) continue
    const picked = pickUpstreamScore(scoresByPersonId.get(upstream.id) ?? [])
    rows.push({
      userId: null,
      name: upstream.name,
      studentId: upstream.studentId,
      personId: upstream.id,
      rawScore: picked.score,
      upstreamScore: mapXzzdScore(picked.score, input.mapping),
      upstreamComment: picked.comment,
      localScore: null,
      issue: '本地名单中未找到该学号',
    })
  }

  rows.sort((a, b) => {
    if ((a.userId == null) !== (b.userId == null)) return a.userId == null ? 1 : -1
    return a.studentId.localeCompare(b.studentId)
  })

  return rows
}

/** 根据冲突策略计算某一行会发生什么 */
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

export function summarizeXzzdSyncRows(
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
    const { action } = xzzdSyncAction(row, mode)
    summary[action] += 1
  }
  return summary
}
