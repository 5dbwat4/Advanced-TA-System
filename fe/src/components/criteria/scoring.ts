import type {
  CriterionCard,
  CriterionCardState,
  CriterionExtras,
  CriterionItem,
  CriterionSection,
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
