import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'

import { myClassIds, requireStaffRole, requireTARole } from '../lib/class-access.js'
import {
  assertQueueOpen,
  closeQueueSession,
  getQueueSession,
  getQueueSessions,
  migrateClassSessions,
  orderQueueEntries,
  parseSessionSettings,
  queueError,
  saveQueueOrder,
  setLatestQueueSessionId,
  toCheckoffSessionDto,
  withQueueMutation,
  type StoredQueueEntry,
} from '../lib/checkoff-queue.js'
import { prisma } from '../lib/prisma.js'
import { checkoffQueueUpdateLimit } from '../lib/rate-limit.js'
import { emitCheckoffQueueUpdate } from '../lib/realtime.js'

const idListSchema = z.array(z.string().trim().min(1)).max(5000)

const sessionSettingsSchema = z.object({
  acceptedExperimentIds: idListSchema.min(1),
  priorityExperimentIds: idListSchema.default([]),
  taIds: idListSchema.max(500).default([]),
  allowStudentChooseTa: z.boolean().default(false),
  taPreferences: z.record(idListSchema).default({}),
  studentScope: z.enum(['all', 'whitelist', 'blacklist']).default('all'),
  studentIds: idListSchema.default([]),
  allowSelfMoveDown: z.boolean().default(true),
  jumpMode: z.enum(['after3', 'anywhere', 'none']).default('none'),
  startAt: z.string().trim().min(1).optional(),
})

const createSessionSchema = z.object({
  classId: z.string().trim().min(1),
  settings: sessionSettingsSchema.extend({
    startAt: z.string().trim().min(1),
  }),
})

const updateSessionSettingsSchema = z.object({
  settings: sessionSettingsSchema,
})

const listSessionsQuerySchema = z.object({
  classId: z.string().trim().min(1),
})

const queueActionSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('move'),
    userIds: idListSchema.min(1),
    direction: z.enum(['up', 'down', 'top']),
  }),
  z.object({
    action: z.literal('precall'),
    userIds: idListSchema.min(1),
    called: z.boolean(),
  }),
  z.object({
    action: z.literal('remove'),
    userIds: idListSchema.min(1),
  }),
  z.object({
    action: z.literal('reorder'),
    userId: z.string().trim().min(1),
    toIndex: z.number().int().min(0),
  }),
  z.object({
    action: z.literal('requeue'),
    userId: z.string().trim().min(1),
  }),
  z.object({
    action: z.literal('finish'),
    userId: z.string().trim().min(1),
  }),
])

type SessionSettingsInput = z.infer<typeof sessionSettingsSchema>

function unique(values: string[]): string[] {
  return [...new Set(values)]
}

type NormalizedSettings =
  | { ok: true; settings: SessionSettingsInput & { startAt: string } }
  | { ok: false; message: string }

async function normalizeSettings(
  classId: string,
  input: SessionSettingsInput,
): Promise<NormalizedSettings> {
  const acceptedExperimentIds = unique(input.acceptedExperimentIds)
  const experiments = await prisma.experiment.findMany({
    where: { classId, id: { in: acceptedExperimentIds } },
    select: { id: true },
  })
  if (experiments.length !== acceptedExperimentIds.length) {
    return { ok: false, message: '存在不属于当前课程的实验' }
  }
  const acceptedSet = new Set(acceptedExperimentIds)

  const priorityExperimentIds = unique(input.priorityExperimentIds).filter((id) =>
    acceptedSet.has(id),
  )

  const taIds = unique(input.taIds)
  if (taIds.length > 0) {
    const tas = await prisma.user.findMany({
      where: { classId, role: 'TA', id: { in: taIds } },
      select: { id: true },
    })
    if (tas.length !== taIds.length) {
      return { ok: false, message: '存在不属于当前课程的助教' }
    }
  }

  const taPreferences: Record<string, string[]> = {}
  for (const taId of taIds) {
    taPreferences[taId] = unique(input.taPreferences[taId] ?? []).filter((id) =>
      acceptedSet.has(id),
    )
  }

  let studentIds = unique(input.studentIds)
  if (input.studentScope === 'all') {
    studentIds = []
  } else {
    if (studentIds.length === 0) {
      return { ok: false, message: '白名单 / 黑名单不能为空' }
    }
    const studentCount = await prisma.user.count({
      where: {
        classId,
        role: 'STUDENT',
        status: 'ACTIVE',
        id: { in: studentIds },
      },
    })
    if (studentCount !== studentIds.length) {
      return { ok: false, message: '存在不属于当前课程的学生' }
    }
  }

  if (!input.startAt) return { ok: false, message: '请选择开始时间' }
  const startAt = new Date(input.startAt)
  if (Number.isNaN(startAt.getTime())) {
    return { ok: false, message: '开始时间无效' }
  }

  return {
    ok: true,
    settings: {
      ...input,
      acceptedExperimentIds,
      priorityExperimentIds,
      taIds,
      taPreferences,
      studentIds,
      startAt: startAt.toISOString(),
    },
  }
}

