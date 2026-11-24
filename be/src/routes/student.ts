import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'

import { requireStudentRole } from '../lib/class-access.js'
import {
  assertQueueOpen,
  getLatestQueueSession,
  isStudentInScope,
  orderQueueEntries,
  parseSessionSettings,
  queueError,
  saveQueueOrder,
  toQueueEntryDto,
  toStoredQueueEntry,
  withLatestQueueMutation,
  type StoredQueueEntry,
} from '../lib/checkoff-queue.js'
import { prisma } from '../lib/prisma.js'
import {
  emitCheckoffNotifiedCanceled,
  emitCheckoffQueueUpdate,
} from '../lib/realtime.js'
import { buildStudentReport } from '../lib/student-report.js'
import { parseClassSettings, resolveScoreRatio, weightedTotal } from '../lib/xzzd-push.js'

const joinQueueSchema = z.object({
  experimentId: z.string().trim().min(1),
  taId: z.string().trim().min(1).nullable().optional(),
})

const patchQueueSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('reorder'),
    toIndex: z.number().int().min(0),
  }),
  z.object({
    action: z.literal('update'),
    experimentId: z.string().trim().min(1),
    taId: z.string().trim().min(1).nullable().optional(),
  }),
])

function reorderWaiting(entries: StoredQueueEntry[], userId: string, toIndex: number) {
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
  next.splice(Math.max(0, Math.min(toIndex, next.length)), 0, item)
  return {
    fromIndex,
    entries: orderQueueEntries([...finished, ...current, ...next]),
  }
}

