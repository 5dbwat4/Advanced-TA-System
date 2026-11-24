import { Prisma } from '@prisma/client'
import type { CheckoffQueueEntry as QueueEntryRecord, CheckoffSession } from '@prisma/client'

import { prisma } from './prisma.js'

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
  missedAt: string | null
}

export type StoredQueueEntry = CheckoffQueueEntry & {
  id: string
  position: number
}

export type CheckoffSessionStats = {
  entries: CheckoffQueueEntry[]
  closedAt: string | null
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
  startAt: string
}

export type CheckoffSessionDto = {
  id: string
  classId: string
  settings: CheckoffSessionSettings
  stats: CheckoffSessionStats
  closedAt: string | null
  createdAt: string
}

export class CheckoffQueueError extends Error {
  constructor(
    readonly statusCode: number,
    readonly code: string,
    message: string,
  ) {
    super(message)
  }
}

export function queueError(statusCode: number, code: string, message: string): CheckoffQueueError {
  return new CheckoffQueueError(statusCode, code, message)
}

export function parseJsonObject(raw: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {}
  } catch (error) {
    if (raw.trim()) console.warn('Failed to parse stored JSON:', error)
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
    missedAt: typeof entry.missedAt === 'string' ? entry.missedAt : null,
  }
}

export function orderQueueEntries<T extends CheckoffQueueEntry>(entries: T[]): T[] {
  const finished = entries
    .filter((entry) => entry.status === 'finished')
    .sort((a, b) => {
      const aTime = a.finishedAt ? Date.parse(a.finishedAt) : Number.NaN
      const bTime = b.finishedAt ? Date.parse(b.finishedAt) : Number.NaN
      const aValue = Number.isNaN(aTime) ? Number.POSITIVE_INFINITY : aTime
      const bValue = Number.isNaN(bTime) ? Number.POSITIVE_INFINITY : bTime
      return aValue - bValue
    })
  const current = entries.filter((entry) => entry.status === 'called')
  const waiting = entries.filter(
    (entry) => entry.status !== 'finished' && entry.status !== 'called',
  )
  return [...finished, ...current, ...waiting]
}

export function parseSessionStats(raw: string): CheckoffSessionStats {
  const data = parseJsonObject(raw)
  const entries = Array.isArray(data.entries)
    ? data.entries
        .map(readQueueEntry)
        .filter((entry): entry is CheckoffQueueEntry => entry !== null)
    : []
  const closedAt = typeof data.closedAt === 'string' ? data.closedAt : null
  return { ...data, entries: orderQueueEntries(entries), closedAt }
}

export function isStudentInScope(settings: CheckoffSessionSettings, userId: string): boolean {
  if (settings.studentScope === 'all') return true
  const ids = new Set(settings.studentIds)
  return settings.studentScope === 'whitelist' ? ids.has(userId) : !ids.has(userId)
}

