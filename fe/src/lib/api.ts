import { deserializeItems, serializeItems } from '@/components/criteria/serialize'
import type { CriterionItem } from '@/components/criteria/types'
import type { CustomCards } from '@/lib/custom-cards'
import { getZjuamCredential } from '@/lib/zjuam'

const TOKEN_KEY = 'tasaas.token'

export type Role = 'TA' | 'TEACHER' | 'STUDENT'

export type MarkdownEditorId = 'uiw' | 'mdx'

export type MarkdownStyleId = 'github' | 'prose'

export type UserPreferences = {
  device: 'single' | 'multi'
  draw: 'random' | 'fixed'
  markdownEditor: MarkdownEditorId
  markdownStyle: MarkdownStyleId
  drawCount: number
  customCards: CustomCards
}

export type ClassInfo = {
  id: string
  name: string
  type: '2026-sys1' | '2026-sys2' | '2026-sys3'
  xzzdClassId?: string | null
  lastRosterSyncAt?: string | null
}

export type RosterEntry = { studentId: string; name: string }

export type RosterDiff = {
  added: RosterEntry[]
  removed: RosterEntry[]
  unchangedCount: number
}

export type Student = {
  userId: string
  name: string
  studentId: string
  classId: string | null
  status: string
  klass: ClassInfo | null
}

export type Ta = {
  id: string
  name: string
  studentId: string
  username: string | null
  classId: string | null
  classes: ClassInfo[]
  activated: boolean
  hasPassword: boolean
  zjuamAccount: string | null
  createdAt: string
}

export type Score = {
  userId: string
  type: number
  indId: string
  labId: string | null
  score: number
  graderId: string | null
  graderName: string | null
  createdAt: string
  updatedAt: string
}

export type Passkey = {
  id: string
  createdAt: string | null
  deviceType: string
}

export type User = {
  id: string
  name: string
  role: Role
  avatar: number | null
  studentId: string | null
  username: string | null
  classId: string | null
  classes: ClassInfo[]
  status: string
  hasWebauthn: boolean
  hasPassword: boolean
  passkeys: Passkey[]
  zjuamAccount: string | null
  hasZjuamPassword: boolean
  preferences: UserPreferences | null
}

export type Experiment = {
  id: string
  mark: string
  title: string
  classId: string
  questionBankId: string | null
  xzzdBindIdCheckout: string | null
  xzzdBindIdReport: string | null
  publishTime: string | null
  checkoffDeadline: string | null
  reportDeadline: string | null
  lastXzzdDownSyncAt: string | null
  lastXzzdUpSyncAt: string | null
  klass: { id: string; name: string; xzzdClassId: string | null }
  questionBank: { id: string; name: string } | null
  createdAt: string
  updatedAt: string
}

export type QuestionUser = {
  id: string
  username: string | null
  name: string
  avatar?: number | null
}

export type Course = {
  id: number
  name: string
  courseCode: string | null
  displayName: string | null
  isInstructor: boolean
}

export type Question = {
  id: string
  question: string
  answer: string
  provider: string
  createdAt: string
  updatedAt: string
  user: QuestionUser
}

export type QuestionBank = {
  id: string
  name: string
  owner: QuestionUser
  questions: string[]
  experimentCount: number
  createdAt: string
  updatedAt: string
}

export type CheckoffExperiment = {
  id: string
  mark: string
  title: string
  classId: string
  questionCount: number
}

export type CheckoffStudent = {
  userId: string
  name: string
  studentId: string
  avatar: number | null
}

export type LoginCandidate = {
  userId: string
  name: string
  studentId: string | null
  classId: string | null
  className: string | null
  role: Role
}

export type LoginSelection = {
  requiresSelection: true
  selectionToken: string
  candidates: LoginCandidate[]
}

/** ZJUAM 首次登录可选的班级 / 课程 */
export type ClassSelectCourse = {
  key: string
  name: string
  registered: boolean
}

export type LoginClassSelection = {
  requiresClassSelection: true
  selectionToken: string
  courses: ClassSelectCourse[]
}

export type LoginResult =
  | { token: string; user: User }
  | LoginSelection
  | LoginClassSelection

