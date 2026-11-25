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

/**
 * 队列只读副本缓存：进程内存中保留每个班级最新队列 / 每个会话的只读快照，
 * 用于承接 checkoff-queue 的读请求。所有写操作提交后都会调用
 * `invalidateQueueCache`（见 emitCheckoffQueueUpdate），保证读到最新数据。
 * 缓存对象仅供读取，调用方不得修改。
 */
const QUEUE_CACHE_TTL_MS = 60_000

type QueueCacheEntry = { dto: CheckoffSessionDto; expiresAt: number }

const latestSessionCache = new Map<string, QueueCacheEntry>()
const sessionCache = new Map<string, QueueCacheEntry>()

type QueueListCacheEntry = { sessions: CheckoffSessionDto[]; expiresAt: number }

const classSessionsCache = new Map<string, QueueListCacheEntry>()

/**
 * 班级最新会话 id 缓存。队列条目更新不会改变「最新会话」，
 * 因此写路径（withLatestQueueMutation）可直接复用，省掉一次额外的会话查询。
 */
const latestSessionIdCache = new Map<string, string>()

/** 新建会话后记录其 id，避免写路径回源查「最新会话」 */
export function setLatestQueueSessionId(classId: string, sessionId: string): void {
  latestSessionIdCache.set(classId, sessionId)
}

async function getLatestQueueSessionId(classId: string): Promise<string | null> {
  const cached = latestSessionIdCache.get(classId)
  if (cached) return cached
  const row = await prisma.checkoffSession.findFirst({
    where: { classId },
    orderBy: { createdAt: 'desc' },
    select: { id: true },
  })
  if (!row) return null
  latestSessionIdCache.set(classId, row.id)
  return row.id
}

function readQueueCache(
  cache: Map<string, QueueCacheEntry>,
  key: string,
): CheckoffSessionDto | null {
  const cached = cache.get(key)
  if (!cached) return null
  if (cached.expiresAt <= Date.now()) {
    cache.delete(key)
    return null
  }
  return cached.dto
}

function writeQueueCache(
  cache: Map<string, QueueCacheEntry>,
  key: string,
  dto: CheckoffSessionDto,
): void {
  cache.set(key, { dto, expiresAt: Date.now() + QUEUE_CACHE_TTL_MS })
}

