import type {
  CriterionCard,
  CriterionExtras,
  CriterionItem,
  StoredCriterionCard,
  StoredCriterionItem,
} from './types'

/** 空串视为未设 → null；其余解析为数字（非法回退 null） */
function toNumberOrNull(value: string): number | null {
  const trimmed = value.trim()
  if (trimmed === '') return null
  const parsed = Number(trimmed)
  return Number.isFinite(parsed) ? parsed : null
}

/** 数字 / 数字字符串 → 编辑器用的字符串（未设 → 空串） */
function fromNumber(value: unknown): string {
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  if (typeof value === 'string' && value.trim() !== '') return value.trim()
  return ''
}

export function serializeCard(card: CriterionCard): StoredCriterionCard {
  return {
    id: card.id,
    type: 'card',
    mode: card.mode,
    rule: card.rule,
    detail: card.detail,
    score: toNumberOrNull(card.score) ?? 0,
    scoreMax: toNumberOrNull(card.scoreMax),
    defaultSelected: card.defaultSelected,
  }
}

export function deserializeCard(raw: unknown): CriterionCard {
  const node = (raw ?? {}) as Record<string, unknown>
  return {
    id: typeof node.id === 'string' ? node.id : crypto.randomUUID(),
    type: 'card',
    mode: node.mode === 'add' ? 'add' : 'subtract',
    rule: typeof node.rule === 'string' ? node.rule : '',
    detail: typeof node.detail === 'string' ? node.detail : '',
    score: fromNumber(node.score),
    scoreMax: fromNumber(node.scoreMax),
    defaultSelected: node.defaultSelected === true,
  }
}

/** 编辑器内存态 items → 持久化格式（分值为数字） */
export function serializeItems(items: CriterionItem[]): StoredCriterionItem[] {
  return items.map((item): StoredCriterionItem =>
    item.type === 'card'
      ? serializeCard(item)
      : {
          id: item.id,
          type: 'section',
          title: item.title,
          init: toNumberOrNull(item.init),
          cap: toNumberOrNull(item.cap),
          children: item.children.map(serializeCard),
        },
  )
}

/** 持久化格式 → 编辑器内存态 items */
export function deserializeItems(raw: unknown): CriterionItem[] {
  if (!Array.isArray(raw)) return []
  const items: CriterionItem[] = []
  for (const entry of raw) {
    if (!entry || typeof entry !== 'object') continue
    const node = entry as Record<string, unknown>
    if (node.type === 'section') {
      const children = Array.isArray(node.children) ? node.children : []
      items.push({
        id: typeof node.id === 'string' ? node.id : crypto.randomUUID(),
        type: 'section',
        title: typeof node.title === 'string' ? node.title : '',
        init: fromNumber(node.init),
        cap: fromNumber(node.cap),
        children: children.map(deserializeCard),
      })
    } else {
      items.push(deserializeCard(node))
    }
  }
  return items
}

export function serializeExtras(extras: CriterionExtras): Record<string, StoredCriterionCard[]> {
  const out: Record<string, StoredCriterionCard[]> = {}
  for (const [key, cards] of Object.entries(extras)) out[key] = cards.map(serializeCard)
  return out
}

export function deserializeExtras(raw: unknown): CriterionExtras {
  if (!raw || typeof raw !== 'object') return {}
  const out: CriterionExtras = {}
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (Array.isArray(value)) out[key] = value.map(deserializeCard)
  }
  return out
}
