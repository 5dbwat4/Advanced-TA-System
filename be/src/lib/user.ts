import type { Class, User } from '@prisma/client'

import { parseCredentials } from './webauthn'

/** 验收偏好 */
export type UserPreferences = { device: 'single' | 'multi'; draw: 'random' | 'fixed' }

/** 解析验收偏好 JSON，非法时返回 null（不抛错） */
export function parsePreferences(raw: string | null | undefined): UserPreferences | null {
  if (typeof raw !== 'string' || raw.length === 0) {
    return null
  }

  try {
    const value = JSON.parse(raw) as { device?: unknown; draw?: unknown }
    const device = value?.device
    const draw = value?.draw
    if ((device === 'single' || device === 'multi') && (draw === 'random' || draw === 'fixed')) {
      return { device, draw }
    }
    return null
  } catch {
    return null
  }
}

/** 对外暴露的安全用户信息（不含密码 / 凭据） */
export function publicUser(user: User & { classes?: Class[] }) {
  const credentials = parseCredentials(user)
  return {
    id: user.id,
    name: user.name,
    role: user.role,
    studentId: user.studentId,
    username: user.username,
    classes: (user.classes ?? []).map((c) => ({
      id: c.id,
      name: c.name,
      type: c.type,
      xzzdClassId: c.xzzdClassId,
      lastRosterSyncAt: c.lastRosterSyncAt,
    })),
    hasPassword: Boolean(user.password),
    preferences: parsePreferences(user.preferences),
    zjuamAccount: user.zjuamAccount,
    hasZjuamPassword: Boolean(user.zjuamPassword),
    hasWebauthn: credentials.length > 0,
    passkeys: credentials.map((credential) => ({
      id: credential.id,
      createdAt: credential.createdAt ?? null,
      deviceType: credential.deviceType,
    })),
  }
}

export type PublicUser = ReturnType<typeof publicUser>
