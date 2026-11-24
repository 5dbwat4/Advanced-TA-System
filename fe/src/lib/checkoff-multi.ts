import type { QuestionMark } from '@/components/checkoff/QuestionDrawer'
import type { CheckoffExperiment, CheckoffQuestion, CheckoffStudent, Score } from '@/lib/api'
import { clearCheckoffResume, multiCheckoffResumeKey } from '@/lib/checkoff-resume'
import { warnStorageFailure } from '@/lib/storage-log'

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
  activeStartedAt?: string | null
}

export function createTabId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`
}

function scopedKey(base: string, userId: string, classId: string): string {
  return `${base}.${userId}.${classId}`
}

export function instanceStorageKey(id: string, userId: string, classId: string): string {
  return scopedKey(`${INSTANCE_PREFIX}${id}`, userId, classId)
}

export function sessionStorageKey(id: string, userId: string, classId: string): string {
  return scopedKey(`${SESSION_PREFIX}${id}`, userId, classId)
}

function freshTabs(): MultiTabsState {
  const id = createTabId()
  return { tabs: [{ id }], activeId: id }
}

export function loadMultiTabs(userId?: string, classId?: string): MultiTabsState {
  if (!userId || !classId) return freshTabs()
  try {
    const raw = sessionStorage.getItem(scopedKey(CHECKOFF_MULTI_TABS_KEY, userId, classId))
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
  } catch (error) {
    warnStorageFailure('load checkoff multi tabs', error)
  }
  return freshTabs()
}

export function saveMultiTabs(state: MultiTabsState, userId?: string, classId?: string): void {
  if (!userId || !classId) return
  try {
    sessionStorage.setItem(
      scopedKey(CHECKOFF_MULTI_TABS_KEY, userId, classId),
      JSON.stringify(state),
    )
  } catch (error) {
    warnStorageFailure('save checkoff multi tabs', error)
  }
}

export function loadInstanceSnapshot(
  id: string,
  userId: string,
  classId: string,
): CheckoffInstanceSnapshot | null {
  try {
    const raw = sessionStorage.getItem(instanceStorageKey(id, userId, classId))
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
      activeStartedAt:
        typeof parsed.activeStartedAt === 'string' ? parsed.activeStartedAt : null,
    }
  } catch (error) {
    warnStorageFailure('read checkoff instance snapshot', error)
    return null
  }
}

export function saveInstanceSnapshot(
  id: string,
  snapshot: CheckoffInstanceSnapshot,
  userId: string,
  classId: string,
): void {
  try {
    sessionStorage.setItem(instanceStorageKey(id, userId, classId), JSON.stringify(snapshot))
  } catch (error) {
    warnStorageFailure('save checkoff instance snapshot', error)
  }
}

export function pushMultiInstance(
  snapshot: CheckoffInstanceSnapshot,
  userId?: string,
  classId?: string,
): string | null {
  if (!userId || !classId) return null
  let tabs: MultiTab[] = []
  try {
    if (sessionStorage.getItem(scopedKey(CHECKOFF_MULTI_TABS_KEY, userId, classId))) {
      tabs = loadMultiTabs(userId, classId).tabs
    }
  } catch (error) {
    warnStorageFailure('read checkoff multi tab state', error)
    return null
  }
  if (tabs.length >= CHECKOFF_MULTI_MAX_TABS) return null
  const id = createTabId()
  saveInstanceSnapshot(id, snapshot, userId, classId)
  saveMultiTabs({ tabs: [...tabs, { id }], activeId: id }, userId, classId)
  return id
}

export function clearInstanceStorage(id: string, userId?: string, classId?: string): void {
  if (userId && classId) {
    clearCheckoffResume(multiCheckoffResumeKey(id, userId, classId))
    try {
      sessionStorage.removeItem(instanceStorageKey(id, userId, classId))
      sessionStorage.removeItem(sessionStorageKey(id, userId, classId))
    } catch (error) {
      warnStorageFailure('clear checkoff instance snapshot', error)
    }
  }
}
