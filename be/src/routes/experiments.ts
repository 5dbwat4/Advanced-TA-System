import type { FastifyPluginAsync, FastifyRequest } from 'fastify'
import { z } from 'zod'

import { prisma } from '../lib/prisma'
import { isStaff } from '../lib/roles'

const createExperimentSchema = z.object({
  mark: z.string().trim().min(1).max(32),
  title: z.string().trim().min(1).max(64),
  classId: z.string().trim().min(1).max(64),
  questionBankId: z.string().trim().min(1).max(64).nullish(),
})

const updateExperimentSchema = z.object({
  mark: z.string().trim().min(1).max(32).optional(),
  title: z.string().trim().min(1).max(64).optional(),
  questionBankId: z.string().trim().min(1).max(64).nullable().optional(),
})

const experimentInclude = {
  klass: { select: { id: true, name: true } },
  questionBank: { select: { id: true, name: true } },
}

export const experimentsRoutes: FastifyPluginAsync = async (fastify) => {
  /** 读取当前用户所属班级 id 列表 */
  async function myClassIds(request: FastifyRequest): Promise<string[]> {
    const { sub } = request.user as { sub: string }
    const me = await prisma.user.findUnique({ where: { id: sub }, include: { classes: true } })
    return (me?.classes ?? []).map((c) => c.id)
  }

  /** 实验列表 */
  fastify.get('/', { onRequest: [fastify.authenticate] }, async () => {
    const experiments = await prisma.experiment.findMany({ include: experimentInclude })
    experiments.sort((a, b) => a.mark.localeCompare(b.mark, 'zh-CN', { numeric: true }))
    return { experiments }
  })

  /** 实验详情 */
  fastify.get('/:id', { onRequest: [fastify.authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const experiment = await prisma.experiment.findUnique({
      where: { id },
      include: experimentInclude,
    })
    if (!experiment) {
      return reply.code(404).send({ error: 'EXPERIMENT_NOT_FOUND', message: '实验不存在' })
    }
    return { experiment }
  })

  /** 新建实验 */
  fastify.post('/', { onRequest: [fastify.authenticate] }, async (request, reply) => {
    const { role } = request.user as { role?: string }
    if (typeof role !== 'string' || !isStaff(role)) {
      return reply.code(403).send({ error: 'FORBIDDEN', message: '无权操作' })
    }

    const parsed = createExperimentSchema.safeParse(request.body)
    if (!parsed.success) {
      return reply.code(400).send({ error: 'INVALID_BODY', message: '请求参数不正确' })
    }

    const { mark, title, classId, questionBankId } = parsed.data

    const klass = await prisma.class.findUnique({ where: { id: classId } })
    if (!klass) {
      return reply.code(404).send({ error: 'CLASS_NOT_FOUND', message: '课程不存在' })
    }

    if (questionBankId) {
      const bank = await prisma.questionBank.findUnique({ where: { id: questionBankId } })
      if (!bank) {
        return reply.code(404).send({ error: 'BANK_NOT_FOUND', message: '题库不存在' })
      }
    }

    const existing = await prisma.experiment.findUnique({
      where: { classId_mark: { classId, mark } },
    })
    if (existing) {
      return reply.code(409).send({ error: 'EXPERIMENT_EXISTS', message: '该实验已存在' })
    }

    const experiment = await prisma.experiment.create({
      data: { mark, title, classId, questionBankId: questionBankId ?? null },
      include: experimentInclude,
    })

    return reply.code(201).send({ experiment })
  })

  /** 更新实验（改编号 / 标题 / 绑定题库），需属于该实验班级 */
  fastify.patch('/:id', { onRequest: [fastify.authenticate] }, async (request, reply) => {
    const { role } = request.user as { role?: string }
    if (typeof role !== 'string' || !isStaff(role)) {
      return reply.code(403).send({ error: 'FORBIDDEN', message: '无权操作' })
    }

    const { id } = request.params as { id: string }

    const parsed = updateExperimentSchema.safeParse(request.body)
    if (!parsed.success) {
      return reply.code(400).send({ error: 'INVALID_BODY', message: '请求参数不正确' })
    }

    const existing = await prisma.experiment.findUnique({ where: { id } })
    if (!existing) {
      return reply.code(404).send({ error: 'EXPERIMENT_NOT_FOUND', message: '实验不存在' })
    }

    const classIds = await myClassIds(request)
    if (!classIds.includes(existing.classId)) {
      return reply.code(403).send({ error: 'FORBIDDEN', message: '无权操作该班级的实验' })
    }

    if (parsed.data.questionBankId) {
      const bank = await prisma.questionBank.findUnique({ where: { id: parsed.data.questionBankId } })
      if (!bank) {
        return reply.code(404).send({ error: 'BANK_NOT_FOUND', message: '题库不存在' })
      }
    }

    if (parsed.data.mark && parsed.data.mark !== existing.mark) {
      const conflict = await prisma.experiment.findUnique({
        where: { classId_mark: { classId: existing.classId, mark: parsed.data.mark } },
      })
      if (conflict) {
        return reply.code(409).send({ error: 'EXPERIMENT_EXISTS', message: '该实验编号已存在' })
      }
    }

    const experiment = await prisma.experiment.update({
      where: { id },
      data: parsed.data,
      include: experimentInclude,
    })

    return reply.send({ experiment })
  })
}