function moveEntries(
  entries: StoredQueueEntry[],
  selected: Set<string>,
  direction: 'up' | 'down' | 'top',
) {
  const fixed = entries.filter(
    (entry) => entry.status === 'finished' || entry.status === 'called',
  )
  const waiting = entries.filter(
    (entry) => entry.status !== 'finished' && entry.status !== 'called',
  )
  if (direction === 'top') {
    const picked = waiting.filter((entry) => selected.has(entry.userId))
    const rest = waiting.filter((entry) => !selected.has(entry.userId))
    return [...fixed, ...picked, ...rest]
  }
  const next = [...waiting]
  if (direction === 'up') {
    for (let i = 1; i < next.length; i += 1) {
      if (selected.has(next[i].userId) && !selected.has(next[i - 1].userId)) {
        ;[next[i - 1], next[i]] = [next[i], next[i - 1]]
      }
    }
  } else {
    for (let i = next.length - 2; i >= 0; i -= 1) {
      if (selected.has(next[i].userId) && !selected.has(next[i + 1].userId)) {
        ;[next[i], next[i + 1]] = [next[i + 1], next[i]]
      }
    }
  }
  return [...fixed, ...next]
}

function reorderEntries(entries: StoredQueueEntry[], userId: string, toIndex: number) {
  const finished = entries.filter((entry) => entry.status === 'finished')
  const current = entries.filter((entry) => entry.status === 'called')
  const waiting = entries.filter(
    (entry) => entry.status !== 'finished' && entry.status !== 'called',
  )
  const fromIndex = waiting.findIndex((entry) => entry.userId === userId)
  if (fromIndex < 0) return null
  const next = [...waiting]
  const [item] = next.splice(fromIndex, 1)
  if (!item) return null
  const target = Math.max(0, Math.min(toIndex, next.length))
  next.splice(target, 0, item)
  return orderQueueEntries([...finished, ...current, ...next])
}

