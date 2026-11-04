import type { FastifyPluginAsync } from 'fastify'

import { broadcastCheckoffQueue } from '../lib/checkoff-queue.js'
import { requireStudent } from '../lib/class-access.js'
import { prisma } from '../lib/prisma.js'
import { buildStudentReport } from '../lib/student-report.js'
import { parseClassSettings, resolveScoreRatio, weightedTotal } from '../lib/xzzd-push.js'

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

  /** 排队验收：当前开放验收的实验 + 本人在各实验的排队状态 */
  fastify.get('/checkoff-queue', { onRequest: [fastify.authenticate] }, async (request, reply) => {
    if (!requireStudent(request, reply)) return reply

    const { sub } = request.user as { sub: string }
    const user = await prisma.user.findUnique({
      where: { id: sub },
      select: { classId: true, status: true },
    })
    if (!user || user.status !== 'ACTIVE') {
      return reply.code(401).send({ error: 'UNAUTHORIZED', message: '用户不存在' })
    }

    const serverTime = new Date().toISOString()
    if (!user.classId) {
      return reply.send({ serverTime, experiments: [] })
    }

    const now = new Date()
    // 只返回「当前开放验收」的实验：已发布（publishTime 为空视为已发布）且验收未截止
    const experiments = await prisma.experiment.findMany({
      where: {
        classId: user.classId,
        AND: [
          { OR: [{ publishTime: null }, { publishTime: { lte: now } }] },
          { OR: [{ checkoffDeadline: null }, { checkoffDeadline: { gt: now } }] },
        ],
      },
      orderBy: { mark: 'asc' },
      select: { id: true, mark: true, title: true, publishTime: true, checkoffDeadline: true },
    })

    const ids = experiments.map((experiment) => experiment.id)
    const [scores, queueEntries] = await Promise.all([
      prisma.score.findMany({
        where: { userId: sub, indId: { in: ids }, type: { in: [0, 1] } },
        select: { indId: true },
      }),
      prisma.checkoffQueueEntry.findMany({
        where: { classId: user.classId, experimentId: { in: ids } },
        orderBy: { joinedAt: 'asc' },
      }),
    ])
    const checkedOffIds = new Set(scores.map((row) => row.indId))
    // 一次查出全部条目后按实验分组，位次由组内加入顺序决定
    const entriesByExperiment = new Map<string, typeof queueEntries>()
    for (const entry of queueEntries) {
      const list = entriesByExperiment.get(entry.experimentId) ?? []
      list.push(entry)
      entriesByExperiment.set(entry.experimentId, list)
    }

    return reply.send({
      serverTime,
      experiments: experiments.map((experiment) => {
        const entries = entriesByExperiment.get(experiment.id) ?? []
        const index = entries.findIndex((entry) => entry.userId === sub)
        const mine = index >= 0 ? entries[index] : null
        return {
          id: experiment.id,
          mark: experiment.mark,
          title: experiment.title,
          publishTime: experiment.publishTime?.toISOString() ?? null,
          checkoffDeadline: experiment.checkoffDeadline?.toISOString() ?? null,
          queueLength: entries.length,
          checkedOff: checkedOffIds.has(experiment.id),
          myEntry: mine
            ? {
                id: mine.id,
                joinedAt: mine.joinedAt.toISOString(),
                position: index + 1,
                ahead: index,
              }
            : null,
        }
      }),
    })
  })

  /** 加入排队（幂等：已排队时不改变加入时间） */
  fastify.post('/checkoff-queue', { onRequest: [fastify.authenticate] }, async (request, reply) => {
    if (!requireStudent(request, reply)) return reply

    const { sub } = request.user as { sub: string }
    const body = request.body as { experimentId?: unknown } | undefined
    const experimentId =
      body && typeof body.experimentId === 'string' ? body.experimentId.trim() : ''
    if (!experimentId) {
      return reply.code(400).send({ error: 'INVALID_BODY', message: '请求参数不正确' })
    }

    const user = await prisma.user.findUnique({
      where: { id: sub },
      select: { classId: true, status: true },
    })
    if (!user || user.status !== 'ACTIVE') {
      return reply.code(401).send({ error: 'UNAUTHORIZED', message: '用户不存在' })
    }
    if (!user.classId) {
      return reply.code(400).send({ error: 'CLASS_REQUIRED', message: '当前账号未绑定班级' })
    }
    const classId = user.classId

    const experiment = await prisma.experiment.findUnique({
      where: { id: experimentId },
      select: { id: true, classId: true, publishTime: true, checkoffDeadline: true },
    })
    // 非本班实验与不存在同样处理，避免暴露其它班级的实验
    if (!experiment || experiment.classId !== classId) {
      return reply.code(404).send({ error: 'EXPERIMENT_NOT_FOUND', message: '实验不存在' })
    }

    const now = new Date()
    if (experiment.publishTime && experiment.publishTime.getTime() > now.getTime()) {
      return reply.code(400).send({ error: 'NOT_OPEN', message: '该实验尚未开放验收' })
    }
    if (experiment.checkoffDeadline && experiment.checkoffDeadline.getTime() <= now.getTime()) {
      return reply.code(400).send({ error: 'CLOSED', message: '该实验验收已截止' })
    }

    await prisma.checkoffQueueEntry.upsert({
      where: { experimentId_userId: { experimentId, userId: sub } },
      // 已存在时保持原 joinedAt（不刷新排队位次）
      update: {},
      create: { classId, experimentId, userId: sub },
    })

    await broadcastCheckoffQueue(classId)
    return reply.send({ ok: true })
  })

  /** 取消排队（只删除本人记录） */
  fastify.delete(
    '/checkoff-queue/:experimentId',
    { onRequest: [fastify.authenticate] },
    async (request, reply) => {
      if (!requireStudent(request, reply)) return reply

      const { sub } = request.user as { sub: string }
      const { experimentId } = request.params as { experimentId: string }

      const { count } = await prisma.checkoffQueueEntry.deleteMany({
        where: { experimentId, userId: sub },
      })
      if (count > 0) {
        const user = await prisma.user.findUnique({ where: { id: sub }, select: { classId: true } })
        if (user?.classId) await broadcastCheckoffQueue(user.classId)
      }
      return reply.send({ ok: true })
    },
  )
}