export function isLoginSelection(result: LoginResult): result is LoginSelection {
  return 'requiresSelection' in result && result.requiresSelection === true
}

export function isClassSelection(result: LoginResult): result is LoginClassSelection {
  return 'requiresClassSelection' in result && result.requiresClassSelection === true
}

/** 首次登录选择班级（selectionToken 由 ZJUAM 登录签发） */
export function selectZjuamClass(
  selectionToken: string,
  optionKey: string,
  type?: '2026-sys1' | '2026-sys2' | '2026-sys3',
): Promise<{ token: string; user: User }> {
  return apiFetch<{ token: string; user: User }>('/api/auth/zjuam/select-class', {
    method: 'POST',
    body: JSON.stringify({ selectionToken, optionKey, type }),
  })
}

/** 当前学号已绑定的全部课程账号（含助教 / 学生身份） */
export function fetchMyAccounts(): Promise<{ accounts: LoginCandidate[] }> {
  return apiFetch<{ accounts: LoginCandidate[] }>('/api/auth/accounts')
}

/** 在同学号的多个课程账号之间切换 */
export function switchMyAccount(userId: string): Promise<{ token: string; user: User }> {
  return apiFetch<{ token: string; user: User }>('/api/auth/accounts/switch', {
    method: 'POST',
    body: JSON.stringify({ userId }),
  })
}

export type CheckoffQuestion = {
  id: string
  question: string
  answer: string
  user: QuestionUser
}

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY)
}

export function setToken(token: string | null) {
  if (token) localStorage.setItem(TOKEN_KEY, token)
  else localStorage.removeItem(TOKEN_KEY)
}

export class ApiError extends Error {
  status: number
  code: string

  constructor(status: number, code: string, message: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
  }
}

export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers)
  const token = getToken()
  if (init.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json')
  if (token) headers.set('Authorization', `Bearer ${token}`)

  const res = await fetch(path, { ...init, headers }).catch(() => {
    throw new ApiError(0, 'NETWORK_ERROR', '网络错误，请检查连接后重试')
  })

  let data: unknown = null
  let parseFailed = false
  const text = await res.text()
  if (text) {
    try {
      data = JSON.parse(text)
    } catch {
      parseFailed = true
    }
  }

  if (!res.ok) {
    const shaped = typeof data === 'object' && data !== null ? data : null
    const code =
      shaped !== null && 'error' in shaped && typeof shaped.error === 'string'
        ? shaped.error
        : 'UNKNOWN'
    const message =
      shaped !== null && 'message' in shaped && typeof shaped.message === 'string'
        ? shaped.message
        : parseFailed
          ? '请求失败，且响应不是有效的 JSON'
          : '请求失败，请稍后重试'
    throw new ApiError(res.status, code, message)
  }

  if (parseFailed) {
    throw new ApiError(res.status, 'INVALID_RESPONSE', '服务器返回了无法解析的数据')
  }

  return (data ?? null) as T
}

export async function listTas(): Promise<Ta[]> {
  const res = await apiFetch<{ tas: Ta[] }>('/api/staff/tas')
  return res.tas
}

export async function addTa(studentId: string): Promise<Ta> {
  const res = await apiFetch<{ ta: Ta }>('/api/staff/tas', {
    method: 'POST',
    body: JSON.stringify({ studentId }),
  })
  return res.ta
}

/** 为当前班级添加助教，返回一次性初始密码 */
export async function addClassTa(studentId: string): Promise<{ ta: Ta; password: string }> {
  return apiFetch<{ ta: Ta; password: string }>('/api/staff/tas/class', {
    method: 'POST',
    body: JSON.stringify({ studentId }),
  })
}

export async function listClasses(): Promise<ClassInfo[]> {
  const res = await apiFetch<{ classes: ClassInfo[] }>('/api/classes')
  return res.classes
}

export function listQuestions(params?: {
  q?: string
  limit?: number
  offset?: number
}): Promise<{ questions: Question[]; total: number }> {
  const search = new URLSearchParams()
  if (params?.q) search.set('q', params.q)
  if (params?.limit != null) search.set('limit', String(params.limit))
  if (params?.offset != null) search.set('offset', String(params.offset))
  const qs = search.toString()
  return apiFetch<{ questions: Question[]; total: number }>(
    `/api/questions${qs ? `?${qs}` : ''}`,
  )
}

