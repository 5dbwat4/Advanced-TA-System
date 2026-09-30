import type { ZjuamCourseStudent } from './zjuam'

/** 默认评分占比：功能测试 : 验收问答 : 报告 = 2 : 5 : 0 */
export const DEFAULT_SCORE_RATIO = [2, 5, 0]

/** 分数记录（来自本地 Score 表，已带评分人姓名） */
export type XzzdPushScoreRow = {
  stuId: string
  /** 0=功能测试 1=验收问答 2=报告 */
  type: number
  score: number
  graderName: string | null
  updatedAt: Date
}

/** 单个学生的推送组装结果 */
export type XzzdPushTarget = {
  stuId: string
  name: string
  studentNo: string
  /** 学在浙大 person id；未匹配到为 null */
  personId: number | null
  functionScore: number | null
  answerScore: number | null
  reportScore: number | null
  /** 推送给上游的分数：验收按功能测试/验收问答占比归一化到 100；缺成绩或无法计算为 null */
  pushScore: number | null
  /** 模板渲染后的评语 */
  comment: string
  /** 分数最近更新时间（ISO 字符串） */
  modifiedAt: string | null
  /** 无法推送时的原因；可推送为 null */
  skippedReason: string | null
}

/** 解析课程设置 JSON（损坏时返回空对象） */
export function parseClassSettings(raw: string | null): Record<string, unknown> {
  if (!raw) return {}
  try {
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {}
  } catch {
    return {}
  }
}

/** 规范化评分占比为三个非负整数；非法输入回退默认值 */
export function sanitizeScoreRatio(value: unknown): number[] {
  if (Array.isArray(value) && value.length === DEFAULT_SCORE_RATIO.length) {
    return value.map((item) => {
      const n = Math.floor(Number(item))
      return Number.isFinite(n) && n > 0 ? n : 0
    })
  }
  return [...DEFAULT_SCORE_RATIO]
}

/** 解析某实验最终生效的评分占比（统一模式取课程占比，否则取该实验占比） */
export function resolveScoreRatio(
  settings: Record<string, unknown>,
  experimentId: string,
): number[] {
  const perExperiment = settings.experimentScoreRatios
  const raw =
    settings.scoreRatioUnified === true
      ? settings.scoreRatio
      : ((perExperiment && typeof perExperiment === 'object' && !Array.isArray(perExperiment)
          ? (perExperiment as Record<string, unknown>)[experimentId]
          : undefined) ?? settings.scoreRatio)
  return sanitizeScoreRatio(raw)
}

/** 按占比加权计算总分：忽略权重为 0 的项目；权重 > 0 但缺成绩返回 null */
export function weightedTotal(scores: (number | null)[], ratio: number[]): number | null {
  let weightSum = 0
  let acc = 0
  for (let index = 0; index < ratio.length; index += 1) {
    const weight = ratio[index] ?? 0
    if (weight <= 0) continue
    const score = scores[index]
    if (score == null) return null
    weightSum += weight
    acc += weight * score
  }
  if (weightSum <= 0) return null
  return Math.round((acc / weightSum) * 10) / 10
}

/**
 * 计算推送给某类作业的分数：
 * - 验收作业：功能测试 + 验收问答按对应占比归一化到 100（两项权重均未配置时按等权平均兜底）；
 * - 报告作业：直接使用报告分（单一评分项，天然归一化到 100）。
 */
export function resolvePushScore(
  kind: 'checkout' | 'report',
  scores: { function: number | null; answer: number | null; report: number | null },
  ratio: number[],
): number | null {
  if (kind === 'report') return scores.report

  const values = [scores.function, scores.answer]
  const weights = [ratio[0] ?? 0, ratio[1] ?? 0]
  const weighted = weightedTotal(values, weights)
  if (weighted != null) return weighted
  return weightedTotal(values, [1, 1])
}

/**
 * 生成的分数与评语是否与上游成绩完全一致（一致时跳过发送）。
 * 上游缺少成绩或评语时一律视为不一致。
 */
export function isSameAsUpstream(
  target: { pushScore: number; comment: string },
  upstream: { final_score: string | null; instructor_comment: string | null } | null,
): boolean {
  if (!upstream) return false
  if (upstream.final_score == null || upstream.instructor_comment == null) return false

  const upstreamScore = Number(upstream.final_score)
  if (!Number.isFinite(upstreamScore)) return false
  if (Math.abs(upstreamScore - target.pushScore) > 1e-9) return false

  return upstream.instructor_comment === target.comment
}

/** 评语模板占位符 */
export const COMMENT_PLACEHOLDERS = {
  studentViewUrl: '{@STUDENT_VIEW_URL}',
  taAssigner: '{@TA_ASSIGNER}',
  scoreFunction: '{@SCORE_FUNCTION}',
  scoreAnswer: '{@SCORE_ANSWER}',
  timeModified: '{@TIME_MODIFIED}',
} as const

