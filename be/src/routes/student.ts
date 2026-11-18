import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'

import { requireStudent } from '../lib/class-access.js'
import {
  isStudentInScope,
  parseSessionSettings,
  parseSessionStats,
} from '../lib/checkoff-queue.js'
import { prisma } from '../lib/prisma.js'
import { emitCheckoffQueueUpdate } from '../lib/realtime.js'
import { buildStudentReport } from '../lib/student-report.js'
import { parseClassSettings, resolveScoreRatio, weightedTotal } from '../lib/xzzd-push.js'

const joinQueueSchema = z.object({
  experimentId: z.string().trim().min(1),
  taId: z.string().trim().min(1).nullable().optional(),
})

const reorderQueueSchema = z.object({
  toIndex: z.number().int().min(0),
})

/** 学生控制台：仅返回当前学生本人、当前班级的数据 */
export const studentRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get('/overview', { onRequest: [fastify.authenticate] }, async (request, reply) => {
    if (!requireStudent(request, reply)) return reply

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
    { onRequest: [fastify.authenticate] },
    async (request, reply) => {
      if (!requireStudent(request, reply)) return reply

      const { sub } = request.user as { sub: string }
      const { id } = request.params as { id: string }
      const report = await buildStudentReport(sub, id)
      if (!report) {
        return reply.code(404).send({ error: 'NOT_FOUND', message: '实验不存在' })
      }
      return reply.send(report)
    },
  )

  fastify.get('/checkoff-queue', { onRequest: [fastify.authenticate] }, async (request, reply) => {
    if (!requireStudent(request, reply)) return reply

    const { sub } = request.user as { sub: string }
    const user = await prisma.user.findUnique({
      where: { id: sub },
      select: { id: true, classId: true, status: true },
    })
    if (!user || user.status !== 'ACTIVE') {
      return reply.code(401).send({ error: 'UNAUTHORIZED', message: '用户不存在' })
    }
    if (!user.classId) {
      return reply.send({ session: null, eligible: false, reason: 'NO_CLASS' })
    }

    const row = await prisma.checkoffSession.findFirst({
      where: { classId: user.classId },
      orderBy: { createdAt: 'desc' },
    })
    if (!row) {
      return reply.send({ session: null, eligible: false, reason: 'NO_SESSION' })
    }

    const settings = parseSessionSettings(row.settings)
    const stats = parseSessionStats(row.stats)
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
    const position = entry
      ? stats.entries.findIndex((item) => item.userId === user.id) + 1
      : null

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
      const experiment = experimentById.get(item.experimentId)
      const ta = item.taId ? taById.get(item.taId) : undefined
      return {
        userId: item.userId,
        name: student?.name ?? '同学',
        studentId: student?.studentId ?? '',
        experimentId: item.experimentId,
        experimentMark: experiment?.mark ?? '',
        experimentTitle: experiment?.title ?? '',
        status: item.status,
        taName: ta?.name ?? null,
        calledByName: item.calledBy ?? null,
        calledAt: item.calledAt ?? null,
        joinedAt: item.joinedAt,
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
        entry: entry ? { ...entry, position } : null,
        queue,
      },
      eligible: started && inScope,
      reason: !started ? 'NOT_STARTED' : !inScope ? 'NOT_IN_SCOPE' : null,
    })
  })

  fastify.post('/checkoff-queue', { onRequest: [fastify.authenticate] }, async (request, reply) => {
    if (!requireStudent(request, reply)) return reply

    const parsed = joinQueueSchema.safeParse(request.body)
    if (!parsed.success) {
      return reply.code(400).send({ error: 'INVALID_BODY', message: '请求参数不正确' })
    }

    const { sub } = request.user as { sub: string }
    const user = await prisma.user.findUnique({
      where: { id: sub },
      select: { id: true, classId: true, status: true },
    })
    if (!user || user.status !== 'ACTIVE') {
      return reply.code(401).send({ error: 'UNAUTHORIZED', message: '用户不存在' })
    }
    if (!user.classId) {
      return reply.code(400).send({ error: 'NO_CLASS', message: '当前账号未绑定班级' })
    }

    const session = await prisma.checkoffSession.findFirst({
      where: { classId: user.classId },
      orderBy: { createdAt: 'desc' },
    })
    if (!session) {
      return reply.code(404).send({ error: 'SESSION_NOT_FOUND', message: '当前没有进行中的排队' })
    }

    const settings = parseSessionSettings(session.settings)
    const startTime = Date.parse(settings.startAt)
    const started = Number.isNaN(startTime) ? true : startTime <= Date.now()
    if (!started) {
      return reply.code(400).send({ error: 'NOT_STARTED', message: '排队尚未开始' })
    }
    if (!isStudentInScope(settings, user.id)) {
      return reply.code(403).send({ error: 'NOT_IN_SCOPE', message: '你不在本场验收范围内' })
    }
    if (!settings.acceptedExperimentIds.includes(parsed.data.experimentId)) {
      return reply.code(400).send({ error: 'INVALID_EXPERIMENT', message: '该实验不接受验收' })
    }

    let taId: string | null = null
    if (settings.allowStudentChooseTa && parsed.data.taId) {
      if (!settings.taIds.includes(parsed.data.taId)) {
        return reply.code(400).send({ error: 'INVALID_TA', message: '该助教不参与本场验收' })
      }
      taId = parsed.data.taId
    }

    const result = await prisma.$transaction(async (tx) => {
      const row = await tx.checkoffSession.findUnique({ where: { id: session.id } })
      if (!row) {
        return {
          ok: false as const,
          status: 404,
          error: 'SESSION_NOT_FOUND',
          message: '当前没有进行中的排队',
        }
      }
      const stats = parseSessionStats(row.stats)
      if (stats.entries.some((item) => item.userId === user.id)) {
        return {
          ok: false as const,
          status: 409,
          error: 'ALREADY_JOINED',
          message: '你已在队列中',
        }
      }
      const entry = {
        userId: user.id,
        experimentId: parsed.data.experimentId,
        taId,
        status: 'waiting' as const,
        joinedAt: new Date().toISOString(),
      }
      const entries = [...stats.entries, entry]
      await tx.checkoffSession.update({
        where: { id: row.id },
        data: { stats: JSON.stringify({ ...stats, entries }) },
      })
      return { ok: true as const, entry, position: entries.length }
    })

    if (!result.ok) {
      return reply.code(result.status).send({ error: result.error, message: result.message })
    }

    emitCheckoffQueueUpdate(session.classId, session.id)

    return reply.send({ ok: true, entry: result.entry, position: result.position })
  })

  fastify.patch('/checkoff-queue', { onRequest: [fastify.authenticate] }, async (request, reply) => {
    if (!requireStudent(request, reply)) return reply

    const parsed = reorderQueueSchema.safeParse(request.body)
    if (!parsed.success) {
      return reply.code(400).send({ error: 'INVALID_BODY', message: '请求参数不正确' })
    }

    const { sub } = request.user as { sub: string }
    const user = await prisma.user.findUnique({
      where: { id: sub },
      select: { id: true, classId: true, status: true },
    })
    if (!user || user.status !== 'ACTIVE') {
      return reply.code(401).send({ error: 'UNAUTHORIZED', message: '用户不存在' })
    }
    if (!user.classId) {
      return reply.code(400).send({ error: 'NO_CLASS', message: '当前账号未绑定班级' })
    }

    const session = await prisma.checkoffSession.findFirst({
      where: { classId: user.classId },
      orderBy: { createdAt: 'desc' },
    })
    if (!session) {
      return reply.code(404).send({ error: 'SESSION_NOT_FOUND', message: '当前没有进行中的排队' })
    }

    const settings = parseSessionSettings(session.settings)
    if (!settings.allowSelfMoveDown) {
      return reply.code(403).send({ error: 'FORBIDDEN', message: '本场不允许自行调整顺序' })
    }

    const stats = parseSessionStats(session.stats)
    const current = stats.entries.find((entry) => entry.status === 'called') ?? null
    if (current?.userId === user.id) {
      return reply.code(403).send({ error: 'IN_PROGRESS', message: '正在验收，无法调整顺序' })
    }
    const waiting = current
      ? stats.entries.filter((entry) => entry !== current)
      : [...stats.entries]
    const fromIndex = waiting.findIndex((entry) => entry.userId === user.id)
    if (fromIndex < 0) {
      return reply.code(404).send({ error: 'ENTRY_NOT_FOUND', message: '你不在队列中' })
    }
    if (parsed.data.toIndex <= fromIndex) {
      return reply.code(400).send({ error: 'ONLY_BACKWARD', message: '只能向后调整顺序' })
    }

    const next = [...waiting]
    const [item] = next.splice(fromIndex, 1)
    const target = Math.max(0, Math.min(parsed.data.toIndex, next.length))
    next.splice(target, 0, item)
    const entries = current ? [current, ...next] : next

    await prisma.checkoffSession.update({
      where: { id: session.id },
      data: { stats: JSON.stringify({ ...stats, entries }) },
    })

    emitCheckoffQueueUpdate(session.classId, session.id)

    return reply.send({ ok: true })
  })
}