/** 队列写操作提交后使缓存失效，下一次读请求回源数据库 */
export function invalidateQueueCache(classId: string, sessionId?: string): void {
  latestSessionCache.delete(classId)
  classSessionsCache.delete(classId)
  if (sessionId !== undefined) sessionCache.delete(sessionId)
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

async function migrateSession(session: CheckoffSession): Promise<CheckoffSession> {
  if (session.queueMigratedAt) return session

  const legacy = parseSessionStats(session.stats)
  const migratedAt = new Date()
  const claimed = await prisma.checkoffSession.updateMany({
    where: { id: session.id, queueMigratedAt: null },
    data: {
      queueMigratedAt: migratedAt,
      closedAt: session.closedAt ?? dateOrNull(legacy.closedAt),
    },
  })
  if (claimed.count === 0) {
    return prisma.checkoffSession.findUniqueOrThrow({ where: { id: session.id } })
  }

  const seen = new Set<string>()
  const entries = legacy.entries.filter((entry) => {
    if (seen.has(entry.userId)) return false
    seen.add(entry.userId)
    return true
  })
  if (entries.length > 0) {
    await prisma.checkoffQueueEntry.createMany({
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

async function loadSession(id: string): Promise<CheckoffSession | null> {
  const session = await prisma.checkoffSession.findUnique({ where: { id } })
  return session ? migrateSession(session) : null
}

async function loadEntries(sessionId: string): Promise<StoredQueueEntry[]> {
  const rows = await prisma.checkoffQueueEntry.findMany({
    where: { sessionId },
    orderBy: { position: 'asc' },
  })
  return rows.map(toStoredQueueEntry)
}

async function buildSessionDto(session: CheckoffSession): Promise<CheckoffSessionDto> {
  const entries = await loadEntries(session.id)
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
  session: CheckoffSession,
): Promise<CheckoffSessionDto> {
  const migrated = await migrateSession(session)
  return buildSessionDto(migrated)
}

export async function getQueueSession(
  id: string,
  options?: { fresh?: boolean },
): Promise<CheckoffSessionDto | null> {
  if (!options?.fresh) {
    const cached = readQueueCache(sessionCache, id)
    if (cached) return cached
  }
  const session = await loadSession(id)
  const dto = session ? await buildSessionDto(session) : null
  if (dto) writeQueueCache(sessionCache, id, dto)
  return dto
}

export async function getLatestQueueSession(
  classId: string,
  options?: { fresh?: boolean },
): Promise<CheckoffSessionDto | null> {
  if (!options?.fresh) {
    const cached = readQueueCache(latestSessionCache, classId)
    if (cached) return cached
  }
  const row = await prisma.checkoffSession.findFirst({
    where: { classId },
    orderBy: { createdAt: 'desc' },
  })
  if (!row) return null
  const session = await migrateSession(row)
  const dto = await buildSessionDto(session)
  if (dto) {
    writeQueueCache(latestSessionCache, classId, dto)
    setLatestQueueSessionId(classId, dto.id)
  }
  return dto
}

/** 班级最近排队的只读列表（最多 20 条），带进程内缓存 */
export async function getQueueSessions(
  classId: string,
  options?: { fresh?: boolean },
): Promise<CheckoffSessionDto[]> {
  if (!options?.fresh) {
    const cached = classSessionsCache.get(classId)
    if (cached) {
      if (cached.expiresAt > Date.now()) return cached.sessions
      classSessionsCache.delete(classId)
    }
  }
  const rows = await prisma.checkoffSession.findMany({
    where: { classId },
    orderBy: { createdAt: 'desc' },
    take: 20,
  })
  const sessions: CheckoffSessionDto[] = []
  for (const row of rows) sessions.push(await toCheckoffSessionDto(row))
  classSessionsCache.set(classId, {
    sessions,
    expiresAt: Date.now() + QUEUE_CACHE_TTL_MS,
  })
  return sessions
}

export async function migrateClassSessions(
  classId: string,
): Promise<CheckoffSession[]> {
  const rows = await prisma.checkoffSession.findMany({ where: { classId } })
  const result: CheckoffSession[] = []
  for (const row of rows) result.push(await migrateSession(row))
  return result
}

export async function saveQueueOrder(entries: StoredQueueEntry[]): Promise<void> {
  const ordered = orderQueueEntries(entries)
  for (const [position, entry] of ordered.entries()) {
    await prisma.checkoffQueueEntry.update({
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
  db: typeof prisma
  session: CheckoffSession
  entries: StoredQueueEntry[]
}

export async function withQueueMutation<T>(
  sessionId: string,
  mutate: (context: QueueMutationContext) => Promise<T>,
): Promise<{ value: T; session: CheckoffSessionDto }> {
  const session = await loadSession(sessionId)
  if (!session) throw queueError(404, 'SESSION_NOT_FOUND', '当前没有进行中的排队')

  const entries = await loadEntries(sessionId)
  const value = await mutate({ db: prisma, session, entries })
  const fresh = await prisma.checkoffSession.findUniqueOrThrow({ where: { id: sessionId } })
  const dto = await buildSessionDto(fresh)
  return { value, session: dto }
}

export async function withLatestQueueMutation<T>(
  classId: string,
  mutate: (context: QueueMutationContext) => Promise<T>,
): Promise<{ value: T; session: CheckoffSessionDto }> {
  const latestId = await getLatestQueueSessionId(classId)
  if (!latestId) throw queueError(404, 'SESSION_NOT_FOUND', '当前没有进行中的排队')
  return withQueueMutation(latestId, mutate)
}

export function assertQueueOpen(session: CheckoffSession): void {
  if (session.closedAt) throw queueError(409, 'SESSION_CLOSED', '排队已结束')
}

export async function closeQueueSession(id: string): Promise<CheckoffSessionDto> {
  const session = await loadSession(id)
  if (!session) throw queueError(404, 'SESSION_NOT_FOUND', '排队不存在')
  if (session.closedAt) return buildSessionDto(session)

  const closedAt = new Date()
  await prisma.checkoffSession.update({ where: { id }, data: { closedAt } })
  return buildSessionDto({ ...session, closedAt })
}
