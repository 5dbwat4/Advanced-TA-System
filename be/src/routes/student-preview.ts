import type { FastifyPluginAsync } from 'fastify'

import { prisma } from '../lib/prisma'
import type { StudentViewPayload } from '../lib/student-view'
import { parseClassSettings, resolveScoreRatio, weightedTotal } from '../lib/xzzd-push'

/**
 * 学生成绩查看（公开页面数据源）：凭链接中的签名 token 查看
 * 指定学生在指定实验下的成绩；token 载荷仅包含学生 uuid 与实验 uuid。
 */
export const studentPreviewRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get('/view', async (request, reply) => {
    const { token } = request.query as { token?: string }
    if (!token) {
      return reply.code(400).send({ error: 'BAD_REQUEST', message: '缺少访问令牌' })
    }

    let payload: Partial<StudentViewPayload>
    try {
      payload = fastify.jwt.verify<Partial<StudentViewPayload>>(token)
    } catch {
      return reply.code(401).send({ error: 'INVALID_TOKEN', message: '链接无效或已损坏' })
    }

    const { stuId, expId } = payload
    if (typeof stuId !== 'string' || typeof expId !== 'string') {
      return reply.code(401).send({ error: 'INVALID_TOKEN', message: '链接无效或已损坏' })
    }

    const [experiment, student] = await Promise.all([
      prisma.experiment.findUnique({
        where: { id: expId },
        include: {
          klass: { select: { id: true, name: true } },
          questionBank: { select: { name: true } },
        },
      }),
      prisma.student.findUnique({
        where: { stuId },
        select: { stuId: true, name: true, studentNo: true, classId: true },
      }),
    ])
    if (!experiment || !student || student.classId !== experiment.classId) {
      return reply.code(404).send({ error: 'NOT_FOUND', message: '链接无效或内容不存在' })
    }

    const [klass, scoreRows] = await Promise.all([
      prisma.class.findUnique({ where: { id: experiment.classId }, select: { settings: true } }),
      prisma.score.findMany({
        where: { stuId, indId: experiment.id, type: { in: [0, 1, 2] } },
        include: { grader: { select: { name: true } } },
        orderBy: { type: 'asc' },
      }),
    ])

    const settings = parseClassSettings(klass?.settings ?? null)
    const ratio = resolveScoreRatio(settings, experiment.id)
    const scoreByType = new Map(scoreRows.map((row) => [row.type, row]))
    const total = weightedTotal(
      [0, 1, 2].map((type) => scoreByType.get(type)?.score ?? null),
      ratio,
    )

    return {
      experiment: {
        id: experiment.id,
        mark: experiment.mark,
        title: experiment.title,
        className: experiment.klass?.name ?? null,
        questionBankName: experiment.questionBank?.name ?? null,
        publishTime: experiment.publishTime,
        checkoffDeadline: experiment.checkoffDeadline,
        reportDeadline: experiment.reportDeadline,
      },
      student: { name: student.name, studentNo: student.studentNo },
      ratio,
      total,
      scores: scoreRows.map((row) => ({
        type: row.type,
        score: row.score,
        graderName: row.grader?.name ?? null,
        updatedAt: row.updatedAt,
      })),
    }
  })
}
