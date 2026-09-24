import type { Prisma } from '@prisma/client'
import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'

import {
  filterExistingQuestionIds,
  normalizeQuestionIds,
  parseBankQuestions,
} from '../lib/banks'
import { prisma } from '../lib/prisma'
import { isStaff } from '../lib/roles'

const bankInclude = {
  owner: { select: { id: true, username: true, name: true } },
  _count: { select: { experiments: true } },
} satisfies Prisma.QuestionBankInclude

const questionInclude = {
  user: { select: { id: true, username: true, name: true } },
} satisfies Prisma.QuestionInclude

type BankWithInclude = Prisma.QuestionBankGetPayload<{ include: typeof bankInclude }>

/** 题库对外结构：questions 由 JSON 字符串转为数组 */
function serializeBank(bank: BankWithInclude) {
  return {
    id: bank.id,
    name: bank.name,
    owner: bank.owner,
    questions: parseBankQuestions(bank.questions),
    experimentCount: bank._count.experiments,
    createdAt: bank.createdAt,
    updatedAt: bank.updatedAt,
  }
}

const nameSchema = z.object({
  name: z.string().trim().min(1).max(64),
})

const idsSchema = z.object({
  questionIds: z.array(z.string().trim().min(1)).max(2000),
})

export const banksRoutes: FastifyPluginAsync = async (fastify) => {
  /** 题库列表 */
  fastify.get('/', { onRequest: [fastify.authenticate] }, async () => {
    const banks = await prisma.questionBank.findMany({
      include: bankInclude,
      orderBy: { updatedAt: 'desc' },
    })
    return { banks: banks.map(serializeBank) }
  })

  /** 题库内的题目（按题目集内顺序，含出题人） */
  fastify.get('/:id/questions', { onRequest: [fastify.authenticate] }, async (request, reply) => {
    const { role } = request.user as { role?: string }
    if (typeof role !== 'string' || !isStaff(role)) {
      return reply.code(403).send({ error: 'FORBIDDEN', message: '无权操作' })
    }

    const { id } = request.params as { id: string }
    const bank = await prisma.questionBank.findUnique({
      where: { id },
      select: { questions: true },
    })
    if (!bank) {
      return reply.code(404).send({ error: 'BANK_NOT_FOUND', message: '题库不存在' })
    }

    const ids = parseBankQuestions(bank.questions)
    const rows =
      ids.length > 0
        ? await prisma.question.findMany({ where: { id: { in: ids } }, include: questionInclude })
        : []
    const byId = new Map(rows.map((row) => [row.id, row]))
    const questions: (typeof rows)[number][] = []
    for (const qid of ids) {
      const row = byId.get(qid)
      if (row) questions.push(row)
    }

    return { questions }
  })

  /** 新建题库（所有人 = staff 均可） */
  fastify.post('/', { onRequest: [fastify.authenticate] }, async (request, reply) => {
    const { sub, role } = request.user as { sub?: string; role?: string }
    if (typeof role !== 'string' || !isStaff(role)) {
      return reply.code(403).send({ error: 'FORBIDDEN', message: '无权操作' })
    }
    if (!sub) {
      return reply.code(401).send({ error: 'UNAUTHORIZED', message: '未登录或登录已过期' })
    }

    const parsed = nameSchema.safeParse(request.body)
    if (!parsed.success) {
      return reply.code(400).send({ error: 'INVALID_BODY', message: '请求参数不正确' })
    }

    const bank = await prisma.questionBank.create({
      data: { name: parsed.data.name, ownerId: sub },
      include: bankInclude,
    })

    return reply.code(201).send({ bank: serializeBank(bank) })
  })

  /** 重命名题库（任意 staff；前端对非 owner 会先确认） */
  fastify.patch('/:id', { onRequest: [fastify.authenticate] }, async (request, reply) => {
    const { role } = request.user as { role?: string }
    if (typeof role !== 'string' || !isStaff(role)) {
      return reply.code(403).send({ error: 'FORBIDDEN', message: '无权操作' })
    }

    const { id } = request.params as { id: string }
    const parsed = nameSchema.safeParse(request.body)
    if (!parsed.success) {
      return reply.code(400).send({ error: 'INVALID_BODY', message: '请求参数不正确' })
    }

    const existing = await prisma.questionBank.findUnique({ where: { id } })
    if (!existing) {
      return reply.code(404).send({ error: 'BANK_NOT_FOUND', message: '题库不存在' })
    }

    const bank = await prisma.questionBank.update({
      where: { id },
      data: { name: parsed.data.name },
      include: bankInclude,
    })

    return reply.send({ bank: serializeBank(bank) })
  })

  /** 复制题库（任意 staff，新 owner = 当前用户） */
  fastify.post('/:id/duplicate', { onRequest: [fastify.authenticate] }, async (request, reply) => {
    const { sub, role } = request.user as { sub?: string; role?: string }
    if (typeof role !== 'string' || !isStaff(role)) {
      return reply.code(403).send({ error: 'FORBIDDEN', message: '无权操作' })
    }
    if (!sub) {
      return reply.code(401).send({ error: 'UNAUTHORIZED', message: '未登录或登录已过期' })
    }

    const { id } = request.params as { id: string }

    const existing = await prisma.questionBank.findUnique({ where: { id } })
    if (!existing) {
      return reply.code(404).send({ error: 'BANK_NOT_FOUND', message: '题库不存在' })
    }

    const bank = await prisma.questionBank.create({
      data: {
        name: `${existing.name} 副本`,
        ownerId: sub,
        questions: existing.questions,
      },
      include: bankInclude,
    })

    return reply.code(201).send({ bank: serializeBank(bank) })
  })

  /** 删除题库（任意 staff；绑定它的实验会自动解绑） */
  fastify.delete('/:id', { onRequest: [fastify.authenticate] }, async (request, reply) => {
    const { role } = request.user as { role?: string }
    if (typeof role !== 'string' || !isStaff(role)) {
      return reply.code(403).send({ error: 'FORBIDDEN', message: '无权操作' })
    }

    const { id } = request.params as { id: string }

    const existing = await prisma.questionBank.findUnique({ where: { id } })
    if (!existing) {
      return reply.code(404).send({ error: 'BANK_NOT_FOUND', message: '题库不存在' })
    }

    await prisma.questionBank.delete({ where: { id } })

    return reply.send({ ok: true })
  })

  /** 追加题目（去重，忽略不存在的题目 id） */
  fastify.post('/:id/questions', { onRequest: [fastify.authenticate] }, async (request, reply) => {
    const { role } = request.user as { role?: string }
    if (typeof role !== 'string' || !isStaff(role)) {
      return reply.code(403).send({ error: 'FORBIDDEN', message: '无权操作' })
    }

    const { id } = request.params as { id: string }
    const parsed = idsSchema.safeParse(request.body)
    if (!parsed.success) {
      return reply.code(400).send({ error: 'INVALID_BODY', message: '请求参数不正确' })
    }

    const incoming = await filterExistingQuestionIds(
      normalizeQuestionIds(parsed.data.questionIds),
    )

    const bank = await prisma.$transaction(async (tx) => {
      const current = await tx.questionBank.findUnique({ where: { id } })
      if (!current) return null

      const list = parseBankQuestions(current.questions)
      const present = new Set(list)
      for (const questionId of incoming) {
        if (!present.has(questionId)) {
          list.push(questionId)
          present.add(questionId)
        }
      }

      return tx.questionBank.update({
        where: { id },
        data: { questions: JSON.stringify(list) },
        include: bankInclude,
      })
    })

    if (!bank) {
      return reply.code(404).send({ error: 'BANK_NOT_FOUND', message: '题库不存在' })
    }

    return reply.send({ bank: serializeBank(bank) })
  })

  /** 移除题目 */
  fastify.delete('/:id/questions', { onRequest: [fastify.authenticate] }, async (request, reply) => {
    const { role } = request.user as { role?: string }
    if (typeof role !== 'string' || !isStaff(role)) {
      return reply.code(403).send({ error: 'FORBIDDEN', message: '无权操作' })
    }

    const { id } = request.params as { id: string }
    const parsed = idsSchema.safeParse(request.body)
    if (!parsed.success) {
      return reply.code(400).send({ error: 'INVALID_BODY', message: '请求参数不正确' })
    }

    const removing = new Set(normalizeQuestionIds(parsed.data.questionIds))

    const bank = await prisma.$transaction(async (tx) => {
      const current = await tx.questionBank.findUnique({ where: { id } })
      if (!current) return null

      const list = parseBankQuestions(current.questions).filter((item) => !removing.has(item))

      return tx.questionBank.update({
        where: { id },
        data: { questions: JSON.stringify(list) },
        include: bankInclude,
      })
    })

    if (!bank) {
      return reply.code(404).send({ error: 'BANK_NOT_FOUND', message: '题库不存在' })
    }

    return reply.send({ bank: serializeBank(bank) })
  })

  /** 覆盖 / 重排题目列表 */
  fastify.put('/:id/questions', { onRequest: [fastify.authenticate] }, async (request, reply) => {
    const { role } = request.user as { role?: string }
    if (typeof role !== 'string' || !isStaff(role)) {
      return reply.code(403).send({ error: 'FORBIDDEN', message: '无权操作' })
    }

    const { id } = request.params as { id: string }
    const parsed = idsSchema.safeParse(request.body)
    if (!parsed.success) {
      return reply.code(400).send({ error: 'INVALID_BODY', message: '请求参数不正确' })
    }

    const list = await filterExistingQuestionIds(normalizeQuestionIds(parsed.data.questionIds))

    const existing = await prisma.questionBank.findUnique({ where: { id } })
    if (!existing) {
      return reply.code(404).send({ error: 'BANK_NOT_FOUND', message: '题库不存在' })
    }

    const bank = await prisma.questionBank.update({
      where: { id },
      data: { questions: JSON.stringify(list) },
      include: bankInclude,
    })

    return reply.send({ bank: serializeBank(bank) })
  })
}
