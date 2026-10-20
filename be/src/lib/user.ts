import type { Class, User } from '@prisma/client'

import { parseCredentials } from './webauthn.js'

/** 倾向使用的 Markdown 编辑器 */
export type MarkdownEditorId = 'uiw' | 'mdx'

/** 倾向使用的 Markdown 渲染样式 */
export type MarkdownStyleId = 'github' | 'prose'

/** 自定义抽题数量的默认值与范围 */
export const DRAW_COUNT_DEFAULT = 3
export const DRAW_COUNT_MIN = 1
export const DRAW_COUNT_MAX = 10

/** 自定义 Card：固定 9 个 slot，数组顺序即展示顺序 */
export const CUSTOM_CARD_SLOT_COUNT = 9
export const CUSTOM_CARD_COUNT_MAX = 9
export const CUSTOM_CARD_TEXT_MAX = 1
export const CUSTOM_CARD_CONTENT_MAX = 20000

export type CustomCard = {
  id: string
  content: string
  text: string
  textColor: string
  backgroundColor: string
}

export type CustomCardSlot = {
  id: string
  cardId: string | null
}

export type CustomCards = {
  slots: CustomCardSlot[]
  cards: CustomCard[]
}

const CUSTOM_CARD_COLORS: Array<[background: string, text: string]> = [
  ['#dbeafe', '#1e3a8a'],
  ['#dcfce7', '#166534'],
  ['#fef3c7', '#92400e'],
  ['#fce7f3', '#9d174d'],
  ['#ede9fe', '#5b21b6'],
  ['#cffafe', '#155e75'],
  ['#ffedd5', '#9a3412'],
  ['#f3e8ff', '#6b21a8'],
  ['#f1f5f9', '#334155'],
]

function readSingleText(value: unknown): string {
  return typeof value === 'string' ? [...value].slice(0, CUSTOM_CARD_TEXT_MAX).join('') : ''
}

export function createDefaultCustomCards(): CustomCards {
  return {
    slots: Array.from({ length: CUSTOM_CARD_SLOT_COUNT }, (_, index) => ({
      id: `slot-${index + 1}`,
      cardId: null,
    })),
    cards: [],
  }
}

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/

function readColor(value: unknown, fallback: string): string {
  return typeof value === 'string' && HEX_COLOR.test(value) ? value : fallback
}

export function parseCustomCards(value: unknown): CustomCards {
  const record = value && typeof value === 'object' ? (value as Record<string, unknown>) : {}
  const rawSlots = Array.isArray(record.slots) ? record.slots : []
  const rawCards = Array.isArray(record.cards) ? record.cards : []
  const usedSlotIds = new Set<string>()
  const usedCardIds = new Set<string>()
  const cardIds = new Set<string>()

  const cards: CustomCard[] = []
  for (const raw of rawCards.slice(0, CUSTOM_CARD_COUNT_MAX)) {
    if (!raw || typeof raw !== 'object') continue
    const item = raw as Record<string, unknown>
    let id =
      typeof item.id === 'string' && item.id.trim().length > 0
        ? item.id.slice(0, 64)
        : `card-${cards.length + 1}`
    if (cardIds.has(id)) {
      let suffix = cards.length + 1
      while (cardIds.has(`card-${suffix}`)) suffix += 1
      id = `card-${suffix}`
    }
    cardIds.add(id)
    const [defaultBackground, defaultText] =
      CUSTOM_CARD_COLORS[cards.length] ?? CUSTOM_CARD_COLORS[0]
    cards.push({
      id,
      content:
        typeof item.content === 'string'
          ? item.content.slice(0, CUSTOM_CARD_CONTENT_MAX)
          : '',
      text: readSingleText(item.text),
      textColor: readColor(item.textColor, defaultText),
      backgroundColor: readColor(item.backgroundColor, defaultBackground),
    })
  }

  const slots = Array.from({ length: CUSTOM_CARD_SLOT_COUNT }, (_, index) => {
    const raw = rawSlots[index]
    const item = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}
    let id =
      typeof item.id === 'string' && item.id.trim().length > 0
        ? item.id.slice(0, 64)
        : `slot-${index + 1}`
    if (usedSlotIds.has(id)) {
      let suffix = index + 1
      while (usedSlotIds.has(`slot-${suffix}`)) suffix += 1
      id = `slot-${suffix}`
    }
    usedSlotIds.add(id)
    const cardId =
      typeof item.cardId === 'string' && cardIds.has(item.cardId) && !usedCardIds.has(item.cardId)
        ? item.cardId
        : null
    if (cardId) usedCardIds.add(cardId)
    return { id, cardId }
  })

  return { slots, cards }
}

/** 验收偏好 */
export type UserPreferences = {
  device: 'single' | 'multi'
  draw: 'random' | 'fixed'
  markdownEditor: MarkdownEditorId
  markdownStyle: MarkdownStyleId
  drawCount: number
  customCards: CustomCards
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
      customCards?: unknown
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
      return {
        device,
        draw,
        markdownEditor,
        markdownStyle,
        drawCount,
        customCards: parseCustomCards(value.customCards),
      }
    }
    return null
  } catch {
    return null
  }
}

/** 对外暴露的安全用户信息（不含密码 / 凭据） */
export function publicUser(user: User & { klass?: Class | null }) {
  const credentials = parseCredentials(user)
  const classes = user.klass
    ? [
        {
          id: user.klass.id,
          name: user.klass.name,
          type: user.klass.type,
          xzzdClassId: user.klass.xzzdClassId,
          lastRosterSyncAt: user.klass.lastRosterSyncAt,
        },
      ]
    : []
  return {
    id: user.id,
    name: user.name,
    role: user.role,
    avatar: user.avatar,
    studentId: user.studentId,
    username: user.username,
    classId: user.classId,
    classes,
    status: user.status,
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
