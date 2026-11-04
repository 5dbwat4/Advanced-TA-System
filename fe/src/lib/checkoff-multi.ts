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
}

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