export type CommentTemplateVars = {
  studentViewUrl: string
  taAssigner: string
  scoreFunction: string
  scoreAnswer: string
  timeModified: string
}

/** 直接用字符串替换填充评语模板 */
export function renderCommentTemplate(template: string, vars: CommentTemplateVars): string {
  return template
    .replaceAll(COMMENT_PLACEHOLDERS.studentViewUrl, vars.studentViewUrl)
    .replaceAll(COMMENT_PLACEHOLDERS.taAssigner, vars.taAssigner)
    .replaceAll(COMMENT_PLACEHOLDERS.scoreFunction, vars.scoreFunction)
    .replaceAll(COMMENT_PLACEHOLDERS.scoreAnswer, vars.scoreAnswer)
    .replaceAll(COMMENT_PLACEHOLDERS.timeModified, vars.timeModified)
}

function pad2(value: number): string {
  return String(value).padStart(2, '0')
}

/** 2026/09/30 14:30 风格的时间文本 */
export function formatDateTime(value: Date | null): string {
  if (!value) return '—'
  return `${value.getFullYear()}/${pad2(value.getMonth() + 1)}/${pad2(value.getDate())} ${pad2(value.getHours())}:${pad2(value.getMinutes())}`
}

/** 展示分数：整数不带小数，其余保留一位小数；缺失显示 — */
function formatScore(value: number | null): string {
  if (value == null) return '—'
  return Number.isInteger(value) ? String(value) : String(Math.round(value * 10) / 10)
}

/** 学在浙大作业链接（学生查看地址） */
export function homeworkViewUrl(courseId: string, activityId: string): string {
  return `https://courses.zju.edu.cn/course/${courseId}/learning-activity/full-screen#/${activityId}`
}

export type AssemblePushTargetsInput = {
  kind: 'checkout' | 'report'
  courseId: string
  activityId: string
  /** 评语模板（checkout / report 由调用方选出） */
  template: string
  ratio: number[]
  /** 本地学生名单 */
  students: Array<{ stuId: string; name: string; studentNo: string }>
  /** 学在浙大学生名单（用于学号 → person id 映射） */
  upstreamStudents: ZjuamCourseStudent[]
  scores: XzzdPushScoreRow[]
}

/** 按模板组装每个学生的最终分与评语（不发送任何请求） */
export function assemblePushTargets(input: AssemblePushTargetsInput): XzzdPushTarget[] {
  const upstreamByNo = new Map(input.upstreamStudents.map((item) => [item.studentNo, item]))

  const scoresByStu = new Map<string, XzzdPushScoreRow[]>()
  for (const row of input.scores) {
    const list = scoresByStu.get(row.stuId)
    if (list) list.push(row)
    else scoresByStu.set(row.stuId, [row])
  }

  const studentViewUrl = homeworkViewUrl(input.courseId, input.activityId)
  // 验收取「验收问答」的评分人，报告取「报告」的评分人
  const preferredType = input.kind === 'report' ? 2 : 1

  return input.students.map((student) => {
    const rows = scoresByStu.get(student.stuId) ?? []
    const scoreOf = (type: number) => rows.find((row) => row.type === type)?.score ?? null
    const functionScore = scoreOf(0)
    const answerScore = scoreOf(1)
    const reportScore = scoreOf(2)
    const pushScore = resolvePushScore(
      input.kind,
      { function: functionScore, answer: answerScore, report: reportScore },
      input.ratio,
    )

    let modifiedAt: Date | null = null
    for (const row of rows) {
      if (!modifiedAt || row.updatedAt > modifiedAt) modifiedAt = row.updatedAt
    }

    const preferredGrader = rows.find((row) => row.type === preferredType && row.graderName)
    const latestGrader = rows
      .filter((row) => row.graderName)
      .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())[0]
    const graderName = preferredGrader?.graderName ?? latestGrader?.graderName ?? null

    const upstream = upstreamByNo.get(student.studentNo) ?? null

    const comment = renderCommentTemplate(input.template, {
      studentViewUrl,
      taAssigner: graderName ?? '—',
      scoreFunction: formatScore(functionScore),
      scoreAnswer: formatScore(answerScore),
      timeModified: formatDateTime(modifiedAt),
    })

    let skippedReason: string | null = null
    if (!upstream) skippedReason = '学在浙大课程中未找到该学号'
    else if (pushScore == null) skippedReason = '缺少成绩，无法计算推送分数'

    return {
      stuId: student.stuId,
      name: student.name,
      studentNo: student.studentNo,
      personId: upstream?.id ?? null,
      functionScore,
      answerScore,
      reportScore,
      pushScore,
      comment,
      modifiedAt: modifiedAt ? modifiedAt.toISOString() : null,
      skippedReason,
    }
  })
}
