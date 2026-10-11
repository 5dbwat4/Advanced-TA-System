import { cardValue, decodeReviewContent } from './scoring'
import type {
  CriterionCard,
  CriterionCardState,
  CriterionExtras,
  CriterionItem,
  CriterionSection,
} from './types'

export type CriteriaImpactChangeKind =
  | 'removed'
  | 'added'
  | 'range-out'
  | 'score-changed'
  | 'rule-changed'
  | 'section'

/** 单个学生视角下的一处影响 */
export type CriteriaImpactChange = {
  kind: CriteriaImpactChangeKind
  cardId: string
  /** 卡片规则文本（removed 用旧文本，其余用新文本）；小节变更时为小节标题 */
  rule: string
  /** 人类可读的影响说明 */
  message: string
  /** 变更前的卡片定义（removed / changed 时存在） */
  beforeCard?: CriterionCard
  /** 变更后的卡片定义（added / changed 时存在） */
  afterCard?: CriterionCard
}

export type CriteriaImpactItem = {
  stuId: string
  name: string
  studentNo: string
  experimentId: string
  experimentMark: string
  experimentTitle: string
  /** 该生批阅时的卡片状态（用于渲染完整评分） */
  states: Record<string, CriterionCardState>
  /** 该生批阅时临时添加的卡片 */
  extras: CriterionExtras
  changes: CriteriaImpactChange[]
}

export type CriteriaImpactResult = {
  /** 引用该标准的批阅总数 */
  total: number
  /** 会受影响的批阅 */
  items: CriteriaImpactItem[]
}

/** 影响计算所需的批阅输入（结构兼容 api.CriteriaImpactReview） */
export type ImpactReviewInput = {
  stuId: string
  name: string
  studentNo: string
  experimentId: string
  experimentMark: string
  experimentTitle: string
  content: unknown
}

type FlatCard = { card: CriterionCard; sectionTitle: string | null }

function flattenCards(items: CriterionItem[]): Map<string, FlatCard> {
  const map = new Map<string, FlatCard>()
  for (const item of items) {
    if (item.type === 'card') {
      map.set(item.id, { card: item, sectionTitle: null })
    } else {
      const sectionTitle = item.title.trim() || null
      for (const card of item.children) map.set(card.id, { card, sectionTitle })
    }
  }
  return map
}

function flattenSections(items: CriterionItem[]): Map<string, CriterionSection> {
  const map = new Map<string, CriterionSection>()
  for (const item of items) if (item.type === 'section') map.set(item.id, item)
  return map
}

/** 该生已选的 range 分值是否落在新卡片范围之外 */
function isRangeOut(card: CriterionCard, state: CriterionCardState | undefined): boolean {
  if (!state?.selected) return false
  if (card.scoreMax.trim() === '' || state.score.trim() === '') return false
  const value = Number(state.score)
  if (!Number.isFinite(value)) return false
  const min = Number(card.score) || 0
  const max = Number(card.scoreMax) || min
  return value < Math.min(min, max) || value > Math.max(min, max)
}

function computeChanges(
  oldCards: Map<string, FlatCard>,
  newCards: Map<string, FlatCard>,
  oldSections: Map<string, CriterionSection>,
  newSections: Map<string, CriterionSection>,
  states: Record<string, CriterionCardState>,
): CriteriaImpactChange[] {
  const changes: CriteriaImpactChange[] = []

  // 小节初始分/上限变化
  for (const [id, section] of newSections) {
    const old = oldSections.get(id)
    if (!old) continue
    if (old.init === section.init && old.cap === section.cap) continue
    changes.push({
      kind: 'section',
      cardId: id,
      rule: section.title.trim() || '未命名小节',
      message: '小节初始分/上限发生变化',
    })
  }

  // 新增卡片：该生无对应状态，默认勾选不会生效
  for (const [id, entry] of newCards) {
    if (oldCards.has(id) || !entry.card.defaultSelected) continue
    changes.push({
      kind: 'added',
      cardId: id,
      rule: entry.card.rule.trim(),
      message: '新增卡片：默认选中不会生效，该生不会被自动勾选',
      afterCard: entry.card,
    })
  }

  // 被删除的卡片
  for (const [id, entry] of oldCards) {
    if (newCards.has(id)) continue
    const selected = states[id]?.selected ?? false
    changes.push({
      kind: 'removed',
      cardId: id,
      rule: entry.card.rule.trim(),
      message: selected ? '被删除：原有的加减分不再计入' : '被删除',
      beforeCard: entry.card,
    })
  }

  // 文本/分值/范围发生变化的卡片（仅该生已勾选时才有实质影响）
  for (const [id, entry] of newCards) {
    const old = oldCards.get(id)
    if (!old) continue
    const state = states[id]
    if (!state?.selected) continue

    const before = cardValue(old.card, state)
    const after = cardValue(entry.card, state)
    const textChanged =
      old.card.rule !== entry.card.rule || old.card.detail !== entry.card.detail

    if (before !== after) {
      const rangeOut = isRangeOut(entry.card, state)
      changes.push({
        kind: rangeOut ? 'range-out' : 'score-changed',
        cardId: id,
        rule: entry.card.rule.trim(),
        message: rangeOut ? '评分落在了新评分范围外侧，将被夹到范围内' : '评分发生变化',
        beforeCard: old.card,
        afterCard: entry.card,
      })
    } else if (textChanged) {
      changes.push({
        kind: 'rule-changed',
        cardId: id,
        rule: entry.card.rule.trim(),
        message: '规则文本已更新',
        beforeCard: old.card,
        afterCard: entry.card,
      })
    }
  }

  return changes
}

/**
 * 比较「当前编辑内容」与旧标准对每份批阅的影响：
 * 逐卡片列出该生视角下的变化（默认选中失效、范围外、被删除、文本/分值变化、小节变化）。
 */
export function computeCriteriaImpact(
  oldItems: CriterionItem[],
  newItems: CriterionItem[],
  reviews: ImpactReviewInput[],
): CriteriaImpactResult {
  const oldCards = flattenCards(oldItems)
  const newCards = flattenCards(newItems)
  const oldSections = flattenSections(oldItems)
  const newSections = flattenSections(newItems)
  const items: CriteriaImpactItem[] = []

  for (const review of reviews) {
    const { cards: states, extras } = decodeReviewContent(review.content)
    const changes = computeChanges(oldCards, newCards, oldSections, newSections, states)
    if (changes.length === 0) continue

    items.push({
      stuId: review.stuId,
      name: review.name,
      studentNo: review.studentNo,
      experimentId: review.experimentId,
      experimentMark: review.experimentMark,
      experimentTitle: review.experimentTitle,
      states,
      extras,
      changes,
    })
  }

  return { total: reviews.length, items }
}
