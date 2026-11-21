import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'

import { myClassIds, requireStaffRole, requireTARole } from '../lib/class-access.js'
import {
  orderQueueEntries,
  parseSessionSettings,
  parseSessionStats,
} from '../lib/checkoff-queue.js'
import { prisma } from '../lib/prisma.js'
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

function toSessionDto(row: {
  id: string
  classId: string
  settings: string
  stats: string
  createdAt: Date
}) {
  const stats = parseSessionStats(row.stats)
  return {
    id: row.id,
    classId: row.classId,
    settings: parseSessionSettings(row.settings),
    stats,
    closedAt: stats.closedAt,
    createdAt: row.createdAt.toISOString(),
  }
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
  entries: ReturnType<typeof parseSessionStats>['entries'],
  selected: Set<string>,
  direction: 'up' | 'down' | 'top',
) {
  if (direction === 'top') {
    const picked = entries.filter((entry) => selected.has(entry.userId))
    const rest = entries.filter((entry) => !selected.has(entry.userId))
    return [...picked, ...rest]
  }
  const next = [...entries]
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
  return next
}

function reorderEntries(
  entries: ReturnType<typeof parseSessionStats>['entries'],
  userId: string,
  toIndex: number,
) {
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

      const rows = await prisma.checkoffSession.findMany({
        where: { classId: parsed.data.classId },
        orderBy: { createdAt: 'desc' },
        take: 20,
      })

      return reply.send({ sessions: rows.map(toSessionDto) })
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
        return reply.code(403).send({ error: 'FORBIDDEN', message: '无权访问该班级' })
      }

      const normalized = await normalizeSettings(parsed.data.classId, parsed.data.settings)
      if (!normalized.ok) {
        return reply.code(400).send({ error: 'INVALID_SETTINGS', message: normalized.message })
      }

      const session = await prisma.checkoffSession.create({
        data: {
          classId: parsed.data.classId,
          settings: JSON.stringify(normalized.settings),
          stats: JSON.stringify({ entries: [] }),
        },
      })

      emitCheckoffQueueUpdate(parsed.data.classId, session.id)

      return reply.code(201).send({ session: toSessionDto(session) })
    },
  )

  fastify.patch(
    '/:id/settings',
    { onRequest: [fastify.authenticate, requireStaffRole] },
    async (request, reply) => {
      const params = z.object({ id: z.string().min(1) }).safeParse(request.params)
      if (!params.success) {
        return reply.code(400).send({ error: 'INVALID_BODY', message: '请求参数不正确' })
      }

      const parsed = updateSessionSettingsSchema.safeParse(request.body)
      if (!parsed.success) {
        return reply.code(400).send({ error: 'INVALID_BODY', message: '请求参数不正确' })
      }

      const session = await prisma.checkoffSession.findUnique({ where: { id: params.data.id } })
      if (!session) {
        return reply.code(404).send({ error: 'SESSION_NOT_FOUND', message: '排队不存在' })
      }

      const classIds = await myClassIds(request)
      if (!classIds.includes(session.classId)) {
        return reply.code(403).send({ error: 'FORBIDDEN', message: '无权操作该班级' })
      }
      if (parseSessionStats(session.stats).closedAt) {
        return reply.code(409).send({ error: 'SESSION_CLOSED', message: '排队已结束' })
      }

      const existingSettings = parseSessionSettings(session.settings)
      const normalized = await normalizeSettings(session.classId, {
        ...parsed.data.settings,
        startAt:
          parsed.data.settings.startAt === undefined
            ? existingSettings.startAt
            : parsed.data.settings.startAt,
      })
      if (!normalized.ok) {
        return reply.code(400).send({ error: 'INVALID_SETTINGS', message: normalized.message })
      }

      const updated = await prisma.checkoffSession.update({
        where: { id: session.id },
        data: { settings: JSON.stringify(normalized.settings) },
      })

      emitCheckoffQueueUpdate(session.classId, updated.id)

      return reply.send({ session: toSessionDto(updated) })
    },
  )

  fastify.patch(
    '/:id/queue',
    { onRequest: [fastify.authenticate, requireStaffRole] },
    async (request, reply) => {
      const params = z.object({ id: z.string().min(1) }).safeParse(request.params)
      if (!params.success) {
        return reply.code(400).send({ error: 'INVALID_BODY', message: '请求参数不正确' })
      }

      const parsed = queueActionSchema.safeParse(request.body)
      if (!parsed.success) {
        return reply.code(400).send({ error: 'INVALID_BODY', message: '请求参数不正确' })
      }

      const session = await prisma.checkoffSession.findUnique({ where: { id: params.data.id } })
      if (!session) {
        return reply.code(404).send({ error: 'SESSION_NOT_FOUND', message: '排队不存在' })
      }

      const classIds = await myClassIds(request)
      if (!classIds.includes(session.classId)) {
        return reply.code(403).send({ error: 'FORBIDDEN', message: '无权操作该班级' })
      }

      const action = parsed.data
      const stats = parseSessionStats(session.stats)
      if (stats.closedAt) {
        return reply.code(409).send({ error: 'SESSION_CLOSED', message: '排队已结束' })
      }
      const selected = new Set(
        action.action === 'reorder' ||
          action.action === 'requeue' ||
          action.action === 'finish'
          ? [action.userId]
          : action.userIds,
      )
      const matched = stats.entries.filter((entry) => selected.has(entry.userId))
      if (matched.length === 0) {
        return reply.code(400).send({ error: 'ENTRY_NOT_FOUND', message: '队列中没有指定学生' })
      }

      let notifiedByName: string | null = null
      if (action.action === 'precall' && action.called) {
        const { sub } = request.user as { sub: string }
        const me = await prisma.user.findUnique({ where: { id: sub }, select: { name: true } })
        notifiedByName = me?.name ?? null
      }

      let entries = stats.entries
      if (action.action === 'remove') {
        entries = entries.filter((entry) => !selected.has(entry.userId))
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
            }
          }
          if (entry.status !== 'notified') return entry
          return {
            ...entry,
            status: 'waiting' as const,
            notifiedAt: null,
            notifiedBy: null,
          }
        })
      } else if (action.action === 'reorder') {
        const target = entries.find((entry) => entry.userId === action.userId)
        if (target?.status === 'finished') {
          return reply.code(403).send({ error: 'FINISHED', message: '已完成验收，无法调整顺序' })
        }
        const reordered = reorderEntries(entries, action.userId, action.toIndex)
        if (!reordered) {
          return reply.code(400).send({ error: 'ENTRY_NOT_FOUND', message: '队列中没有指定学生' })
        }
        entries = reordered
      } else if (action.action === 'requeue') {
        const target = entries.find((entry) => entry.userId === action.userId)
        if (!target) {
          return reply.code(400).send({ error: 'ENTRY_NOT_FOUND', message: '队列中没有指定学生' })
        }
        if (target.status === 'finished') {
          return reply.code(403).send({ error: 'FINISHED', message: '已完成验收，无法推回队列' })
        }
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
              }
            : entry,
        )
      } else if (action.action === 'finish') {
        const target = entries.find((entry) => entry.userId === action.userId)
        if (!target) {
          return reply.code(400).send({ error: 'ENTRY_NOT_FOUND', message: '队列中没有指定学生' })
        }
        if (target.status !== 'finished') {
          const finishedAt = new Date().toISOString()
          entries = entries.map((entry) =>
            entry.userId === action.userId
              ? { ...entry, status: 'finished' as const, finishedAt }
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

      entries = orderQueueEntries(entries)

      const updated = await prisma.checkoffSession.update({
        where: { id: session.id },
        data: { stats: JSON.stringify({ ...stats, entries }) },
      })

      emitCheckoffQueueUpdate(session.classId, updated.id)

      return reply.send({ session: toSessionDto(updated) })
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

      const session = await prisma.checkoffSession.findUnique({ where: { id: params.data.id } })
      if (!session) {
        return reply.code(404).send({ error: 'SESSION_NOT_FOUND', message: '排队不存在' })
      }

      const classIds = await myClassIds(request)
      if (!classIds.includes(session.classId)) {
        return reply.code(403).send({ error: 'FORBIDDEN', message: '无权操作该班级' })
      }

      const stats = parseSessionStats(session.stats)
      if (stats.closedAt) {
        return reply.send({ session: toSessionDto(session) })
      }

      const updated = await prisma.checkoffSession.update({
        where: { id: session.id },
        data: { stats: JSON.stringify({ ...stats, closedAt: new Date().toISOString() }) },
      })

      emitCheckoffQueueUpdate(session.classId, updated.id)

      return reply.send({ session: toSessionDto(updated) })
    },
  )
}
