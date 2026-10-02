import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'

import { requireStaff } from '../lib/class-access'
import { prisma } from '../lib/prisma'

const listQuerySchema = z.object({
  stuId: z.string().trim().min(1),
  experimentId: z.string().trim().min(1),
})

const saveSchema = z.object({
  stuId: z.string().trim().min(1),
  experimentId: z.string().trim().min(1),
  ruleId: z.string().regex(/^[0-9a-f]{48}$/),
  ruleContent: z.unknown(),
})

export const reportReviewsRoutes: FastifyPluginAsync = async (fastify) => {
  /** 读取某学生某实验的报告批阅记录 */
  fastify.get('/', { onRequest: [fastify.authenticate] }, async (request, reply) => {
    if (!requireStaff(request, reply)) return reply

    const parsed = listQuerySchema.safeParse(request.query)
    if (!parsed.success) {
      return reply.code(400).send({ error: 'INVALID_QUERY', message: '查询参数不正确' })
    }

    const { stuId, experimentId } = parsed.data
    const review = await prisma.reportReview.findUnique({
      where: { stuId_experimentId: { stuId, experimentId } },
      include: { remarkBy: { select: { name: true } } },
    })
    if (!review) {
      return reply.send({ review: null })
    }

    return reply.send({
      review: {
        stuId: review.stuId,
        experimentId: review.experimentId,
        ruleId: review.ruleId,
        ruleContent: parseJson(review.ruleContent),
        remarkById: review.remarkById,
        remarkByName: review.remarkBy?.name ?? null,
        updatedAt: review.updatedAt,
      },
    })
  })

  /** 新建 / 更新报告批阅记录（助教 / 教师） */
  fastify.put('/', { onRequest: [fastify.authenticate] }, async (request, reply) => {
    if (!requireStaff(request, reply)) return reply

    const parsed = saveSchema.safeParse(request.body)
    if (!parsed.success) {
      return reply.code(400).send({ error: 'INVALID_BODY', message: '请求参数不正确' })
    }

    const { stuId, experimentId, ruleId, ruleContent } = parsed.data
    const { sub } = request.user as { sub: string }

    const student = await prisma.student.findUnique({ where: { stuId } })
    if (!student) {
      return reply.code(404).send({ error: 'STUDENT_NOT_FOUND', message: '学生不存在' })
    }
    const experiment = await prisma.experiment.findUnique({ where: { id: experimentId } })
    if (!experiment) {
      return reply.code(404).send({ error: 'EXPERIMENT_NOT_FOUND', message: '实验不存在' })
    }

    const content = JSON.stringify(ruleContent ?? null)
    const review = await prisma.reportReview.upsert({
      where: { stuId_experimentId: { stuId, experimentId } },
      update: { ruleId, ruleContent: content, remarkById: sub },
      create: { stuId, experimentId, ruleId, ruleContent: content, remarkById: sub },
      include: { remarkBy: { select: { name: true } } },
    })

    return reply.send({
      review: {
        stuId: review.stuId,
        experimentId: review.experimentId,
        ruleId: review.ruleId,
        ruleContent: parseJson(review.ruleContent),
        remarkById: review.remarkById,
        remarkByName: review.remarkBy?.name ?? null,
        updatedAt: review.updatedAt,
      },
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
