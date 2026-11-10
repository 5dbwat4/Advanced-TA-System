import type { FastifyPluginAsync } from 'fastify'

import {
  countQueuePendingNotified,
  insertCheckoffQueueEntry,
  isTaCheckingAny,
  toCheckoffQueueState,
} from '../lib/checkoff-queue.js'
import { requireStudent } from '../lib/class-access.js'
import { prisma } from '../lib/prisma.js'
import { broadcastCheckoffQueue } from '../lib/realtime.js'
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

  /**
   * 排队验收：当前开放验收的实验 + 本人在各实验的排队状态。
   * 学生端只返回本人信息：不返回队列人数 / 位次 / 前面人数 / 其他人的任何信息。
   */
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
    const classId = user.classId

    const now = new Date()
    // 只返回「当前开放验收」的实验：已发布（publishTime 为空视为已发布）且验收未截止
    const experiments = await prisma.experiment.findMany({
      where: {
        classId,
        AND: [
          { OR: [{ publishTime: null }, { publishTime: { lte: now } }] },
          { OR: [{ checkoffDeadline: null }, { checkoffDeadline: { gt: now } }] },
        ],
      },
      orderBy: { mark: 'asc' },
      select: { id: true, mark: true, title: true, publishTime: true, checkoffDeadline: true },
    })

    const ids = experiments.map((experiment) => experiment.id)
    const [scores, myEntries] = await Promise.all([
      prisma.score.findMany({
        where: { userId: sub, indId: { in: ids }, type: { in: [0, 1] } },
        select: { indId: true },
      }),
      // 只查本人条目：学生端看不到别人的排队信息
      prisma.checkoffQueueEntry.findMany({
        where: { classId, userId: sub, experimentId: { in: ids } },
        select: {
          id: true,
          experimentId: true,
          state: true,
          joinedAt: true,
          notifiedBy: true,
          notifiedAt: true,
          checkingBy: true,
        },
      }),
    ])
    const checkedOffIds = new Set(scores.map((row) => row.indId))
    const entryByExperiment = new Map(myEntries.map((entry) => [entry.experimentId, entry]))

    // 叫号助教 / 正在验收的助教：一次批量查出姓名与头像
    const taIds = [
      ...new Set(
        myEntries
          .flatMap((entry) => [entry.notifiedBy, entry.checkingBy])
          .filter((id): id is string => typeof id === 'string' && id.length > 0),
      ),
    ]
    const tas =
      taIds.length > 0
        ? await prisma.user.findMany({
            where: { id: { in: taIds } },
            select: { id: true, name: true, avatar: true },
          })
        : []
    const taById = new Map(tas.map((ta) => [ta.id, ta]))

    const rows = await Promise.all(
      experiments.map(async (experiment) => {
        const mine = entryByExperiment.get(experiment.id) ?? null
        const notifier = mine?.notifiedBy ? taById.get(mine.notifiedBy) : undefined
        const checker = mine?.checkingBy ? taById.get(mine.checkingBy) : undefined
        // 提醒我准备验收的那位助教：是否正在验收同学、还有几位被该助教提醒但未验收的同学
        const taStatus = notifier
          ? {
              name: notifier.name,
              avatar: notifier.avatar,
              checking: await isTaCheckingAny(classId, notifier.id),
              pendingNotifiedCount: await countQueuePendingNotified({
                classId,
                taUserId: notifier.id,
                excludeUserId: sub,
              }),
            }
          : null
        return {
          id: experiment.id,
          mark: experiment.mark,
          title: experiment.title,
          publishTime: experiment.publishTime?.toISOString() ?? null,
          checkoffDeadline: experiment.checkoffDeadline?.toISOString() ?? null,
          checkedOff: checkedOffIds.has(experiment.id),
          myEntry: mine
            ? {
                id: mine.id,
                state: toCheckoffQueueState(mine.state),
                joinedAt: mine.joinedAt.toISOString(),
                notifiedAt: mine.notifiedAt?.toISOString() ?? null,
                notifiedBy: notifier ? { name: notifier.name, avatar: notifier.avatar } : null,
                checkingBy: checker ? { name: checker.name, avatar: checker.avatar } : null,
              }
            : null,
          taStatus,
        }
      }),
    )

    return reply.send({ serverTime, experiments: rows })
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

    // 加入队列：已存在时保持原记录（幂等，不刷新排队时间与位置），新加入追加到队尾
    await insertCheckoffQueueEntry({ classId, experimentId, userId: sub })

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
