import type { User } from '@/lib/api'

const KEY = 'tasaas.lastUsers'
const LEGACY_KEY = 'tasaas.lastUser'
const MAX_AGE = 90 * 24 * 60 * 60 * 1000
const MAX_USERS = 10

export type LastUser = {
  id: string
  name: string
  username: string | null
  studentId: string | null
  role: 'TA' | 'TEACHER' | 'STUDENT'
  hasWebauthn: boolean
  hasPassword: boolean
  savedAt: number
}

function normalizeRole(value: unknown): LastUser['role'] {
  return value === 'TEACHER' ? 'TEACHER' : value === 'STUDENT' ? 'STUDENT' : 'TA'
}

function toLastUser(value: unknown): LastUser | null {
  if (!value || typeof value !== 'object') return null
  const raw = value as Partial<LastUser>
  if (typeof raw.id !== 'string' || typeof raw.name !== 'string') return null
  const savedAt = typeof raw.savedAt === 'number' ? raw.savedAt : Date.now()
  if (Date.now() - savedAt > MAX_AGE) return null
  return {
    id: raw.id,
    name: raw.name,
    username: typeof raw.username === 'string' ? raw.username : null,
    studentId: typeof raw.studentId === 'string' ? raw.studentId : null,
    role: normalizeRole(raw.role),
    hasWebauthn: Boolean(raw.hasWebauthn),
    hasPassword: Boolean(raw.hasPassword),
    savedAt,
  }
}

/** 读取最近登录用户列表，自动兼容旧的单用户存储格式 */
export function getLastUsers(): LastUser[] {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as unknown
      const values = Array.isArray(parsed) ? parsed : [parsed]
      const seen = new Set<string>()
      const users: LastUser[] = []
      for (const value of values) {
        const user = toLastUser(value)
        if (!user || seen.has(user.id)) continue
        seen.add(user.id)
        users.push(user)
      }
      return users.slice(0, MAX_USERS)
    }

    const legacy = localStorage.getItem(LEGACY_KEY)
    if (!legacy) return []
    const user = toLastUser(JSON.parse(legacy) as unknown)
    if (!user) {
      localStorage.removeItem(LEGACY_KEY)
      return []
    }
    const users = [user]
    localStorage.setItem(KEY, JSON.stringify(users))
    localStorage.removeItem(LEGACY_KEY)
    return users
  } catch {
    return []
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
    const users = getLastUsers().filter((item) => item.id !== value.id)
    localStorage.setItem(KEY, JSON.stringify([value, ...users].slice(0, MAX_USERS)))
    localStorage.removeItem(LEGACY_KEY)
  } catch {
    // ignore
  }
}

/** 与后端 `?identifier=` 对齐：优先用户名，其次学号 */
export function lastUserIdentifier(user: LastUser): string {
  return user.username ?? user.studentId ?? ''
}
