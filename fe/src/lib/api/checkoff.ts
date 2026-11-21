import { apiFetch } from '@/lib/api/client'
import type {
  CheckoffExperiment,
  CheckoffStudent,
  QuestionUser,
  Score,
} from '@/lib/api/types'

export type CheckoffSessionSettings = {
  acceptedExperimentIds: string[]
  priorityExperimentIds: string[]
  taIds: string[]
  allowStudentChooseTa: boolean
  taPreferences: Record<string, string[]>
  studentScope: 'all' | 'whitelist' | 'blacklist'
  studentIds: string[]
  allowSelfMoveDown: boolean
  jumpMode: 'after3' | 'anywhere' | 'none'
  startAt: string
}

export type CheckoffQueueEntry = {
  userId: string
  experimentId: string
  taId: string | null
  status: 'waiting' | 'notified' | 'called' | 'finished'
  joinedAt: string
  notifiedAt: string | null
  notifiedBy: string | null
  startedAt: string | null
  checkedBy: string | null
  finishedAt: string | null
}

export type CheckoffSessionStats = {
  entries: CheckoffQueueEntry[]
  closedAt: string | null
  [key: string]: unknown
}

export type CheckoffSession = {
  id: string
  classId: string
  settings: CheckoffSessionSettings
  stats: CheckoffSessionStats
  closedAt: string | null
  createdAt: string
}

export type StudentCheckoffQueueEntry = CheckoffQueueEntry

export type StudentCheckoffQueueTimelineEntry = {
  userId: string
  name: string
  studentId: string
  experimentId: string
  experimentMark: string
  experimentTitle: string
  status: 'waiting' | 'notified' | 'called' | 'finished'
  taName: string | null
  notifiedAt: string | null
  notifiedBy: string | null
  startedAt: string | null
  checkedBy: string | null
  finishedAt: string | null
  joinedAt: string
}

export type StudentCheckoffQueueView = {
  session: {
    id: string
    startAt: string
    started: boolean
    allowStudentChooseTa: boolean
    allowSelfMoveDown: boolean
    jumpMode: CheckoffSessionSettings['jumpMode']
    experiments: { id: string; mark: string; title: string }[]
    tas: {
      id: string
      name: string
      studentId: string | null
      avatar: number | null
      preferenceExperimentIds: string[]
    }[]
    entry: StudentCheckoffQueueEntry | null
    queue: StudentCheckoffQueueTimelineEntry[]
  } | null
  eligible: boolean
  reason: 'NO_CLASS' | 'NO_SESSION' | 'NOT_STARTED' | 'NOT_IN_SCOPE' | null
}

export type CheckoffQuestion = {
  id: string
  question: string
  answer: string
  user: QuestionUser
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

export function updateCheckoffSessionSettings(
  sessionId: string,
  settings: Omit<CheckoffSessionSettings, 'startAt'> & { startAt?: string },
): Promise<{ session: CheckoffSession }> {
  return apiFetch<{ session: CheckoffSession }>(
    `/api/checkoff/sessions/${encodeURIComponent(sessionId)}/settings`,
    {
      method: 'PATCH',
      body: JSON.stringify({ settings }),
    },
  )
}

export function fetchCheckoffSessions(
  classId: string,
): Promise<{ sessions: CheckoffSession[] }> {
  return apiFetch<{ sessions: CheckoffSession[] }>(
    `/api/checkoff/sessions?classId=${encodeURIComponent(classId)}`,
  )
}

export function closeCheckoffSession(
  sessionId: string,
): Promise<{ session: CheckoffSession }> {
  return apiFetch<{ session: CheckoffSession }>(
    `/api/checkoff/sessions/${encodeURIComponent(sessionId)}/close`,
    { method: 'POST' },
  )
}

export function createCheckoffSession(body: {
  classId: string
  settings: Omit<CheckoffSessionSettings, 'startAt'> & { startAt: string }
}): Promise<{ session: CheckoffSession }> {
  return apiFetch<{ session: CheckoffSession }>('/api/checkoff/sessions', {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

export type CheckoffQueueAction =
  | { action: 'move'; userIds: string[]; direction: 'up' | 'down' | 'top' }
  | { action: 'precall'; userIds: string[]; called: boolean }
  | { action: 'remove'; userIds: string[] }
  | { action: 'reorder'; userId: string; toIndex: number }
  | { action: 'requeue'; userId: string }
  | { action: 'finish'; userId: string }

export function updateCheckoffQueue(
  sessionId: string,
  action: CheckoffQueueAction,
): Promise<{ session: CheckoffSession }> {
  return apiFetch<{ session: CheckoffSession }>(
    `/api/checkoff/sessions/${encodeURIComponent(sessionId)}/queue`,
    {
      method: 'PATCH',
      body: JSON.stringify(action),
    },
  )
}

export function fetchStudentCheckoffQueue(): Promise<StudentCheckoffQueueView> {
  return apiFetch<StudentCheckoffQueueView>('/api/student/checkoff-queue')
}

export function joinStudentCheckoffQueue(body: {
  experimentId: string
  taId?: string | null
}): Promise<{ ok: true; entry: CheckoffQueueEntry }> {
  return apiFetch<{ ok: true; entry: CheckoffQueueEntry }>(
    '/api/student/checkoff-queue',
    {
      method: 'POST',
      body: JSON.stringify(body),
    },
  )
}

export function reorderStudentCheckoffQueue(toIndex: number): Promise<{ ok: true }> {
  return apiFetch<{ ok: true }>('/api/student/checkoff-queue', {
    method: 'PATCH',
    body: JSON.stringify({ action: 'reorder', toIndex }),
  })
}

export function updateStudentCheckoffQueue(body: {
  experimentId: string
  taId?: string | null
}): Promise<{ ok: true }> {
  return apiFetch<{ ok: true }>('/api/student/checkoff-queue', {
    method: 'PATCH',
    body: JSON.stringify({ action: 'update', ...body }),
  })
}

export function leaveStudentCheckoffQueue(): Promise<{ ok: true }> {
  return apiFetch<{ ok: true }>('/api/student/checkoff-queue', {
    method: 'DELETE',
  })
}

export function submitCheckoff(body: {
  experimentId: string
  userId: string
  scores: { type: number; score: number | null }[]
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
}

/** 最近验收提交的成绩（本班，最多 10 条） */
export function fetchCheckoffRecords(classId: string): Promise<{ records: CheckoffRecord[] }> {
  return apiFetch<{ records: CheckoffRecord[] }>(
    `/api/checkoff/records?classId=${encodeURIComponent(classId)}`,
  )
}