export function fetchBankQuestions(bankId: string): Promise<{ questions: Question[] }> {
  return apiFetch<{ questions: Question[] }>(`/api/banks/${bankId}/questions`)
}

export function createQuestion(body: {
  question: string
  answer: string
}): Promise<{ question: Question }> {
  return apiFetch<{ question: Question }>('/api/questions', {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

export function updateQuestion(
  id: string,
  body: { question?: string; answer?: string },
): Promise<{ question: Question }> {
  return apiFetch<{ question: Question }>(`/api/questions/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  })
}

export function duplicateQuestion(id: string): Promise<{ question: Question }> {
  return apiFetch<{ question: Question }>(`/api/questions/${id}/duplicate`, { method: 'POST' })
}

export function deleteQuestion(id: string): Promise<{ ok: true }> {
  return apiFetch<{ ok: true }>(`/api/questions/${id}`, { method: 'DELETE' })
}

export function listBanks(): Promise<{ banks: QuestionBank[] }> {
  return apiFetch<{ banks: QuestionBank[] }>('/api/banks')
}

export function createBank(name: string): Promise<{ bank: QuestionBank }> {
  return apiFetch<{ bank: QuestionBank }>('/api/banks', {
    method: 'POST',
    body: JSON.stringify({ name }),
  })
}

export function renameBank(id: string, name: string): Promise<{ bank: QuestionBank }> {
  return apiFetch<{ bank: QuestionBank }>(`/api/banks/${id}`, {
    method: 'PATCH',
    body: JSON.stringify({ name }),
  })
}

export function duplicateBank(id: string): Promise<{ bank: QuestionBank }> {
  return apiFetch<{ bank: QuestionBank }>(`/api/banks/${id}/duplicate`, { method: 'POST' })
}

export function deleteBank(id: string): Promise<{ ok: true }> {
  return apiFetch<{ ok: true }>(`/api/banks/${id}`, { method: 'DELETE' })
}

export function setBankQuestions(
  id: string,
  questionIds: string[],
): Promise<{ bank: QuestionBank }> {
  return apiFetch<{ bank: QuestionBank }>(`/api/banks/${id}/questions`, {
    method: 'PUT',
    body: JSON.stringify({ questionIds }),
  })
}

export function addBankQuestions(
  id: string,
  questionIds: string[],
): Promise<{ bank: QuestionBank }> {
  return apiFetch<{ bank: QuestionBank }>(`/api/banks/${id}/questions`, {
    method: 'POST',
    body: JSON.stringify({ questionIds }),
  })
}

export function removeBankQuestions(
  id: string,
  questionIds: string[],
): Promise<{ bank: QuestionBank }> {
  return apiFetch<{ bank: QuestionBank }>(`/api/banks/${id}/questions`, {
    method: 'DELETE',
    body: JSON.stringify({ questionIds }),
  })
}

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

/** 学生查看页数据（公开接口，凭签名 token 访问） */
export type StudentPreviewData = {
  experiment: {
    id: string
    mark: string
    title: string
    className: string | null
    questionBankName: string | null
    publishTime: string | null
    checkoffDeadline: string | null
    reportDeadline: string | null
  }
  student: { userId: string; name: string; studentId: string }
  /** 生效评分占比：功能测试 / 验收问答 / 报告 */
  ratio: number[]
  total: number | null
  scores: Array<{
    /** 0=功能测试 1=验收问答 2=报告 */
    type: number
    score: number
    graderName: string | null
    updatedAt: string
  }>
  /** 报告批阅记录：ruleContent 为精简批阅格式，items 为评分标准条目 */
  report: {
    ruleId: string
    ruleContent: unknown
    items: unknown
  } | null
  /** 助教填写的附言（0=验收，1=实验报告），仅含非空项 */
  remarks: Array<{ type: number; text: string }>
}

export function fetchStudentPreview(token: string): Promise<StudentPreviewData> {
  return apiFetch<StudentPreviewData>(
    `/api/student-preview/view?token=${encodeURIComponent(token)}`,
  )
}

export type StudentOverviewExperiment = {
  id: string
  mark: string
  title: string
  publishTime: string | null
  checkoffDeadline: string | null
  reportDeadline: string | null
  ratio: number[]
  total: number | null
  scores: Array<{ type: number; score: number }>
  hasReport: boolean
  remarkCount: number
}

export type StudentOverview = {
  class: { id: string; name: string; type: string } | null
  student: { name: string; studentId: string }
  experiments: StudentOverviewExperiment[]
}

export function fetchStudentOverview(): Promise<StudentOverview> {
  return apiFetch<StudentOverview>('/api/student/overview')
}

export function fetchStudentExperiment(id: string): Promise<StudentPreviewData> {
  return apiFetch<StudentPreviewData>(`/api/student/experiments/${encodeURIComponent(id)}`)
}

/** 学生端排队验收：当前开放验收的实验 + 我的排队状态 */
export type StudentQueueExperiment = {
  id: string
  mark: string
  title: string
  publishTime: string | null
  checkoffDeadline: string | null
  /** 该实验当前排队人数（含自己） */
  queueLength: number
  /** 是否已有验收成绩（功能测试 / 验收问答任一） */
  checkedOff: boolean
  myEntry: {
    id: string
    joinedAt: string
    /** 1-based 位次 */
    position: number
    /** 前面还有几人 */
    ahead: number
  } | null
}

export function fetchStudentCheckoffQueue(): Promise<{
  serverTime: string
  experiments: StudentQueueExperiment[]
}> {
  return apiFetch<{ serverTime: string; experiments: StudentQueueExperiment[] }>(
    '/api/student/checkoff-queue',
  )
}

/** 学生加入某实验的排队（幂等：已排队时保持原加入时间） */
export function joinStudentCheckoffQueue(experimentId: string): Promise<{ ok: true }> {
  return apiFetch<{ ok: true }>('/api/student/checkoff-queue', {
    method: 'POST',
    body: JSON.stringify({ experimentId }),
  })
}

/** 学生取消本人的排队 */
export function cancelStudentCheckoffQueue(experimentId: string): Promise<{ ok: true }> {
  return apiFetch<{ ok: true }>(
    `/api/student/checkoff-queue/${encodeURIComponent(experimentId)}`,
    { method: 'DELETE' },
  )
}

export function unlockStudent(body: {
  username: string
  password?: string
}): Promise<{ user: User }> {
  return apiFetch<{ user: User }>('/api/auth/student/unlock', {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

export type CreateClassInput = {
  bindToken: string
  name: string
  type: '2026-sys1' | '2026-sys2' | '2026-sys3'
}

export function createClass(body: CreateClassInput): Promise<{ class: ClassInfo }> {
  return apiFetch<{ class: ClassInfo }>('/api/classes', {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

export type CreateClassAccountInput = {
  bindToken: string
  classId: string
  name: string
  username: string
  password?: string
  syncLogin?: boolean
  syncPreferences?: boolean
}

export type CreateClassAccountResult = {
  token: string
  user: User
  class: ClassInfo
}

export function createClassAccount(
  body: CreateClassAccountInput,
): Promise<CreateClassAccountResult> {
  return apiFetch<CreateClassAccountResult>('/api/classes/new-account', {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

export async function previewRoster(classId: string): Promise<RosterDiff> {
  const local = getZjuamCredential()
  const body = local ? { account: local.account, password: local.password } : {}
  return apiFetch<RosterDiff>(`/api/classes/${classId}/roster/preview`, {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

export async function applyRoster(
  classId: string,
  diff: { added: RosterEntry[]; removed: string[]; expectedSyncAt?: string },
): Promise<{ addedCount: number; removedCount: number; lastRosterSyncAt: string }> {
  return apiFetch<{ addedCount: number; removedCount: number; lastRosterSyncAt: string }>(
    `/api/classes/${classId}/roster/apply`,
    {
      method: 'POST',
      body: JSON.stringify(diff),
    },
  )
}

export type ClassSettings = {
  checkpointEnabled?: boolean
  checkpointRule?: string | null
  focusEnabled?: boolean
  /** 全课程是否共用统一评分占比 */
  scoreRatioUnified?: boolean
  /** 课程级评分占比：功能测试 / 验收问答 / 报告 */
  scoreRatio?: number[]
  /** 各实验独立的评分占比，键为实验 id */
  experimentScoreRatios?: Record<string, number[]>
  /** 验收评语模板 */
  checkoutCommentTemplate?: string
  /** 报告评语模板 */
  reportCommentTemplate?: string
}

export function fetchClassSettings(classId: string): Promise<{ settings: ClassSettings }> {
  return apiFetch<{ settings: ClassSettings }>(`/api/classes/${classId}/settings`)
}

export function updateClassSettings(
  classId: string,
  body: {
    checkpointEnabled?: boolean
    checkpointRule?: string | null
    focusEnabled?: boolean
    scoreRatioUnified?: boolean
    scoreRatio?: number[]
    experimentScoreRatios?: Record<string, number[]>
    checkoutCommentTemplate?: string
    reportCommentTemplate?: string
  },
): Promise<{ settings: ClassSettings }> {
  return apiFetch<{ settings: ClassSettings }>(`/api/classes/${classId}/settings`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  })
}

export type FocusStudent = {
  id: string
  classId: string
  userId: string
  reason: string
  createdAt: string
  updatedAt: string
  student: { name: string; studentId: string }
}

export function listFocusStudents(classId: string): Promise<{ focusStudents: FocusStudent[] }> {
  return apiFetch<{ focusStudents: FocusStudent[] }>(`/api/classes/${classId}/focus-students`)
}

export function addFocusStudent(
  classId: string,
  body: { userId: string; reason?: string },
): Promise<{ focusStudent: FocusStudent }> {
  return apiFetch<{ focusStudent: FocusStudent }>(`/api/classes/${classId}/focus-students`, {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

export function updateFocusStudent(
  classId: string,
  id: string,
  reason: string,
): Promise<{ focusStudent: FocusStudent }> {
  return apiFetch<{ focusStudent: FocusStudent }>(
    `/api/classes/${classId}/focus-students/${id}`,
    {
      method: 'PATCH',
      body: JSON.stringify({ reason }),
    },
  )
}

export function deleteFocusStudents(
  classId: string,
  ids: string[],
): Promise<{ ok: true; deletedCount: number }> {
  return apiFetch<{ ok: true; deletedCount: number }>(`/api/classes/${classId}/focus-students`, {
    method: 'DELETE',
    body: JSON.stringify({ ids }),
  })
}

export type CheckpointClaim = {
  id: string
  classId: string
  userId: string
  appliedRules: number
  appliedRuleLabels: string[]
  createdAt: string
  updatedAt: string
  student: { name: string; studentId: string }
}

export function fetchCheckpointClaims(classId: string): Promise<{ claims: CheckpointClaim[] }> {
  return apiFetch<{ claims: CheckpointClaim[] }>(`/api/classes/${classId}/checkpoints`)
}

export function addCheckpointStudent(
  classId: string,
  body: { userId: string },
): Promise<{ claim: CheckpointClaim }> {
  return apiFetch<{ claim: CheckpointClaim }>(`/api/classes/${classId}/checkpoints`, {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

export function deleteCheckpointStudents(
  classId: string,
  ids: string[],
): Promise<{ ok: true; deletedCount: number }> {
  return apiFetch<{ ok: true; deletedCount: number }>(`/api/classes/${classId}/checkpoints`, {
    method: 'DELETE',
    body: JSON.stringify({ ids }),
  })
}

export function fetchCheckoff(params: {
  classId: string
  experimentId?: string
  includeQuestions?: boolean
}): Promise<{
  experiments: CheckoffExperiment[]
  students: CheckoffStudent[]
  scores: Score[]
  questions?: CheckoffQuestion[]
}> {
  const search = new URLSearchParams({ classId: params.classId })
  if (params.experimentId) search.set('experimentId', params.experimentId)
  if (params.includeQuestions) search.set('includeQuestions', 'true')
  return apiFetch<{
    experiments: CheckoffExperiment[]
    students: CheckoffStudent[]
    scores: Score[]
    questions?: CheckoffQuestion[]
  }>(`/api/checkoff?${search.toString()}`)
}

export function submitCheckoff(body: {
  experimentId: string
  userId: string
  scores: { type: number; score: number | null }[]
  /** 答题用时（毫秒）：从选中学生开始计时；旧客户端可不传 */
  durationMs?: number
  /** 开始答题时间（ISO）；不传时服务端按 durationMs 倒推 */
  startedAt?: string
}): Promise<{ ok: true }> {
  return apiFetch<{ ok: true }>('/api/checkoff', {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

export type CheckoffRecord = {
  userId: string
  studentName: string
  studentId: string
  type: number
  score: number
  experimentMark: string
  experimentTitle: string
  graderName: string | null
  updatedAt: string
  /** 该次验收的答题用时（毫秒）；无记录时为 null */
  durationMs: number | null
}

/** 排队条目（助教端排队面板使用；队列按实验、全班共享） */
export type CheckoffQueueEntry = {
  id: string
  userId: string
  name: string
  studentId: string
  avatar: number | null
  experimentId: string
  experimentMark: string
  experimentTitle: string
  /** ISO 字符串 */
  joinedAt: string
}

/** 本班全部排队条目（按加入时间升序） */
export function fetchCheckoffQueue(
  classId: string,
): Promise<{ entries: CheckoffQueueEntry[] }> {
  return apiFetch<{ entries: CheckoffQueueEntry[] }>(
    `/api/checkoff/queue?classId=${encodeURIComponent(classId)}`,
  )
}

/** 最近验收提交的成绩（本班，最多 10 条） */
export function fetchCheckoffRecords(classId: string): Promise<{ records: CheckoffRecord[] }> {
  return apiFetch<{ records: CheckoffRecord[] }>(
    `/api/checkoff/records?classId=${encodeURIComponent(classId)}`,
  )
}

export type McpScope =
  | 'questions:read'
  | 'questions:write'
  | 'banks:read'
  | 'banks:write'
  | 'experiments:read'

export type PersonalAccessToken = {
  id: string
  name: string
  prefix: string
  scopes: McpScope[]
  expiresAt: string | null
  revokedAt: string | null
  lastUsedAt: string | null
  createdAt: string
}

export function listTokens(): Promise<{ tokens: PersonalAccessToken[] }> {
  return apiFetch<{ tokens: PersonalAccessToken[] }>('/api/tokens')
}

export function createToken(body: {
  name: string
  scopes: McpScope[]
  expiresInDays?: number
}): Promise<{ token: string; tokenRecord: PersonalAccessToken }> {
  return apiFetch<{ token: string; tokenRecord: PersonalAccessToken }>('/api/tokens', {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

export function revokeToken(id: string): Promise<{ ok: true }> {
  return apiFetch<{ ok: true }>(`/api/tokens/${id}`, { method: 'DELETE' })
}

export type McpAuditLog = {
  id: string
  tokenId: string | null
  tool: string
  ok: boolean
  message: string | null
  createdAt: string
}

export function listAuditLogs(limit = 50): Promise<{ logs: McpAuditLog[] }> {
  return apiFetch<{ logs: McpAuditLog[] }>(`/api/tokens/audit?limit=${limit}`)
}

export type ClassTables = { students: Student[]; experiments: Experiment[]; scores: Score[] }

export async function fetchClassTables(classId?: string): Promise<ClassTables> {
  const [studentRes, experimentRes, scoreRes] = await Promise.all([
    apiFetch<{ students: Student[] }>(classId ? `/api/students?classId=${encodeURIComponent(classId)}` : '/api/students'),
    apiFetch<{ experiments: Experiment[] }>('/api/experiments'),
    apiFetch<{ scores: Score[] }>(classId ? `/api/scores?classId=${encodeURIComponent(classId)}` : '/api/scores'),
  ])
  return { students: studentRes.students, experiments: experimentRes.experiments, scores: scoreRes.scores }
}

export function saveScore(body: {
  userId: string
  type: number
  indId: string
  score: number
}): Promise<{ score: Score }> {
  return apiFetch<{ score: Score }>('/api/scores', {
    method: 'PUT',
    body: JSON.stringify(body),
  })
}

export function listStudents(classId: string): Promise<{ students: Student[] }> {
  return apiFetch<{ students: Student[] }>(`/api/students?classId=${encodeURIComponent(classId)}`)
}

export type DevBoardStudent = { userId: string; name: string; studentId: string }

export type DevBoard = {
  id: string
  classId: string
  /** DB id（纯记录，班内唯一，卡片标题） */
  dbId: string
  /** id（纯记录，系统内无关联，卡片副标题） */
  boardId: string | null
  phone: string | null
  borrowed: boolean
  /** 当前登记的合用学生 id（已过滤失效学生） */
  userIds: string[]
  students: DevBoardStudent[]
  createdAt: string
  updatedAt: string
}

export type DevBoardInput = {
  dbId: string
  boardId?: string | null
  phone?: string | null
  userIds?: string[]
}

export function listDevBoards(classId: string): Promise<{ devBoards: DevBoard[] }> {
  return apiFetch<{ devBoards: DevBoard[] }>(
    `/api/devboards?classId=${encodeURIComponent(classId)}`,
  )
}

export function createDevBoard(
  classId: string,
  body: DevBoardInput,
): Promise<{ devBoard: DevBoard }> {
  return apiFetch<{ devBoard: DevBoard }>('/api/devboards', {
    method: 'POST',
    body: JSON.stringify({ classId, ...body }),
  })
}

export function updateDevBoard(
  id: string,
  body: Partial<DevBoardInput>,
): Promise<{ devBoard: DevBoard }> {
  return apiFetch<{ devBoard: DevBoard }>(`/api/devboards/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  })
}

export function deleteDevBoard(id: string): Promise<{ ok: true }> {
  return apiFetch<{ ok: true }>(`/api/devboards/${id}`, { method: 'DELETE' })
}

export function borrowDevBoard(
  id: string,
  body: { userIds: string[]; phone?: string | null },
): Promise<{ devBoard: DevBoard }> {
  return apiFetch<{ devBoard: DevBoard }>(`/api/devboards/${id}/borrow`, {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

export function returnDevBoard(id: string): Promise<{ devBoard: DevBoard }> {
  return apiFetch<{ devBoard: DevBoard }>(`/api/devboards/${id}/return`, { method: 'POST' })
}

export type DevBoardImportRow = {
  dbId: string
  boardId?: string | null
  phone?: string | null
  borrowed?: boolean
  studentIds?: string[]
}

export type DevBoardImportResult = {
  created: number
  failed: { row: number; dbId: string; reason: string }[]
}

export function importDevBoards(
  classId: string,
  rows: DevBoardImportRow[],
): Promise<DevBoardImportResult> {
  return apiFetch<DevBoardImportResult>('/api/devboards/import', {
    method: 'POST',
    body: JSON.stringify({ classId, rows }),
  })
}

export type CriteriaPayloadInput = { version: 1; items: CriterionItem[] }

export function saveCriteria(
  payload: CriteriaPayloadInput,
): Promise<{ key: string; createdAt: string }> {
  return apiFetch<{ key: string; createdAt: string }>('/api/criteria', {
    method: 'POST',
    body: JSON.stringify({ payload: { version: 1, items: serializeItems(payload.items) } }),
  })
}

export async function fetchCriteria(key: string): Promise<{
  payload: { items: CriterionItem[] } | null
  createdAt: string
  usageCount: number
}> {
  const res = await apiFetch<{ payload: unknown; createdAt: string; usageCount: number }>(
    `/api/criteria/${key}`,
  )
  const raw = res.payload as { items?: unknown } | null
  return {
    payload: raw ? { items: deserializeItems(raw.items) } : null,
    createdAt: res.createdAt,
    usageCount: res.usageCount,
  }
}

export type CriteriaSummary = {
  key: string
  createdAt: string
  updatedAt: string
  cardCount: number
  /** 引用该评分标准的批阅记录数 */
  usageCount: number
}

/** 当前用户创建的全部评分标准 */
export function fetchCriteriaList(): Promise<{ criteria: CriteriaSummary[] }> {
  return apiFetch<{ criteria: CriteriaSummary[] }>('/api/criteria')
}

/** 原地更新评分标准（保留同一分享码，引用它的批阅自动沿用） */
export function updateCriteria(
  key: string,
  payload: CriteriaPayloadInput,
): Promise<{ key: string; updatedAt: string }> {
  return apiFetch<{ key: string; updatedAt: string }>(`/api/criteria/${key}`, {
    method: 'PUT',
    body: JSON.stringify({ payload: { version: 1, items: serializeItems(payload.items) } }),
  })
}

/** 删除评分标准（仅未被任何批阅引用时可用） */
export function deleteCriteria(key: string): Promise<{ ok: boolean }> {
  return apiFetch<{ ok: boolean }>(`/api/criteria/${key}`, { method: 'DELETE' })
}

/** 影响预览：引用某评分标准的批阅（含身份与批阅内容） */
export type CriteriaImpactReview = {
  userId: string
  name: string
  studentId: string
  experimentId: string
  experimentMark: string
  experimentTitle: string
  /** 解析后的批阅内容 */
  content: unknown
}

/** 拉取影响预览数据（不落库）：旧 items + 全部引用该标准的批阅 */
export async function fetchCriteriaImpact(
  key: string,
  payload: CriteriaPayloadInput,
): Promise<{ oldItems: CriterionItem[]; reviews: CriteriaImpactReview[] }> {
  const res = await apiFetch<{ oldItems: unknown; reviews: CriteriaImpactReview[] }>(
    `/api/criteria/${key}/impact`,
    {
      method: 'POST',
      body: JSON.stringify({ payload: { version: 1, items: serializeItems(payload.items) } }),
    },
  )
  return { oldItems: deserializeItems(res.oldItems), reviews: res.reviews }
}

export type ReportReview = {
  userId: string
  experimentId: string
  ruleId: string
  ruleContent: unknown
  remarkById: string | null
  remarkByName: string | null
  updatedAt: string
}

export async function fetchReportReview(
  userId: string,
  experimentId: string,
): Promise<ReportReview | null> {
  const res = await apiFetch<{ review: ReportReview | null }>(
    `/api/report-reviews?userId=${encodeURIComponent(userId)}&experimentId=${encodeURIComponent(experimentId)}`,
  )
  return res.review
}

export function saveReportReview(body: {
  userId: string
  experimentId: string
  ruleId: string
  ruleContent: unknown
}): Promise<{ review: ReportReview }> {
  return apiFetch<{ review: ReportReview }>('/api/report-reviews', {
    method: 'PUT',
    body: JSON.stringify(body),
  })
}

/** 附言类型：0=验收，1=实验报告 */
export const REMARK_TYPE_CHECKOFF = 0
export const REMARK_TYPE_REPORT = 1

export type Remark = {
  userId: string
  experimentId: string
  type: number
  text: string
  updatedById: string | null
  updatedByName: string | null
  updatedAt: string
}

export async function fetchRemark(
  userId: string,
  experimentId: string,
  type: number,
): Promise<Remark | null> {
  const res = await apiFetch<{ remark: Remark | null }>(
    `/api/remarks?userId=${encodeURIComponent(userId)}&experimentId=${encodeURIComponent(experimentId)}&type=${type}`,
  )
  return res.remark
}

/** 某实验下所有学生的附言（含全部类型），供「查看评语」页批量展示 */
export async function fetchExperimentRemarks(experimentId: string): Promise<Remark[]> {
  const res = await apiFetch<{ remarks: Remark[] }>(
    `/api/remarks/experiment/${encodeURIComponent(experimentId)}`,
  )
  return res.remarks
}

export function saveRemark(body: {
  userId: string
  experimentId: string
  type: number
  text: string
}): Promise<{ remark: Remark }> {
  return apiFetch<{ remark: Remark }>('/api/remarks', {
    method: 'PUT',
    body: JSON.stringify(body),
  })
}
