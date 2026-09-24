import { getZjuamCredential } from '@/lib/zjuam'

const TOKEN_KEY = 'tasaas.token'

export type Role = 'TA' | 'TEACHER'

export type MarkdownEditorId = 'uiw' | 'mdx'

export type UserPreferences = {
  device: 'single' | 'multi'
  draw: 'random' | 'fixed'
  markdownEditor: MarkdownEditorId
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
  klass: { id: string; name: string } | null
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

function parseJson(text: string): unknown {
  if (!text) return null
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}

export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers)
  const token = getToken()
  if (init.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json')
  if (token) headers.set('Authorization', `Bearer ${token}`)

  const res = await fetch(path, { ...init, headers })
  const data = parseJson(await res.text()) as Record<string, unknown> | null

  if (!res.ok) {
    const code = typeof data?.error === 'string' ? data.error : 'UNKNOWN'
    const message = typeof data?.message === 'string' ? data.message : '请求失败，请稍后重试'
    throw new ApiError(res.status, code, message)
  }

  return data as T
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
  body: { mark?: string; title?: string; questionBankId?: string | null },
): Promise<{ experiment: Experiment }> {
  return apiFetch<{ experiment: Experiment }>(`/api/experiments/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  })
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
  diff: { added: RosterEntry[]; removed: string[] },
): Promise<{ addedCount: number; removedCount: number; lastRosterSyncAt: string }> {
  return apiFetch<{ addedCount: number; removedCount: number; lastRosterSyncAt: string }>(
    `/api/classes/${classId}/roster/apply`,
    {
      method: 'POST',
      body: JSON.stringify(diff),
    },
  )
}

export function fetchCheckoff(params: {
  classId: string
  experimentId?: string
}): Promise<{ experiments: CheckoffExperiment[]; students: CheckoffStudent[]; scores: Score[] }> {
  const search = new URLSearchParams({ classId: params.classId })
  if (params.experimentId) search.set('experimentId', params.experimentId)
  return apiFetch<{
    experiments: CheckoffExperiment[]
    students: CheckoffStudent[]
    scores: Score[]
  }>(`/api/checkoff?${search.toString()}`)
}

export function fetchCheckoffQuestions(experimentId: string): Promise<{ questions: CheckoffQuestion[] }> {
  const search = new URLSearchParams({ experimentId })
  return apiFetch<{ questions: CheckoffQuestion[] }>(`/api/checkoff/questions?${search.toString()}`)
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
