import { apiFetch } from '@/lib/api/client'
import type { Experiment } from '@/lib/api/types'
import { getZjuamCredential } from '@/lib/zjuam'

export function updateExperiment(
  id: string,
  body: {
    mark?: string
    title?: string
    questionBankId?: string | null
    xzzdBindIdCheckout?: string | null
    xzzdBindIdReport?: string | null
    publishTime?: string | null
    checkoffDeadline?: string | null
    reportDeadline?: string | null
  },
): Promise<{ experiment: Experiment }> {
  return apiFetch<{ experiment: Experiment }>(`/api/experiments/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  })
}

export type ExperimentsWithCurrent = {
  experiments: Experiment[]
  /** 截止时间最早的进行中实验编号；无进行中实验时为 null */
  currentMark: string | null
}

export function fetchExperimentsWithCurrent(classId: string): Promise<ExperimentsWithCurrent> {
  return apiFetch<ExperimentsWithCurrent>(
    `/api/experiments/with-current?classId=${encodeURIComponent(classId)}`,
  )
}

export type ZjuamHomework = {
  id: number
  title: string
  uniqueKey: string
  endTime: string | null
  isClosed: boolean
  hasScoreCount: number
}

export function fetchExperimentHomeworks(
  experimentId: string,
): Promise<{ homeworks: ZjuamHomework[] }> {
  const local = getZjuamCredential()
  const body = local ? { account: local.account, password: local.password } : {}
  return apiFetch<{ homeworks: ZjuamHomework[] }>(
    `/api/experiments/${experimentId}/xzzd-homeworks`,
    { method: 'POST', body: JSON.stringify(body) },
  )
}

/** 学在浙大作业提交记录（student-submissions 接口） */
export type ZjuamHomeworkSubmission = {
  id: number
  created_at: string | null
  /** 提交者 ZJU person id */
  created_by: { id: number } | null
  attachments_size?: number
  instructor_comment: string | null
  instructor_score: number | null
  marked_submitted: boolean
  score: number | null
  submit_by_instructor: boolean
  [key: string]: unknown
}

/** 学在浙大作业成绩（homework-scores 接口） */
export type ZjuamHomeworkScore = {
  activity_id: number
  /** 学生 ZJU person id */
  student_id: number
  final_score: string | null
  instructor_comment: string | null
  score: string | null
  status_comment: string | null
  [key: string]: unknown
}

/** 学在浙大课程学生（course students 接口，已裁剪为 id / 姓名 / 学号） */
export type ZjuamCourseStudent = {
  /** ZJU person id（与提交记录 created_by.id、成绩 student_id 对应） */
  id: number
  name: string
  /** 学号 */
  studentId: string
}

/** 推送流程第一步（只读）拉取到的上游数据 */
export type ZjuamHomeworkSyncData = {
  activityId: string
  submissions: ZjuamHomeworkSubmission[]
  homeworkScores: ZjuamHomeworkScore[]
  students: ZjuamCourseStudent[]
}

/** 推送流程组装出的单个学生结果（对应后端 lib/xzzd-push.ts） */
export type XzzdPushTarget = {
  userId: string
  name: string
  studentId: string
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

export function fetchXzzdPushPreview(
  experimentId: string,
  kind: 'checkout' | 'report',
): Promise<ZjuamHomeworkSyncData> {
  const local = getZjuamCredential()
  const body = local ? { kind, account: local.account, password: local.password } : { kind }
  return apiFetch<ZjuamHomeworkSyncData>(`/api/experiments/${experimentId}/xzzd-push/preview`, {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

export type XzzdSyncMode = 'onlyEmpty' | 'overwrite'

export type XzzdSyncMapping = {
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

export type XzzdSyncPreview = {
  activity: {
    id: string
    title: string
    endTime: string | null
    isClosed: boolean
    hasScoreCount: number
  }
  experiment: {
    id: string
    mark: string
    title: string
    classId: string
  }
  type: number
  lastSyncAt: string | null
  rows: XzzdSyncRow[]
}

export type XzzdSyncApplyResult = {
  create: number
  update: number
  unchanged: number
  skip: number
  unmatched: number
  lastSyncAt: string | null
}

function xzzdSyncCredentialBody() {
  const local = getZjuamCredential()
  return local ? { account: local.account, password: local.password } : {}
}

export function fetchXzzdSyncPreview(
  experimentId: string,
  activityId: string,
  type: number,
  mapping?: XzzdSyncMapping | null,
): Promise<XzzdSyncPreview> {
  return apiFetch<XzzdSyncPreview>(`/api/experiments/${experimentId}/xzzd-sync/preview`, {
    method: 'POST',
    body: JSON.stringify({ activityId, type, mapping, ...xzzdSyncCredentialBody() }),
  })
}

export function applyXzzdSync(
  experimentId: string,
  body: {
    activityId: string
    type: number
    mode: XzzdSyncMode
    mapping?: XzzdSyncMapping | null
  },
): Promise<XzzdSyncApplyResult> {
  return apiFetch<XzzdSyncApplyResult>(`/api/experiments/${experimentId}/xzzd-sync/apply`, {
    method: 'POST',
    body: JSON.stringify({ ...body, ...xzzdSyncCredentialBody() }),
  })
}

/** 学在浙大提交附件（submission_list 接口裁剪） */
export type ZjuamSubmissionAttachment = {
  id: number
  name: string
  size: number
  /** tcmedia 下载 key（hex） */
  key: string
  /** tcmedia 签名下载链接；获取失败为 null */
  url: string | null
}

export function fetchXzzdSubmissionAttachments(
  experimentId: string,
  personId: number,
  kind: 'checkout' | 'report' = 'report',
): Promise<{ activityId: string; attachments: ZjuamSubmissionAttachment[] }> {
  const local = getZjuamCredential()
  const body = local ? { kind, account: local.account, password: local.password } : { kind }
  return apiFetch(`/api/experiments/${experimentId}/xzzd-submissions/${personId}`, {
    method: 'POST',
    body: JSON.stringify(body),
  })
}