/** 学生控制台：仅返回当前学生本人、当前班级的数据 */
export const studentRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get('/overview', { onRequest: [fastify.authenticate, requireStudentRole] }, async (request, reply) => {
    const { sub } = request.user as { sub: string }
    const user = await prisma.user.findUnique({
      where: { id: sub },
      include: { klass: true },
    })
    if (!user || user.status !== 'ACTIVE') {
      return reply.code(401).send({ error: 'UNAUTHORIZED', message: '用户不存在' })
    }

    if (!user.classId) {
      return reply.send({
        class: null,
        student: { name: user.name, studentId: user.studentId ?? '' },
        experiments: [],
      })
    }

    const experiments = await prisma.experiment.findMany({
      where: { classId: user.classId },
      orderBy: { mark: 'asc' },
      select: {
        id: true,
        mark: true,
        title: true,
        publishTime: true,
        checkoffDeadline: true,
        reportDeadline: true,
      },
    })
    const ids = experiments.map((experiment) => experiment.id)

    const [scores, reviews, remarks] = await Promise.all([
      prisma.score.findMany({
        where: { userId: sub, indId: { in: ids }, type: { in: [0, 1, 2] } },
        select: { indId: true, type: true, score: true },
        orderBy: { type: 'asc' },
      }),
      prisma.reportReview.findMany({
        where: { userId: sub, experimentId: { in: ids } },
        select: { experimentId: true },
      }),
      prisma.remark.findMany({
        where: { userId: sub, experimentId: { in: ids }, text: { not: '' } },
        select: { experimentId: true },
      }),
    ])

    const settings = parseClassSettings(user.klass?.settings ?? null)

    return reply.send({
      class: user.klass
        ? { id: user.klass.id, name: user.klass.name, type: user.klass.type }
        : null,
      student: { name: user.name, studentId: user.studentId ?? '' },
      experiments: experiments.map((experiment) => {
        const rows = scores.filter((row) => row.indId === experiment.id)
        const byType = new Map(rows.map((row) => [row.type, row.score]))
        const ratio = resolveScoreRatio(settings, experiment.id)
        const total = weightedTotal(
          [0, 1, 2].map((type) => byType.get(type) ?? null),
          ratio,
        )
        return {
          ...experiment,
          ratio,
          total,
          scores: rows.map((row) => ({ type: row.type, score: row.score })),
          hasReport: reviews.some((review) => review.experimentId === experiment.id),
          remarkCount: remarks.filter((remark) => remark.experimentId === experiment.id).length,
        }
      }),
    })
  })

  fastify.get(
    '/experiments/:id',
    { onRequest: [fastify.authenticate, requireStudentRole] },
    async (request, reply) => {
      const { sub } = request.user as { sub: string }
      const { id } = request.params as { id: string }
      const report = await buildStudentReport(sub, id)
      if (!report) {
        return reply.code(404).send({ error: 'NOT_FOUND', message: '实验不存在' })
      }
      return reply.send(report)
    },
  )

  fastify.get('/checkoff-queue', { onRequest: [fastify.authenticate, requireStudentRole] }, async (request, reply) => {
    const { sub } = request.user as { sub: string }
    const user = await prisma.user.findUnique({
      where: { id: sub },
      select: { id: true, name: true, classId: true, status: true },
    })
    if (!user || user.status !== 'ACTIVE') {
      return reply.code(401).send({ error: 'UNAUTHORIZED', message: '用户不存在' })
    }
    if (!user.classId) {
      return reply.send({ session: null, eligible: false, reason: 'NO_CLASS' })
    }

    const row = await getLatestQueueSession(user.classId)
    if (!row || row.closedAt) {
      return reply.send({ session: null, eligible: false, reason: 'NO_SESSION' })
    }

    const settings = row.settings
    const stats = row.stats
    const startTime = Date.parse(settings.startAt)
    const started = Number.isNaN(startTime) ? true : startTime <= Date.now()
    const inScope = isStudentInScope(settings, user.id)

    const experiments = await prisma.experiment.findMany({
      where: { classId: user.classId, id: { in: settings.acceptedExperimentIds } },
      select: { id: true, mark: true, title: true },
    })
    const experimentById = new Map(experiments.map((item) => [item.id, item]))
    const experimentList = settings.acceptedExperimentIds
      .map((id) => experimentById.get(id))
      .filter((item): item is (typeof experiments)[number] => item !== undefined)

    const tas =
      settings.taIds.length > 0
        ? await prisma.user.findMany({
            where: { classId: user.classId, role: 'TA', id: { in: settings.taIds } },
            select: { id: true, name: true, studentId: true, avatar: true },
          })
        : []
    const taById = new Map(tas.map((item) => [item.id, item]))
    const taList = settings.taIds
      .map((id) => taById.get(id))
      .filter((item): item is (typeof tas)[number] => item !== undefined)
      .map((ta) => ({
        ...ta,
        preferenceExperimentIds: settings.taPreferences[ta.id] ?? [],
      }))

    const entry = stats.entries.find((item) => item.userId === user.id) ?? null
    const queueUserIds = [...new Set(stats.entries.map((item) => item.userId))]
    const queueStudents =
      queueUserIds.length > 0
        ? await prisma.user.findMany({
            where: { id: { in: queueUserIds } },
            select: { id: true, name: true, studentId: true },
          })
        : []
    const queueStudentById = new Map(queueStudents.map((item) => [item.id, item]))
    const queue = stats.entries.map((item) => {
      const student = queueStudentById.get(item.userId)
      const isSelf = item.userId === user.id
      const experiment = isSelf ? experimentById.get(item.experimentId) : undefined
      const ta = item.taId ? taById.get(item.taId) : undefined
      return {
        userId: item.userId,
        name: student?.name ?? '同学',
        studentId: student?.studentId ?? '',
        experimentId: isSelf ? item.experimentId : '',
        experimentMark: isSelf ? (experiment?.mark ?? '') : '',
        experimentTitle: isSelf ? (experiment?.title ?? '') : '',
        status: item.status,
        taName: ta?.name ?? null,
        notifiedAt: item.notifiedAt,
        notifiedBy: item.notifiedBy,
        startedAt: item.startedAt,
        checkedBy: item.checkedBy,
        finishedAt: item.finishedAt,
        joinedAt: item.joinedAt,
        missedAt: item.missedAt,
      }
    })

    return reply.send({
      session: {
        id: row.id,
        startAt: settings.startAt,
        started,
        allowStudentChooseTa: settings.allowStudentChooseTa,
        allowSelfMoveDown: settings.allowSelfMoveDown,
        jumpMode: settings.jumpMode,
        experiments: experimentList,
        tas: taList,
        entry,
        queue,
      },
      eligible: started && inScope,
      reason: !started ? 'NOT_STARTED' : !inScope ? 'NOT_IN_SCOPE' : null,
    })
  })

  fastify.post('/checkoff-queue', { onRequest: [fastify.authenticate, requireStudentRole] }, async (request, reply) => {
    const parsed = joinQueueSchema.safeParse(request.body)
    if (!parsed.success) {
      return reply.code(400).send({ error: 'INVALID_BODY', message: '请求参数不正确' })
    }

    const { sub } = request.user as { sub: string }
    const user = await prisma.user.findUnique({
      where: { id: sub },
      select: { id: true, name: true, classId: true, status: true },
    })
    if (!user || user.status !== 'ACTIVE') {
      return reply.code(401).send({ error: 'UNAUTHORIZED', message: '用户不存在' })
    }
    if (!user.classId) {
      return reply.code(400).send({ error: 'NO_CLASS', message: '当前账号未绑定班级' })
    }

    const { value: entry, session } = await withLatestQueueMutation(user.classId, async ({ tx, session, entries }) => {
      assertQueueOpen(session)
      const settings = parseSessionSettings(session.settings)
      const startTime = Date.parse(settings.startAt)
      if (!Number.isNaN(startTime) && startTime > Date.now()) {
        throw queueError(400, 'NOT_STARTED', '排队尚未开始')
      }
      if (!isStudentInScope(settings, user.id)) {
        throw queueError(403, 'NOT_IN_SCOPE', '你不在本场验收范围内')
      }
      if (!settings.acceptedExperimentIds.includes(parsed.data.experimentId)) {
        throw queueError(400, 'INVALID_EXPERIMENT', '该实验不接受验收')
      }

      let taId: string | null = null
      if (settings.allowStudentChooseTa && parsed.data.taId) {
        if (!settings.taIds.includes(parsed.data.taId)) {
          throw queueError(400, 'INVALID_TA', '该助教不参与本场验收')
        }
        taId = parsed.data.taId
      }
      if (entries.some((item) => item.userId === user.id)) {
        throw queueError(409, 'ALREADY_JOINED', '你已在队列中')
      }

      const position = entries.reduce((max, item) => Math.max(max, item.position + 1), 0)
      const created = await tx.checkoffQueueEntry.create({
        data: {
          sessionId: session.id,
          userId: user.id,
          experimentId: parsed.data.experimentId,
          taId,
          position,
          status: 'waiting',
        },
      })
      await saveQueueOrder(tx, [...entries, toStoredQueueEntry(created)])
      return toQueueEntryDto(created)
    })

    emitCheckoffQueueUpdate(user.classId, session.id)
    return reply.send({ ok: true, entry })
  })

  fastify.patch('/checkoff-queue', { onRequest: [fastify.authenticate, requireStudentRole] }, async (request, reply) => {
    const parsed = patchQueueSchema.safeParse(request.body)
    if (!parsed.success) {
      return reply.code(400).send({ error: 'INVALID_BODY', message: '请求参数不正确' })
    }
    const action = parsed.data
    const { sub } = request.user as { sub: string }
    const user = await prisma.user.findUnique({
      where: { id: sub },
      select: { id: true, name: true, classId: true, status: true },
    })
    if (!user || user.status !== 'ACTIVE') {
      return reply.code(401).send({ error: 'UNAUTHORIZED', message: '用户不存在' })
    }
    if (!user.classId) {
      return reply.code(400).send({ error: 'NO_CLASS', message: '当前账号未绑定班级' })
    }

    const { value: canceledEntry, session } = await withLatestQueueMutation(user.classId, async ({ tx, session, entries }) => {
      assertQueueOpen(session)
      const settings = parseSessionSettings(session.settings)
      const target = entries.find((entry) => entry.userId === user.id)
      if (!target) throw queueError(404, 'ENTRY_NOT_FOUND', '你不在队列中')
      if (target.status === 'finished') {
        throw queueError(403, 'FINISHED', '已完成验收，无法修改排队信息')
      }
      if (target.status === 'called') {
        throw queueError(403, 'IN_PROGRESS', '正在验收，无法修改排队信息')
      }

      if (action.action === 'update') {
        if (!settings.acceptedExperimentIds.includes(action.experimentId)) {
          throw queueError(400, 'INVALID_EXPERIMENT', '该实验不接受验收')
        }
        let taId: string | null = null
        if (settings.allowStudentChooseTa && action.taId) {
          if (!settings.taIds.includes(action.taId)) {
            throw queueError(400, 'INVALID_TA', '该助教不参与本场验收')
          }
          taId = action.taId
        }
        await saveQueueOrder(
          tx,
          entries.map((entry) =>
            entry.userId === user.id ? { ...entry, experimentId: action.experimentId, taId } : entry,
          ),
        )
        return null
      }

      const reordered = reorderWaiting(entries, user.id, action.toIndex)
      if (!reordered) throw queueError(404, 'ENTRY_NOT_FOUND', '你不在队列中')
      const movingDown = action.toIndex > reordered.fromIndex
      const movingUp = action.toIndex < reordered.fromIndex
      if (movingDown && !settings.allowSelfMoveDown) {
        throw queueError(403, 'FORBIDDEN', '本场不允许自行调整顺序')
      }
      if (movingUp) {
        if (!target.missedAt || settings.jumpMode === 'none') {
          throw queueError(403, 'JUMP_FORBIDDEN', '仅过号学生可按本场规则向前插队')
        }
        if (settings.jumpMode === 'after3' && action.toIndex < 2) {
          throw queueError(403, 'JUMP_AFTER_3', '过号后只能插到第 3 位及以后')
        }
      }

      await saveQueueOrder(
        tx,
        reordered.entries.map((entry) => {
          if (entry.userId !== user.id) return entry
          return {
            ...entry,
            status: movingDown && entry.status === 'notified' ? ('waiting' as const) : entry.status,
            notifiedAt: movingDown ? null : entry.notifiedAt,
            notifiedBy: movingDown ? null : entry.notifiedBy,
            missedAt: movingUp ? null : entry.missedAt,
          }
        }),
      )
      return target.status === 'notified' && movingDown ? target : null
    })

    emitCheckoffQueueUpdate(user.classId, session.id)
    if (canceledEntry) {
      emitCheckoffNotifiedCanceled(user.classId, session.id, user.id, user.name)
    }
    return reply.send({ ok: true })
  })

  fastify.delete('/checkoff-queue', { onRequest: [fastify.authenticate, requireStudentRole] }, async (request, reply) => {
    const { sub } = request.user as { sub: string }
    const user = await prisma.user.findUnique({
      where: { id: sub },
      select: { id: true, name: true, classId: true, status: true },
    })
    if (!user || user.status !== 'ACTIVE') {
      return reply.code(401).send({ error: 'UNAUTHORIZED', message: '用户不存在' })
    }
    if (!user.classId) {
      return reply.code(400).send({ error: 'NO_CLASS', message: '当前账号未绑定班级' })
    }

    const { value: removed, session } = await withLatestQueueMutation(user.classId, async ({ tx, session, entries }) => {
      assertQueueOpen(session)
      const removed = entries.find((entry) => entry.userId === user.id)
      if (!removed) throw queueError(404, 'ENTRY_NOT_FOUND', '你不在队列中')
      if (removed.status === 'finished') {
        throw queueError(403, 'FINISHED', '已完成验收，无法退出排队')
      }
      if (removed.status === 'called') {
        throw queueError(403, 'IN_PROGRESS', '正在验收，无法退出排队')
      }
      await tx.checkoffQueueEntry.delete({ where: { id: removed.id } })
      await saveQueueOrder(tx, entries.filter((entry) => entry.userId !== user.id))
      return removed
    })

    emitCheckoffQueueUpdate(user.classId, session.id)
    if (removed?.status === 'notified') {
      emitCheckoffNotifiedCanceled(user.classId, session.id, user.id, user.name)
    }
    return reply.send({ ok: true })
  })
}
