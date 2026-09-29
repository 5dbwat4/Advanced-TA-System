import type { Class, User } from '@prisma/client'

import { parseCredentials } from './webauthn'

/** 倾向使用的 Markdown 编辑器 */
export type MarkdownEditorId = 'uiw' | 'mdx'

/** 倾向使用的 Markdown 渲染样式 */
export type MarkdownStyleId = 'github' | 'prose'

/** 自定义抽题数量的默认值与范围 */
export const DRAW_COUNT_DEFAULT = 3
export const DRAW_COUNT_MIN = 1
export const DRAW_COUNT_MAX = 10

/** 验收偏好 */
export type UserPreferences = {
  device: 'single' | 'multi'
  draw: 'random' | 'fixed'
  markdownEditor: MarkdownEditorId
  markdownStyle: MarkdownStyleId
  drawCount: number
}

/** 解析验收偏好 JSON，非法时返回 null（不抛错） */
export function parsePreferences(raw: string | null | undefined): UserPreferences | null {
  if (typeof raw !== 'string' || raw.length === 0) {
    return null
  }

  try {
    const value = JSON.parse(raw) as {
      device?: unknown
      draw?: unknown
      markdownEditor?: unknown
      markdownStyle?: unknown
      drawCount?: unknown
    }
    const device = value?.device
    const draw = value?.draw
    if ((device === 'single' || device === 'multi') && (draw === 'random' || draw === 'fixed')) {
      const markdownEditor: MarkdownEditorId = value?.markdownEditor === 'mdx' ? 'mdx' : 'uiw'
      const markdownStyle: MarkdownStyleId = value?.markdownStyle === 'prose' ? 'prose' : 'github'
      const rawCount = value?.drawCount
      const drawCount =
        typeof rawCount === 'number' &&
        Number.isInteger(rawCount) &&
        rawCount >= DRAW_COUNT_MIN &&
        rawCount <= DRAW_COUNT_MAX
          ? rawCount
          : DRAW_COUNT_DEFAULT
      return { device, draw, markdownEditor, markdownStyle, drawCount }
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
