export type CheckoffQueueEntry = {
  userId: string
  experimentId: string
  taId: string | null
  status: 'waiting' | 'notified' | 'called' | 'finished'
  joinedAt: string
  notifiedAt: string | null
  notifiedBy: string | null
  startedAt: string | null
  checkedBy: string | null
  finishedAt: string | null
}

export type CheckoffSessionStats = {
  entries: CheckoffQueueEntry[]
  [key: string]: unknown
}

export type CheckoffSessionSettings = {
  acceptedExperimentIds: string[]
  priorityExperimentIds: string[]
  taIds: string[]
  allowStudentChooseTa: boolean
  taPreferences: Record<string, string[]>
  studentScope: 'all' | 'whitelist' | 'blacklist'
  studentIds: string[]
  allowSelfMoveDown: boolean
  jumpMode: 'after3' | 'anywhere' | 'none'
  startMode: 'now' | 'scheduled'
  startAt: string
}

export function parseJsonObject(raw: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {}
  } catch {
    return {}
  }
}

function readStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.filter((item): item is string => typeof item === 'string')
}

function readStringRecord(value: unknown): Record<string, string[]> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  const result: Record<string, string[]> = {}
  for (const [key, item] of Object.entries(value)) {
    result[key] = readStringArray(item)
  }
  return result
}

export function parseSessionSettings(raw: string): CheckoffSessionSettings {
  const data = parseJsonObject(raw)
  return {
    acceptedExperimentIds: readStringArray(data.acceptedExperimentIds),
    priorityExperimentIds: readStringArray(data.priorityExperimentIds),
    taIds: readStringArray(data.taIds),
    allowStudentChooseTa: data.allowStudentChooseTa === true,
    taPreferences: readStringRecord(data.taPreferences),
    studentScope:
      data.studentScope === 'whitelist' || data.studentScope === 'blacklist'
        ? data.studentScope
        : 'all',
    studentIds: readStringArray(data.studentIds),
    allowSelfMoveDown: data.allowSelfMoveDown !== false,
    jumpMode:
      data.jumpMode === 'after3' || data.jumpMode === 'anywhere'
        ? data.jumpMode
        : 'none',
    startMode: data.startMode === 'scheduled' ? 'scheduled' : 'now',
    startAt: typeof data.startAt === 'string' ? data.startAt : '',
  }
}

function readQueueEntry(value: unknown): CheckoffQueueEntry | null {
  if (!value || typeof value !== 'object') return null
  const entry = value as Partial<CheckoffQueueEntry> & {
    calledAt?: string | null
    calledBy?: string | null
  }
  if (typeof entry.userId !== 'string' || typeof entry.experimentId !== 'string') return null
  if (typeof entry.joinedAt !== 'string') return null
  const status =
    entry.status === 'called'
      ? 'called'
      : entry.status === 'notified'
        ? 'notified'
        : entry.status === 'finished'
          ? 'finished'
          : 'waiting'
  const legacyAt = typeof entry.calledAt === 'string' ? entry.calledAt : null
  const legacyBy = typeof entry.calledBy === 'string' ? entry.calledBy : null
  return {
    userId: entry.userId,
    experimentId: entry.experimentId,
    taId: typeof entry.taId === 'string' ? entry.taId : null,
    status,
    joinedAt: entry.joinedAt,
    notifiedAt:
      typeof entry.notifiedAt === 'string'
        ? entry.notifiedAt
        : status === 'notified'
          ? legacyAt
          : null,
    notifiedBy:
      typeof entry.notifiedBy === 'string'
        ? entry.notifiedBy
        : status === 'notified'
          ? legacyBy
          : null,
    startedAt:
      typeof entry.startedAt === 'string'
        ? entry.startedAt
        : status === 'called'
          ? legacyAt
          : null,
    checkedBy:
      typeof entry.checkedBy === 'string'
        ? entry.checkedBy
        : status === 'called'
          ? legacyBy
          : null,
    finishedAt: typeof entry.finishedAt === 'string' ? entry.finishedAt : null,
  }
}

export function orderQueueEntries(entries: CheckoffQueueEntry[]): CheckoffQueueEntry[] {
  const finished = entries
    .filter((entry) => entry.status === 'finished')
    .sort((a, b) => {
      const aTime = a.finishedAt ? Date.parse(a.finishedAt) : Number.NaN
      const bTime = b.finishedAt ? Date.parse(b.finishedAt) : Number.NaN
      const aValue = Number.isNaN(aTime) ? Number.POSITIVE_INFINITY : aTime
      const bValue = Number.isNaN(bTime) ? Number.POSITIVE_INFINITY : bTime
      return aValue - bValue
    })
  const current = entries.find((entry) => entry.status === 'called') ?? null
  const rest = entries.filter(
    (entry) => entry.status !== 'finished' && entry !== current,
  )
  return current ? [...finished, current, ...rest] : [...finished, ...rest]
}

export function parseSessionStats(raw: string): CheckoffSessionStats {
  const data = parseJsonObject(raw)
  const entries = Array.isArray(data.entries)
    ? data.entries
        .map(readQueueEntry)
        .filter((entry): entry is CheckoffQueueEntry => entry !== null)
    : []
  return { ...data, entries: orderQueueEntries(entries) }
}

export function isStudentInScope(settings: CheckoffSessionSettings, userId: string): boolean {
  if (settings.studentScope === 'all') return true
  const ids = new Set(settings.studentIds)
  return settings.studentScope === 'whitelist' ? ids.has(userId) : !ids.has(userId)
}
