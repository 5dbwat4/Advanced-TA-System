export type CriterionMode = 'add' | 'subtract'

export type CriterionCard = {
  id: string
  type: 'card'
  mode: CriterionMode
  /** 写在评语中的简短规则（卡片标题位） */
  rule: string
  /** 详细标准（正文） */
  detail: string
  /** 分值（范围时为下限） */
  score: string
  /** 范围上限，空串表示固定分值 */
  scoreMax: string
  defaultSelected: boolean
}

export type CriterionSection = {
  id: string
  type: 'section'
  title: string
  /** 小节初始分：小节内所有加减操作基于它进行 */
  init: string
  /** 分数上限：小节内加分累计到上限为止，空串表示不限 */
  cap: string
  children: CriterionCard[]
}

export type CriterionItem = CriterionCard | CriterionSection

/** 批阅时每张卡片的状态 */
export type CriterionCardState = {
  selected: boolean
  /** range 卡片批阅时选定的分值（固定分卡片不用） */
  score: string
  /** 附注（可选，会写入 rule content） */
  appendix: string
}

/** 批阅时临时添加的卡片，key 为 section id 或 'root' */
export type CriterionExtras = Record<string, CriterionCard[]>

export type ReportReviewContent = {
  version: 1
  cards: Record<string, CriterionCardState>
  extras: CriterionExtras
}

export function createCard(): CriterionCard {
  return {
    id: crypto.randomUUID(),
    type: 'card',
    mode: 'subtract',
    rule: '',
    detail: '',
    score: '',
    scoreMax: '',
    defaultSelected: false,
  }
}

export function createSection(): CriterionSection {
  return {
    id: crypto.randomUUID(),
    type: 'section',
    title: '',
    init: '',
    cap: '',
    children: [createCard()],
  }
}
