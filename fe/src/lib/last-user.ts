import type { User } from '@/lib/api'

const KEY = 'tasaas.lastUser'
const MAX_AGE = 90 * 24 * 60 * 60 * 1000

export type LastUser = {
  id: string
  name: string
  username: string | null
  studentId: string | null
  role: 'TA' | 'TEACHER'
  hasWebauthn: boolean
  hasPassword: boolean
  savedAt: number
}

/** 读取“上次登录用户”，不存在 / 非法 / 过期时返回 null */
export function getLastUser(): LastUser | null {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return null
    const value = JSON.parse(raw) as Partial<LastUser>
    if (!value || typeof value.id !== 'string' || typeof value.name !== 'string') return null
    const savedAt = typeof value.savedAt === 'number' ? value.savedAt : Date.now()
    if (Date.now() - savedAt > MAX_AGE) return null
    return {
      id: value.id,
      name: value.name,
      username: typeof value.username === 'string' ? value.username : null,
      studentId: typeof value.studentId === 'string' ? value.studentId : null,
      role: value.role === 'TEACHER' ? 'TEACHER' : 'TA',
      hasWebauthn: Boolean(value.hasWebauthn),
      hasPassword: Boolean(value.hasPassword),
      savedAt,
    }
  } catch {
    return null
  }
}

/** 记录最近一次成功登录的用户（仅存非敏感展示信息） */
export function saveLastUser(
  user: Pick<User, 'id' | 'name' | 'username' | 'studentId' | 'role' | 'hasWebauthn' | 'hasPassword'>,
): void {
  try {
    const value: LastUser = {
      id: user.id,
      name: user.name,
      username: user.username,
      studentId: user.studentId,
      role: user.role,
      hasWebauthn: user.hasWebauthn,
      hasPassword: user.hasPassword,
      savedAt: Date.now(),
    }
    localStorage.setItem(KEY, JSON.stringify(value))
  } catch {
    // ignore
  }
}

export function clearLastUser(): void {
  try {
    localStorage.removeItem(KEY)
  } catch {
    // ignore
  }
}

/** 与后端 `?identifier=` 对齐：优先用户名，其次学号 */
export function lastUserIdentifier(user: LastUser): string {
  return user.username ?? user.studentId ?? ''
}
