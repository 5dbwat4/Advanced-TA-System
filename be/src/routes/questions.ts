import type { Prisma } from '@prisma/client'
import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'

import { removeQuestionsFromBanks } from '../lib/banks'
import { prisma } from '../lib/prisma'
import { isStaff } from '../lib/roles'

const questionInclude = {
  user: { select: { id: true, username: true, name: true } },
} satisfies Prisma.QuestionInclude

const createQuestionSchema = z.object({
  question: z.string().trim().min(1).max(20000),
  answer: z.string().trim().min(1).max(20000),
})

const updateQuestionSchema = z.object({
  question: z.string().trim().min(1).max(20000).optional(),
  answer: z.string().trim().min(1).max(20000).optional(),
})

export const questionsRoutes: FastifyPluginAsync = async (fastify) => {
  /** 题目列表（支持关键词搜索 + 分页，含出题人） */
  fastify.get('/', { onRequest: [fastify.authenticate] }, async (request) => {
    const query = request.query as { q?: unknown; limit?: unknown; offset?: unknown }
    const keyword = typeof query.q === 'string' ? query.q.trim() : ''

    const rawLimit = typeof query.limit === 'string' ? Number.parseInt(query.limit, 10) : 20
    const rawOffset = typeof query.offset === 'string' ? Number.parseInt(query.offset, 10) : 0
    const limit = Number.isFinite(rawLimit) ? Math.min(Math.max(rawLimit, 1), 100) : 20
    const offset = Number.isFinite(rawOffset) && rawOffset > 0 ? rawOffset : 0

    const where = keyword ? { question: { contains: keyword } } : undefined

    const [questions, total] = await Promise.all([
      prisma.question.findMany({
        where,
        include: questionInclude,
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
      }),
      prisma.question.count({ where }),
    ])

    return { questions, total }
  })

  /** 新建题目（所有 staff 均可上传，出题人 = 当前用户） */
  fastify.post('/', { onRequest: [fastify.authenticate] }, async (request, reply) => {
    const { sub, role } = request.user as { sub?: string; role?: string }
    if (typeof role !== 'string' || !isStaff(role)) {
      return reply.code(403).send({ error: 'FORBIDDEN', message: '无权操作' })
    }
    if (!sub) {
      return reply.code(401).send({ error: 'UNAUTHORIZED', message: '未登录或登录已过期' })
    }

    const parsed = createQuestionSchema.safeParse(request.body)
    if (!parsed.success) {
      return reply.code(400).send({ error: 'INVALID_BODY', message: '请求参数不正确' })
    }

    const created = await prisma.question.create({
      data: { question: parsed.data.question, answer: parsed.data.answer, provider: sub },
      include: questionInclude,
    })

    return reply.code(201).send({ question: created })
  })

  /** 更新题目（仅出题人；其他 staff 可复制一份再改） */
  fastify.patch('/:id', { onRequest: [fastify.authenticate] }, async (request, reply) => {
    const { sub, role } = request.user as { sub?: string; role?: string }
    if (typeof role !== 'string' || !isStaff(role)) {
      return reply.code(403).send({ error: 'FORBIDDEN', message: '无权操作' })
    }
    if (!sub) {
      return reply.code(401).send({ error: 'UNAUTHORIZED', message: '未登录或登录已过期' })
    }

    const { id } = request.params as { id: string }

    const parsed = updateQuestionSchema.safeParse(request.body)
    if (!parsed.success) {
      return reply.code(400).send({ error: 'INVALID_BODY', message: '请求参数不正确' })
    }

    const existing = await prisma.question.findUnique({ where: { id } })
    if (!existing) {
      return reply.code(404).send({ error: 'QUESTION_NOT_FOUND', message: '题目不存在' })
    }
    if (existing.provider !== sub) {
      return reply
        .code(403)
        .send({ error: 'FORBIDDEN', message: '仅出题人可编辑，可先复制一份再修改' })
    }

    const updated = await prisma.question.update({
      where: { id },
      data: parsed.data,
      include: questionInclude,
    })

    return reply.send({ question: updated })
  })

  /** 复制题目（任意 staff，出题人 = 当前用户） */
  fastify.post('/:id/duplicate', { onRequest: [fastify.authenticate] }, async (request, reply) => {
    const { sub, role } = request.user as { sub?: string; role?: string }
    if (typeof role !== 'string' || !isStaff(role)) {
      return reply.code(403).send({ error: 'FORBIDDEN', message: '无权操作' })
    }
    if (!sub) {
      return reply.code(401).send({ error: 'UNAUTHORIZED', message: '未登录或登录已过期' })
    }

    const { id } = request.params as { id: string }

    const existing = await prisma.question.findUnique({ where: { id } })
    if (!existing) {
      return reply.code(404).send({ error: 'QUESTION_NOT_FOUND', message: '题目不存在' })
    }

    const created = await prisma.question.create({
      data: { question: existing.question, answer: existing.answer, provider: sub },
      include: questionInclude,
    })

    return reply.code(201).send({ question: created })
  })

  /** 删除题目（仅出题人），并清理所有题库中的引用 */
  fastify.delete('/:id', { onRequest: [fastify.authenticate] }, async (request, reply) => {
    const { sub, role } = request.user as { sub?: string; role?: string }
    if (typeof role !== 'string' || !isStaff(role)) {
      return reply.code(403).send({ error: 'FORBIDDEN', message: '无权操作' })
    }
    if (!sub) {
      return reply.code(401).send({ error: 'UNAUTHORIZED', message: '未登录或登录已过期' })
    }

    const { id } = request.params as { id: string }

    const existing = await prisma.question.findUnique({ where: { id } })
    if (!existing) {
      return reply.code(404).send({ error: 'QUESTION_NOT_FOUND', message: '题目不存在' })
    }
    if (existing.provider !== sub) {
      return reply
        .code(403)
        .send({ error: 'FORBIDDEN', message: '仅出题人可删除，可先复制一份再修改' })
    }

    await prisma.question.delete({ where: { id } })
    await removeQuestionsFromBanks([id])

    return reply.send({ ok: true })
  })
}
