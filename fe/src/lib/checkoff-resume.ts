import type { QuestionMark } from '@/components/checkoff/QuestionDrawer'
import type { CheckoffExperiment, CheckoffQuestion, CheckoffStudent, Score } from '@/lib/api'
import { warnStorageFailure } from '@/lib/storage-log'

const RESUME_PREFIX = 'tasaas.checkoff.resume.v1'

export type CheckoffResumeSnapshot = {
  savedAt: string
  student: CheckoffStudent
  experiment: CheckoffExperiment
  step: number
  drawn: CheckoffQuestion[]
  marks: Record<string, QuestionMark | undefined>
  existingScores: Score[]
  questionIndex: number
  activeStartedAt: string | null
}

export function singleCheckoffResumeKey(userId: string, classId: string): string {
  return `${RESUME_PREFIX}.single.${userId}.${classId}`
}

export function multiCheckoffResumeKey(
  tabId: string,
  userId: string,
  classId: string,
): string {
  return `${RESUME_PREFIX}.multi.${userId}.${classId}.${tabId}`
}

export function loadCheckoffResume(key: string): CheckoffResumeSnapshot | null {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<CheckoffResumeSnapshot>
    if (
      !parsed.student ||
      typeof parsed.student.userId !== 'string' ||
      typeof parsed.student.name !== 'string' ||
      !parsed.experiment ||
      typeof parsed.experiment.id !== 'string'
    ) {
      return null
    }
    const step = typeof parsed.step === 'number' ? Math.round(parsed.step) : 0
    if (step < 2 || step > 4) return null
    return {
      savedAt: typeof parsed.savedAt === 'string' ? parsed.savedAt : new Date().toISOString(),
      student: parsed.student,
      experiment: parsed.experiment,
      step,
      drawn: Array.isArray(parsed.drawn) ? parsed.drawn : [],
      marks:
        parsed.marks && typeof parsed.marks === 'object'
          ? (parsed.marks as Record<string, QuestionMark | undefined>)
          : {},
      existingScores: Array.isArray(parsed.existingScores) ? parsed.existingScores : [],
      questionIndex:
        typeof parsed.questionIndex === 'number' ? Math.max(0, Math.round(parsed.questionIndex)) : 0,
      activeStartedAt:
        typeof parsed.activeStartedAt === 'string' ? parsed.activeStartedAt : null,
    }
  } catch (error) {
    warnStorageFailure('read checkoff resume snapshot', error)
    return null
  }
}

export function saveCheckoffResume(key: string, snapshot: CheckoffResumeSnapshot): void {
  try {
    localStorage.setItem(key, JSON.stringify(snapshot))
  } catch (error) {
    warnStorageFailure('save checkoff resume snapshot', error)
  }
}

export function clearCheckoffResume(key: string): void {
  try {
    localStorage.removeItem(key)
  } catch (error) {
    warnStorageFailure('clear checkoff resume snapshot', error)
  }
}
