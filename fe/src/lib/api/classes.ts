import { apiFetch } from '@/lib/api/client'
import type {
  ClassInfo,
  RosterDiff,
  RosterEntry,
  User,
} from '@/lib/api/types'
import { getZjuamCredential } from '@/lib/zjuam'

export async function listClasses(): Promise<ClassInfo[]> {
  const res = await apiFetch<{ classes: ClassInfo[] }>('/api/classes')
  return res.classes
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

export function renameClass(classId: string, name: string): Promise<{ class: ClassInfo }> {
  return apiFetch<{ class: ClassInfo }>(`/api/classes/${classId}`, {
    method: 'PATCH',
    body: JSON.stringify({ name }),
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

/** 观察者可修改的课程设置（目前仅 nav 展示开关） */
export function updateViewerPreferences(body: {
  focusNavVisible: boolean
}): Promise<{ user: User }> {
  return apiFetch<{ user: User }>('/api/settings/viewer-preferences', {
    method: 'PUT',
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