function dateOrNull(value: string | null): Date | null {
  if (!value) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

function dateOrFallback(value: string, fallback: Date): Date {
  return dateOrNull(value) ?? fallback
}

export function toQueueEntryDto(entry: QueueEntryRecord): CheckoffQueueEntry {
  return {
    userId: entry.userId,
    experimentId: entry.experimentId,
    taId: entry.taId,
    status:
      entry.status === 'called' || entry.status === 'notified' || entry.status === 'finished'
        ? entry.status
        : 'waiting',
    joinedAt: entry.joinedAt.toISOString(),
    notifiedAt: entry.notifiedAt?.toISOString() ?? null,
    notifiedBy: entry.notifiedBy,
    startedAt: entry.startedAt?.toISOString() ?? null,
    checkedBy: entry.checkedBy,
    finishedAt: entry.finishedAt?.toISOString() ?? null,
    missedAt: entry.missedAt?.toISOString() ?? null,
  }
}

export function toStoredQueueEntry(entry: QueueEntryRecord): StoredQueueEntry {
  return { ...toQueueEntryDto(entry), id: entry.id, position: entry.position }
}

async function migrateSession(
  tx: Prisma.TransactionClient,
  session: CheckoffSession,
): Promise<CheckoffSession> {
  if (session.queueMigratedAt) return session

  const legacy = parseSessionStats(session.stats)
  const migratedAt = new Date()
  const claimed = await tx.checkoffSession.updateMany({
    where: { id: session.id, queueMigratedAt: null },
    data: {
      queueMigratedAt: migratedAt,
      closedAt: session.closedAt ?? dateOrNull(legacy.closedAt),
    },
  })
  if (claimed.count === 0) {
    return tx.checkoffSession.findUniqueOrThrow({ where: { id: session.id } })
  }

  const seen = new Set<string>()
  const entries = legacy.entries.filter((entry) => {
    if (seen.has(entry.userId)) return false
    seen.add(entry.userId)
    return true
  })
  if (entries.length > 0) {
    await tx.checkoffQueueEntry.createMany({
      data: entries.map((entry, position) => ({
        sessionId: session.id,
        userId: entry.userId,
        experimentId: entry.experimentId,
        taId: entry.taId,
        position,
        status: entry.status,
        joinedAt: dateOrFallback(entry.joinedAt, session.createdAt),
        notifiedAt: dateOrNull(entry.notifiedAt),
        notifiedBy: entry.notifiedBy,
        startedAt: dateOrNull(entry.startedAt),
        checkedBy: entry.checkedBy,
        finishedAt: dateOrNull(entry.finishedAt),
        missedAt: dateOrNull(entry.missedAt),
      })),
    })
  }

  return {
    ...session,
    closedAt: session.closedAt ?? dateOrNull(legacy.closedAt),
    queueMigratedAt: migratedAt,
  }
}

async function loadSession(
  tx: Prisma.TransactionClient,
  id: string,
): Promise<CheckoffSession | null> {
  const session = await tx.checkoffSession.findUnique({ where: { id } })
  return session ? migrateSession(tx, session) : null
}

async function loadEntries(
  tx: Prisma.TransactionClient,
  sessionId: string,
): Promise<StoredQueueEntry[]> {
  const rows = await tx.checkoffQueueEntry.findMany({
    where: { sessionId },
    orderBy: { position: 'asc' },
  })
  return rows.map(toStoredQueueEntry)
}

async function buildSessionDto(
  tx: Prisma.TransactionClient,
  session: CheckoffSession,
): Promise<CheckoffSessionDto> {
  const entries = await loadEntries(tx, session.id)
  const closedAt = session.closedAt?.toISOString() ?? null
  return {
    id: session.id,
    classId: session.classId,
    settings: parseSessionSettings(session.settings),
    stats: { entries: entries.map(toQueueEntryDtoFromStored), closedAt },
    closedAt,
    createdAt: session.createdAt.toISOString(),
  }
}

function toQueueEntryDtoFromStored(entry: StoredQueueEntry): CheckoffQueueEntry {
  const { id, position, ...dto } = entry
  void id
  void position
  return dto
}

export async function toCheckoffSessionDto(
  tx: Prisma.TransactionClient,
  session: CheckoffSession,
): Promise<CheckoffSessionDto> {
  const migrated = await migrateSession(tx, session)
  return buildSessionDto(tx, migrated)
}

export async function getQueueSession(id: string): Promise<CheckoffSessionDto | null> {
  return prisma.$transaction(async (tx) => {
    const session = await loadSession(tx, id)
    return session ? buildSessionDto(tx, session) : null
  })
}

export async function getLatestQueueSession(classId: string): Promise<CheckoffSessionDto | null> {
  return prisma.$transaction(async (tx) => {
    const row = await tx.checkoffSession.findFirst({
      where: { classId },
      orderBy: { createdAt: 'desc' },
    })
    if (!row) return null
    const session = await migrateSession(tx, row)
    return buildSessionDto(tx, session)
  })
}

export async function migrateClassSessions(
  tx: Prisma.TransactionClient,
  classId: string,
): Promise<CheckoffSession[]> {
  const rows = await tx.checkoffSession.findMany({ where: { classId } })
  const result: CheckoffSession[] = []
  for (const row of rows) result.push(await migrateSession(tx, row))
  return result
}

export async function saveQueueOrder(
  tx: Prisma.TransactionClient,
  entries: StoredQueueEntry[],
): Promise<void> {
  const ordered = orderQueueEntries(entries)
  for (const [position, entry] of ordered.entries()) {
    await tx.checkoffQueueEntry.update({
      where: { id: entry.id },
      data: {
        position,
        experimentId: entry.experimentId,
        taId: entry.taId,
        status: entry.status,
        notifiedAt: dateOrNull(entry.notifiedAt),
        notifiedBy: entry.notifiedBy,
        startedAt: dateOrNull(entry.startedAt),
        checkedBy: entry.checkedBy,
        finishedAt: dateOrNull(entry.finishedAt),
        missedAt: dateOrNull(entry.missedAt),
      },
    })
  }
}

export type QueueMutationContext = {
  tx: Prisma.TransactionClient
  session: CheckoffSession
  entries: StoredQueueEntry[]
}

export async function withQueueMutation<T>(
  sessionId: string,
  mutate: (context: QueueMutationContext) => Promise<T>,
): Promise<{ value: T; session: CheckoffSessionDto }> {
  return prisma.$transaction(async (tx) => {
    const session = await loadSession(tx, sessionId)
    if (!session) throw queueError(404, 'SESSION_NOT_FOUND', '当前没有进行中的排队')

    const locked = await tx.checkoffSession.updateMany({
      where: { id: session.id, revision: session.revision },
      data: { revision: { increment: 1 } },
    })
    if (locked.count !== 1) {
      throw queueError(409, 'QUEUE_CONFLICT', '队列已被其他人更新，请刷新后重试')
    }

    const entries = await loadEntries(tx, sessionId)
    const value = await mutate({ tx, session, entries })
    const fresh = await tx.checkoffSession.findUniqueOrThrow({ where: { id: sessionId } })
    const dto = await buildSessionDto(tx, fresh)
    return { value, session: dto }
  })
}

export async function withLatestQueueMutation<T>(
  classId: string,
  mutate: (context: QueueMutationContext) => Promise<T>,
): Promise<{ value: T; session: CheckoffSessionDto }> {
  const latest = await getLatestQueueSession(classId)
  if (!latest) throw queueError(404, 'SESSION_NOT_FOUND', '当前没有进行中的排队')
  return withQueueMutation(latest.id, mutate)
}

export function assertQueueOpen(session: CheckoffSession): void {
  if (session.closedAt) throw queueError(409, 'SESSION_CLOSED', '排队已结束')
}

export async function closeQueueSession(id: string): Promise<CheckoffSessionDto> {
  return prisma.$transaction(async (tx) => {
    const session = await loadSession(tx, id)
    if (!session) throw queueError(404, 'SESSION_NOT_FOUND', '排队不存在')
    if (session.closedAt) return buildSessionDto(tx, session)

    const updated = await tx.checkoffSession.updateMany({
      where: { id, revision: session.revision },
      data: { closedAt: new Date(), revision: { increment: 1 } },
    })
    if (updated.count !== 1) {
      throw queueError(409, 'QUEUE_CONFLICT', '队列已被其他人更新，请刷新后重试')
    }
    return buildSessionDto(tx, { ...session, closedAt: new Date() })
  })
}
