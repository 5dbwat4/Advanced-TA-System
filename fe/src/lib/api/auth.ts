import { apiFetch } from '@/lib/api/client'
import type { Role, User } from '@/lib/api/types'

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

export function unlockStudent(body: {
  username: string
  name?: string
  studentId?: string
  password?: string
}): Promise<{ user: User }> {
  return apiFetch<{ user: User }>('/api/auth/student/unlock', {
    method: 'POST',
    body: JSON.stringify(body),
  })
}
