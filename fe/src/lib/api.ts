import { getZjuamCredential } from '@/lib/zjuam'

const TOKEN_KEY = 'tasaas.token'

export type Role = 'TA' | 'TEACHER'

export type MarkdownEditorId = 'uiw' | 'mdx'

export type MarkdownStyleId = 'github' | 'prose'

export type UserPreferences = {
  device: 'single' | 'multi'
  draw: 'random' | 'fixed'
  markdownEditor: MarkdownEditorId
  markdownStyle: MarkdownStyleId
  drawCount: number
}

export type ClassInfo = {
  id: string
  name: string
  type: '2026-sys1' | '2026-sys2' | '2026-sys3'
  xzzdClassId?: string | null
  lastRosterSyncAt?: string | null
}

export type RosterEntry = { studentNo: string; name: string }

export type RosterDiff = {
  added: RosterEntry[]
  removed: RosterEntry[]
  unchangedCount: number
}

export type Student = {
  stuId: string
  name: string
  studentNo: string
  classId: string
  klass: ClassInfo
}

export type Ta = {
  id: string
  name: string
  studentId: string
  username: string | null
  classes: ClassInfo[]
  activated: boolean
  hasPassword: boolean
  zjuamAccount: string | null
  createdAt: string
}

export type Score = {
  stuId: string
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
  studentId: string | null
  username: string | null
  classes: ClassInfo[]
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
  stuId: string
  name: string
  studentNo: string
}

export type CheckoffQuestion = {
  id: string
  question: string
  answer: string
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
  studentNo: string
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
  student: { name: string; studentNo: string }
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
}

export function fetchStudentPreview(token: string): Promise<StudentPreviewData> {
  return apiFetch<StudentPreviewData>(
    `/api/student-preview/view?token=${encodeURIComponent(token)}`,
  )
}

export async function createClass(body: {
  xzzdClassId: string
  name: string
  type: '2026-sys1' | '2026-sys2' | '2026-sys3'
}): Promise<{ class: ClassInfo; user: User }> {
  return apiFetch<{ class: ClassInfo; user: User }>('/api/classes', {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

export async function joinClass(id: string): Promise<User> {
  const res = await apiFetch<{ user: User }>(`/api/classes/${id}/join`, { method: 'POST' })
  return res.user
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
  stuId: string
  reason: string
  createdAt: string
  updatedAt: string
  student: { name: string; studentNo: string }
}

export function listFocusStudents(classId: string): Promise<{ focusStudents: FocusStudent[] }> {
  return apiFetch<{ focusStudents: FocusStudent[] }>(`/api/classes/${classId}/focus-students`)
}

export function addFocusStudent(
  classId: string,
  body: { stuId: string; reason?: string },
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
  stuId: string
  appliedRules: number
  createdAt: string
  updatedAt: string
  student: { name: string; studentNo: string }
}

export function fetchCheckpointClaims(classId: string): Promise<{ claims: CheckpointClaim[] }> {
  return apiFetch<{ claims: CheckpointClaim[] }>(`/api/classes/${classId}/checkpoints`)
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
  stuId: string
  scores: { type: number; score: number | null }[]
}): Promise<{ ok: true }> {
  return apiFetch<{ ok: true }>('/api/checkoff', {
    method: 'POST',
    body: JSON.stringify(body),
  })
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

export function listStudents(classId: string): Promise<{ students: Student[] }> {
  return apiFetch<{ students: Student[] }>(`/api/students?classId=${encodeURIComponent(classId)}`)
}

export type DevBoardStudent = { stuId: string; name: string; studentNo: string }

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
  stuIds: string[]
  students: DevBoardStudent[]
  createdAt: string
  updatedAt: string
}

export type DevBoardInput = {
  dbId: string
  boardId?: string | null
  phone?: string | null
  stuIds?: string[]
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
  body: { stuIds: string[]; phone?: string | null },
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
  studentNos?: string[]
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
