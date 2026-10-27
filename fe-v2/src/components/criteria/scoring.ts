import { deserializeExtras, serializeExtras } from './serialize'
import type {
  CriterionCard,
  CriterionCardState,
  CriterionExtras,
  CriterionItem,
  CriterionMode,
  CriterionSection,
  StoredCardEntry,
  StoredReviewContent,
} from './types'

export function defaultCardState(card: CriterionCard): CriterionCardState {
  return {
    selected: card.defaultSelected,
    score: card.scoreMax.trim() === '' ? '' : card.score,
    appendix: '',
  }
}

export function defaultStates(
  items: CriterionItem[],
  extras: CriterionExtras = {},
): Record<string, CriterionCardState> {
  const states: Record<string, CriterionCardState> = {}
  for (const item of items) {
    if (item.type === 'card') states[item.id] = defaultCardState(item)
    else for (const card of item.children) states[card.id] = defaultCardState(card)
  }
  for (const cards of Object.values(extras)) {
    for (const card of cards) states[card.id] = defaultCardState(card)
  }
  return states
}

/** 单张卡片的数值（非负，选中才计入；range 卡片取批阅时选定的分值并夹在范围内） */
export function cardScore(card: CriterionCard, state: CriterionCardState | undefined): number {
  if (!state?.selected) return 0
  const min = Number(card.score) || 0
  if (card.scoreMax.trim() === '') return Math.abs(min)
  const max = Number(card.scoreMax) || min
  const low = Math.min(min, max)
  const high = Math.max(min, max)
  const raw = state.score.trim() === '' ? min : Number(state.score)
  const value = Number.isFinite(raw) ? raw : min
  return Math.abs(Math.min(Math.max(value, low), high))
}

/** 单张卡片的带符号分值：加分 / 扣分 */
export function cardValue(card: CriterionCard, state: CriterionCardState | undefined): number {
  const value = cardScore(card, state)
  return card.mode === 'add' ? value : -value
}

/** 小节得分：初始分 + min(加分合计, 上限) − 扣分合计 */
export function sectionScore(
  section: CriterionSection,
  states: Record<string, CriterionCardState>,
  extras: CriterionExtras,
): number {
  const cards = [...section.children, ...(extras[section.id] ?? [])]
  let adds = 0
  let subs = 0
  for (const card of cards) {
    const value = cardValue(card, states[card.id])
    if (value >= 0) adds += value
    else subs += value
  }
  const init = Number(section.init)
  const cap = section.cap.trim() === '' ? null : Number(section.cap)
  const cappedAdds = cap != null && Number.isFinite(cap) ? Math.min(adds, cap) : adds
  return (Number.isFinite(init) ? init : 0) + cappedAdds + subs
}

/** 总分：各小节得分 + 顶层卡片分值 */
export function totalScore(
  items: CriterionItem[],
  states: Record<string, CriterionCardState>,
  extras: CriterionExtras,
): number {
  let total = 0
  for (const item of items) {
    total +=
      item.type === 'section' ? sectionScore(item, states, extras) : cardValue(item, states[item.id])
  }
  for (const card of extras.root ?? []) {
    total += cardValue(card, states[card.id])
  }
  return total
}

/** 批阅结果中的一张卡片（仅含已选中的） */
export type ReportCardEntry = {
  id: string
  mode: CriterionMode
  /** 简短规则（卡片标题位） */
  rule: string
  /** 详细标准 */
  detail: string
  /** 分值（正数） */
  score: number
  /** 附注 */
  appendix: string
}

/** 批阅结果分组：小节（含其下选中卡片）或顶层卡片 */
export type ReportGroup =
  | { kind: 'section'; id: string; title: string; score: number; cards: ReportCardEntry[] }
  | { kind: 'card'; card: ReportCardEntry }

/**
 * 汇总批阅中所有被助教选中的卡片，按原有顺序组织为「小节 + 选中卡片」的分组结构，
 * 便于展示页按评分标准的层级样式渲染。小节始终出现（即使其内没有任何选中卡片）；
 * 顶层卡片与临时卡片一并计入。
 */
export function collectReportGroups(
  items: CriterionItem[],
  states: Record<string, CriterionCardState>,
  extras: CriterionExtras,
): ReportGroup[] {
  const groups: ReportGroup[] = []

  const emit = (card: CriterionCard): ReportCardEntry | null => {
    const state = states[card.id]
    if (!state?.selected) return null
    return {
      id: card.id,
      mode: card.mode,
      rule: card.rule.trim(),
      detail: card.detail.trim(),
      score: cardScore(card, state),
      appendix: state.appendix.trim(),
    }
  }

  for (const item of items) {
    if (item.type === 'card') {
      const card = emit(item)
      if (card) groups.push({ kind: 'card', card })
      continue
    }

    const cards: ReportCardEntry[] = []
    for (const card of [...item.children, ...(extras[item.id] ?? [])]) {
      const entry = emit(card)
      if (entry) cards.push(entry)
    }
    groups.push({
      kind: 'section',
      id: item.id,
      title: item.title.trim(),
      score: sectionScore(item, states, extras),
      cards,
    })
  }

  for (const card of extras.root ?? []) {
    const entry = emit(card)
    if (entry) groups.push({ kind: 'card', card: entry })
  }

  return groups
}

/** 收集评分标准与临时卡片中的所有卡片定义 */
function collectCardDefs(
  items: CriterionItem[],
  extras: CriterionExtras,
): Map<string, CriterionCard> {
  const defs = new Map<string, CriterionCard>()
  for (const item of items) {
    if (item.type === 'card') defs.set(item.id, item)
    else for (const card of item.children) defs.set(card.id, card)
  }
  for (const cards of Object.values(extras)) for (const card of cards) defs.set(card.id, card)
  return defs
}

/**
 * 内存态 → 精简存储格式：
 * 仅保留已勾选的卡片（键存在即选中），score 为数字、始终写入，appendix 为空则省略。
 * 找不到定义（孤儿状态）的卡片会被丢弃。
 */
export function encodeReviewContent(
  states: Record<string, CriterionCardState>,
  extras: CriterionExtras,
  items: CriterionItem[],
): StoredReviewContent {
  const defs = collectCardDefs(items, extras)
  const cards: Record<string, StoredCardEntry> = {}

  for (const [id, state] of Object.entries(states)) {
    if (!state.selected) continue
    const card = defs.get(id)
    if (!card) continue
    const entry: StoredCardEntry = { score: cardScore(card, state) }
    if (state.appendix.trim() !== '') entry.appendix = state.appendix
    cards[id] = entry
  }

  return { cards, extras: serializeExtras(extras) }
}

/** 精简存储格式 → 内存态（键存在即视为已勾选） */
export function decodeReviewContent(content: unknown): {
  cards: Record<string, CriterionCardState>
  extras: CriterionExtras
} {
  const parsed = (content ?? {}) as Partial<StoredReviewContent>
  const cards: Record<string, CriterionCardState> = {}

  for (const [id, entry] of Object.entries(parsed.cards ?? {})) {
    if (!entry || typeof entry !== 'object') continue
    cards[id] = {
      selected: true,
      score: entry.score == null ? '' : String(entry.score),
      appendix: typeof entry.appendix === 'string' ? entry.appendix : '',
    }
  }

  return { cards, extras: deserializeExtras(parsed.extras) }
}