export const checkoffSessionsRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get(
    '/',
    { onRequest: [fastify.authenticate, requireStaffRole] },
    async (request, reply) => {
      const parsed = listSessionsQuerySchema.safeParse(request.query)
      if (!parsed.success) {
        return reply.code(400).send({ error: 'INVALID_QUERY', message: '课程参数无效' })
      }

      const classIds = await myClassIds(request)
      if (!classIds.includes(parsed.data.classId)) {
        return reply.code(403).send({ error: 'FORBIDDEN', message: '无权访问该班级' })
      }

      const sessions = await getQueueSessions(parsed.data.classId)

      return reply.send({ sessions })
    },
  )

  fastify.post(
    '/',
    { onRequest: [fastify.authenticate, requireStaffRole] },
    async (request, reply) => {
      const parsed = createSessionSchema.safeParse(request.body)
      if (!parsed.success) {
        return reply.code(400).send({ error: 'INVALID_BODY', message: '请求参数不正确' })
      }

      const classIds = await myClassIds(request)
      if (!classIds.includes(parsed.data.classId)) {
        return reply.code(403).send({ error: 'FORBIDDEN', message: '无权操作该班级' })
      }

      const normalized = await normalizeSettings(parsed.data.classId, parsed.data.settings)
      if (!normalized.ok) {
        return reply.code(400).send({ error: 'INVALID_SETTINGS', message: normalized.message })
      }

      await prisma.class.update({
        where: { id: parsed.data.classId },
        data: { updatedAt: new Date() },
      })
      const existing = await migrateClassSessions(parsed.data.classId)
      if (existing.some((item) => !item.closedAt)) {
        throw queueError(409, 'ACTIVE_SESSION_EXISTS', '当前已有未结束的排队，请先结束旧排队')
      }
      const created = await prisma.checkoffSession.create({
        data: {
          classId: parsed.data.classId,
          settings: JSON.stringify(normalized.settings),
          stats: JSON.stringify({ entries: [] }),
          queueMigratedAt: new Date(),
        },
      })
      const session = await toCheckoffSessionDto(created)

      setLatestQueueSessionId(parsed.data.classId, session.id)
      emitCheckoffQueueUpdate(parsed.data.classId, session.id)
      return reply.code(201).send({ session })
    },
  )

  fastify.patch(
    '/:id/settings',
    { onRequest: [fastify.authenticate, requireStaffRole] },
    async (request, reply) => {
      const params = z.object({ id: z.string().min(1) }).safeParse(request.params)
      const parsed = updateSessionSettingsSchema.safeParse(request.body)
      if (!params.success || !parsed.success) {
        return reply.code(400).send({ error: 'INVALID_BODY', message: '请求参数不正确' })
      }

      const existing = await getQueueSession(params.data.id, { fresh: true })
      if (!existing) {
        return reply.code(404).send({ error: 'SESSION_NOT_FOUND', message: '排队不存在' })
      }
      const classIds = await myClassIds(request)
      if (!classIds.includes(existing.classId)) {
        return reply.code(403).send({ error: 'FORBIDDEN', message: '无权操作该班级' })
      }

      const normalized = await normalizeSettings(existing.classId, {
        ...parsed.data.settings,
        startAt: parsed.data.settings.startAt ?? existing.settings.startAt,
      })
      if (!normalized.ok) {
        return reply.code(400).send({ error: 'INVALID_SETTINGS', message: normalized.message })
      }

      const { session } = await withQueueMutation(params.data.id, async ({ db, session }) => {
        assertQueueOpen(session)
        await db.checkoffSession.update({
          where: { id: session.id },
          data: { settings: JSON.stringify(normalized.settings) },
        })
      })
      emitCheckoffQueueUpdate(session.classId, session.id)
      return reply.send({ session })
    },
  )

  fastify.patch(
    '/:id/queue',
    { onRequest: [fastify.authenticate, requireStaffRole, checkoffQueueUpdateLimit] },
    async (request, reply) => {
      const params = z.object({ id: z.string().min(1) }).safeParse(request.params)
      const parsed = queueActionSchema.safeParse(request.body)
      if (!params.success || !parsed.success) {
        return reply.code(400).send({ error: 'INVALID_BODY', message: '请求参数不正确' })
      }

      const existing = await getQueueSession(params.data.id, { fresh: true })
      if (!existing) {
        return reply.code(404).send({ error: 'SESSION_NOT_FOUND', message: '排队不存在' })
      }
      const classIds = await myClassIds(request)
      if (!classIds.includes(existing.classId)) {
        return reply.code(403).send({ error: 'FORBIDDEN', message: '无权操作该班级' })
      }

      const action = parsed.data
      const { sub } = request.user as { sub: string }
      const { session } = await withQueueMutation(params.data.id, async ({ db, session, entries: current }) => {
        assertQueueOpen(session)
        const selected = new Set(
          action.action === 'reorder' || action.action === 'requeue' || action.action === 'finish'
            ? [action.userId]
            : action.userIds,
        )
        if (!current.some((entry) => selected.has(entry.userId))) {
          throw queueError(400, 'ENTRY_NOT_FOUND', '队列中没有指定学生')
        }

        let notifiedByName: string | null = null
        if (action.action === 'precall' && action.called) {
          const me = await db.user.findUnique({ where: { id: sub }, select: { name: true } })
          notifiedByName = me?.name ?? null
        }

        let entries = current
        if (action.action === 'remove') {
          entries = entries.filter((entry) => !selected.has(entry.userId))
          await db.checkoffQueueEntry.deleteMany({
            where: { sessionId: session.id, userId: { in: [...selected] } },
          })
        } else if (action.action === 'precall') {
          const notifiedAt = new Date().toISOString()
          entries = entries.map((entry) => {
            if (!selected.has(entry.userId) || entry.status === 'finished') return entry
            if (action.called) {
              if (entry.status === 'called' || entry.status === 'notified') return entry
              return {
                ...entry,
                status: 'notified' as const,
                notifiedAt,
                notifiedBy: notifiedByName,
                startedAt: null,
                checkedBy: null,
                finishedAt: null,
                missedAt: null,
              }
            }
            if (entry.status !== 'notified') return entry
            return { ...entry, status: 'waiting' as const, notifiedAt: null, notifiedBy: null }
          })
        } else if (action.action === 'reorder') {
          const target = entries.find((entry) => entry.userId === action.userId)
          if (target?.status === 'finished') {
            throw queueError(403, 'FINISHED', '已完成验收，无法调整顺序')
          }
          const reordered = reorderEntries(entries, action.userId, action.toIndex)
          if (!reordered) throw queueError(400, 'ENTRY_NOT_FOUND', '队列中没有指定学生')
          entries = reordered
        } else if (action.action === 'requeue') {
          const target = entries.find((entry) => entry.userId === action.userId)
          if (!target) throw queueError(400, 'ENTRY_NOT_FOUND', '队列中没有指定学生')
          if (target.status === 'finished') {
            throw queueError(403, 'FINISHED', '已完成验收，无法推回队列')
          }
          const missedAt = new Date().toISOString()
          entries = entries.map((entry) =>
            entry.userId === action.userId
              ? {
                  ...entry,
                  status: 'waiting' as const,
                  notifiedAt: null,
                  notifiedBy: null,
                  startedAt: null,
                  checkedBy: null,
                  finishedAt: null,
                  missedAt,
                }
              : entry,
          )
          if (parseSessionSettings(session.settings).jumpMode === 'none') {
            const waiting = entries.filter(
              (entry) => entry.status !== 'finished' && entry.status !== 'called',
            )
            const requeued = reorderEntries(entries, action.userId, Math.max(0, waiting.length - 1))
            if (requeued) entries = requeued
          }
        } else if (action.action === 'finish') {
          const target = entries.find((entry) => entry.userId === action.userId)
          if (!target) throw queueError(400, 'ENTRY_NOT_FOUND', '队列中没有指定学生')
          if (target.status !== 'finished') {
            const finishedAt = new Date().toISOString()
            entries = entries.map((entry) =>
              entry.userId === action.userId
                ? { ...entry, status: 'finished' as const, finishedAt, missedAt: null }
                : entry,
            )
          }
        } else {
          const movable = new Set(
            [...selected].filter((userId) => {
              const entry = entries.find((item) => item.userId === userId)
              return entry !== undefined && entry.status !== 'finished'
            }),
          )
          entries = movable.size > 0 ? moveEntries(entries, movable, action.direction) : entries
        }

        await saveQueueOrder(entries)
      })

      emitCheckoffQueueUpdate(session.classId, session.id)
      return reply.send({ session })
    },
  )

  fastify.post(
    '/:id/close',
    { onRequest: [fastify.authenticate, requireTARole] },
    async (request, reply) => {
      const params = z.object({ id: z.string().min(1) }).safeParse(request.params)
      if (!params.success) {
        return reply.code(400).send({ error: 'INVALID_BODY', message: '请求参数不正确' })
      }

      const existing = await getQueueSession(params.data.id, { fresh: true })
      if (!existing) {
        return reply.code(404).send({ error: 'SESSION_NOT_FOUND', message: '排队不存在' })
      }
      const classIds = await myClassIds(request)
      if (!classIds.includes(existing.classId)) {
        return reply.code(403).send({ error: 'FORBIDDEN', message: '无权操作该班级' })
      }

      const session = await closeQueueSession(params.data.id)
      emitCheckoffQueueUpdate(session.classId, session.id)
      return reply.send({ session })
    },
  )
}
