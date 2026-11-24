import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'

import { requireStaffRole, requireViewerOrStaff } from '../lib/class-access.js'
import { prisma } from '../lib/prisma.js'
import { describeScoreChange, sendPushToUser } from '../lib/push.js'
import { emitReportScore, emitScoreChange } from '../lib/realtime.js'
import { toScoreDto } from '../lib/score.js'
import { resolveStudentExperiment } from '../lib/student-experiment-access.js'

const listQuerySchema = z.object({
  userId: z.string().trim().min(1),
  experimentId: z.string().trim().min(1),
})

const saveSchema = z.object({
  userId: z.string().trim().min(1),
  experimentId: z.string().trim().min(1),
  ruleId: z.string().regex(/^[0-9a-f]{48}$/),
  ruleContent: z.unknown(),
  score: z.number().min(-1000).max(1000).optional(),
})

function reviewDto(review: {
  userId: string
  experimentId: string
  ruleId: string
  ruleContent: string
  remarkById: string | null
  remarkBy: { name: string } | null
  updatedAt: Date
}) {
  return {
    userId: review.userId,
    experimentId: review.experimentId,
    ruleId: review.ruleId,
    ruleContent: parseJson(review.ruleContent),
    remarkById: review.remarkById,
    remarkByName: review.remarkBy?.name ?? null,
    updatedAt: review.updatedAt,
  }
}

export const reportReviewsRoutes: FastifyPluginAsync = async (fastify) => {
  /** 读取某学生某实验的报告批阅记录（观察者只读可见） */
  fastify.get('/', { onRequest: [fastify.authenticate, requireViewerOrStaff] }, async (request, reply) => {
    const parsed = listQuerySchema.safeParse(request.query)
    if (!parsed.success) {
      return reply.code(400).send({ error: 'INVALID_QUERY', message: '查询参数不正确' })
    }

    const { userId, experimentId } = parsed.data
    if (!(await resolveStudentExperiment(request, reply, userId, experimentId))) return reply

    const review = await prisma.reportReview.findUnique({
      where: { userId_experimentId: { userId, experimentId } },
      include: { remarkBy: { select: { name: true } } },
    })
    return reply.send({ review: review ? reviewDto(review) : null })
  })

  /** 保存报告批阅；携带 score 时，批阅和报告分在同一事务中更新 */
  fastify.put('/', { onRequest: [fastify.authenticate, requireStaffRole] }, async (request, reply) => {
    const parsed = saveSchema.safeParse(request.body)
    if (!parsed.success) {
      return reply.code(400).send({ error: 'INVALID_BODY', message: '请求参数不正确' })
    }

    const { userId, experimentId, ruleId, ruleContent, score } = parsed.data
    const { sub } = request.user as { sub: string }
    const access = await resolveStudentExperiment(request, reply, userId, experimentId)
    if (!access) return reply

    const content = JSON.stringify(ruleContent ?? null)
    const saved = await prisma.$transaction(async (tx) => {
      const review = await tx.reportReview.upsert({
        where: { userId_experimentId: { userId, experimentId } },
        update: { ruleId, ruleContent: content, remarkById: sub },
        create: { userId, experimentId, ruleId, ruleContent: content, remarkById: sub },
        include: { remarkBy: { select: { name: true } } },
      })
      if (score === undefined) return { review, score: null, previousScore: null }

      const previous = await tx.score.findUnique({
        where: { userId_type_indId: { userId, type: 2, indId: experimentId } },
        select: { score: true },
      })
      const savedScore = await tx.score.upsert({
        where: { userId_type_indId: { userId, type: 2, indId: experimentId } },
        update: { labId: experimentId, score, graderId: sub },
        create: {
          userId,
          type: 2,
          indId: experimentId,
          labId: experimentId,
          score,
          graderId: sub,
        },
        include: { grader: { select: { id: true, name: true } } },
      })
      return { review, score: savedScore, previousScore: previous?.score ?? null }
    })

    if (saved.score) {
      const scoreDto = toScoreDto(saved.score)
      emitScoreChange(access.student.classId as string, {
        action: 'upsert',
        classId: access.student.classId as string,
        score: scoreDto,
      })
      emitReportScore(experimentId, userId, scoreDto, sub, saved.score.grader?.name ?? '')
      if (saved.previousScore !== saved.score.score) {
        void sendPushToUser(userId, {
          title: '成绩更新',
          body: describeScoreChange({
            type: 2,
            previous: saved.previousScore,
            next: saved.score.score,
            experimentMark: access.experiment.mark,
            indId: experimentId,
          }),
          url: `/student-console/experiments/${encodeURIComponent(experimentId)}`,
        })
      }
    }

    return reply.send({
      review: reviewDto(saved.review),
      ...(saved.score ? { score: toScoreDto(saved.score) } : {}),
    })
  })
}

function parseJson(value: string): unknown {
  try {
    return JSON.parse(value)
  } catch {
    return null
  }
}
