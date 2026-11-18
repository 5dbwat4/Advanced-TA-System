import type { QuestionMark } from '@/components/checkoff/QuestionDrawer'
import type { CheckoffExperiment, CheckoffQuestion, CheckoffStudent, Score } from '@/lib/api'

export const CHECKOFF_MULTI_TABS_KEY = 'tasaas.checkoffMulti.tabs.v1'
export const CHECKOFF_MULTI_MAX_TABS = 8

const INSTANCE_PREFIX = 'tasaas.checkoffMulti.instance.'
const SESSION_PREFIX = 'tasaas.checkoffMulti.session.'

export type MultiTab = { id: string }

export type MultiTabsState = {
  tabs: MultiTab[]
  activeId: string
}

export type CheckoffInstanceSnapshot = {
  experiment: CheckoffExperiment | null
  student: CheckoffStudent | null
  step: number
  drawn: CheckoffQuestion[]
  marks: Record<string, QuestionMark | undefined>
  existingScores: Score[]
  questionIndex: number
  /** 答题计时起点（毫秒时间戳）；null 表示该 tab 当前没有在计时 */
  answerStartedAt: number | null
}

/**
 * 排队面板点击后下发给某个 tab 的「定位」指令：
 * 由 CheckoffMulti 生成、只下发给目标 tab，Instance 按 `seq` 幂等消费
 * （同一学生连续点两次也要能再次定位，所以不能只比较 experimentId/studentId）。
 */
export type CheckoffPendingPick = {
  tabId: string
  experimentId: string
  /** 学生学号：作为「定位学生」搜索框的预填词 */
  studentId: string
  /** 单调递增指令序号：消费方据此判断是不是一条新指令 */
  seq: number
}

/** 答题计时最长可信时长：超过后端 durationMs 上限（24h）说明快照已陈旧，恢复时丢弃 */
const MAX_ANSWER_DURATION_MS = 86_400_000

export function createTabId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`
}

export function instanceStorageKey(id: string): string {
  return `${INSTANCE_PREFIX}${id}`
}

export function sessionStorageKey(id: string): string {
  return `${SESSION_PREFIX}${id}`
}

export function loadMultiTabs(): MultiTabsState {
  try {
    const raw = sessionStorage.getItem(CHECKOFF_MULTI_TABS_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as { tabs?: unknown; activeId?: unknown }
      if (Array.isArray(parsed.tabs)) {
        const seen = new Set<string>()
        const tabs = parsed.tabs
          .filter((tab): tab is { id: string } => {
            return Boolean(tab) && typeof (tab as { id?: unknown }).id === 'string'
          })
          .map((tab) => ({ id: tab.id }))
          .filter((tab) => {
            if (seen.has(tab.id)) return false
            seen.add(tab.id)
            return true
          })
          .slice(0, CHECKOFF_MULTI_MAX_TABS)
        if (tabs.length > 0) {
          const activeId =
            typeof parsed.activeId === 'string' && tabs.some((tab) => tab.id === parsed.activeId)
              ? parsed.activeId
              : tabs[0].id
          return { tabs, activeId }
        }
      }
    }
  } catch {
    // 忽略损坏的存储
  }
  const id = createTabId()
  return { tabs: [{ id }], activeId: id }
}

export function saveMultiTabs(state: MultiTabsState): void {
  try {
    sessionStorage.setItem(CHECKOFF_MULTI_TABS_KEY, JSON.stringify(state))
  } catch {
    // 忽略存储不可用
  }
}

export function loadInstanceSnapshot(id: string): CheckoffInstanceSnapshot | null {
  try {
    const raw = sessionStorage.getItem(instanceStorageKey(id))
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<CheckoffInstanceSnapshot>
    const rawStep = typeof parsed.step === 'number' ? Math.round(parsed.step) : 0
    const rawIndex =
      typeof parsed.questionIndex === 'number' ? Math.round(parsed.questionIndex) : 0
    // 计时起点只在「合理区间」内恢复：非数字 / 未来时间 / 超过 24h 的陈旧快照一律丢弃，
    // 否则会把超限的 durationMs 提交给后端导致保存失败
    const rawStartedAt = typeof parsed.answerStartedAt === 'number' ? parsed.answerStartedAt : null
    const answerStartedAt =
      rawStartedAt != null &&
      Number.isFinite(rawStartedAt) &&
      rawStartedAt > 0 &&
      rawStartedAt <= Date.now() &&
      Date.now() - rawStartedAt <= MAX_ANSWER_DURATION_MS
        ? rawStartedAt
        : null
    return {
      experiment: (parsed.experiment as CheckoffExperiment | null) ?? null,
      student: (parsed.student as CheckoffStudent | null) ?? null,
      step: Math.min(4, Math.max(0, rawStep)),
      drawn: Array.isArray(parsed.drawn) ? parsed.drawn : [],
      marks:
        parsed.marks && typeof parsed.marks === 'object'
          ? (parsed.marks as Record<string, QuestionMark | undefined>)
          : {},
      existingScores: Array.isArray(parsed.existingScores) ? parsed.existingScores : [],
      questionIndex: Math.max(0, rawIndex),
      answerStartedAt,
    }
  } catch {
    return null
  }
}

export function saveInstanceSnapshot(id: string, snapshot: CheckoffInstanceSnapshot): void {
  try {
    sessionStorage.setItem(instanceStorageKey(id), JSON.stringify(snapshot))
  } catch {
    // 忽略存储不可用
  }
}

export function clearInstanceStorage(id: string): void {
  try {
    sessionStorage.removeItem(instanceStorageKey(id))
    sessionStorage.removeItem(sessionStorageKey(id))
  } catch {
    // 忽略存储不可用
  }
}
