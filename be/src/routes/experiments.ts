import type { FastifyPluginAsync, FastifyRequest } from 'fastify'
import { z } from 'zod'

import { decryptSecret } from '../lib/crypto'
import { prisma } from '../lib/prisma'
import { isStaff } from '../lib/roles'
import { listHomeworkActivities, ZjuamError } from '../lib/zjuam'

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
  xzzdBindIdCheckout: z.string().trim().min(1).max(64).nullable().optional(),
  xzzdBindIdReport: z.string().trim().min(1).max(64).nullable().optional(),
})

const zjuamCredentialsSchema = z.object({
  account: z.string().trim().min(1).max(64).optional(),
  password: z.string().trim().min(1).max(128).optional(),
})

const experimentInclude = {
  klass: { select: { id: true, name: true, xzzdClassId: true } },
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

  /**
   * 拉取该实验所属班级在学在浙大的作业（homework）列表，供绑定验收 / 报告。
   * 凭据优先取请求体（"密码保存在本地" 模式），否则回退到用户已保存的凭据。
   */
  fastify.post(
    '/:id/xzzd-homeworks',
    { onRequest: [fastify.authenticate] },
    async (request, reply) => {
      const { role } = request.user as { role?: string }
      if (typeof role !== 'string' || !isStaff(role)) {
        return reply.code(403).send({ error: 'FORBIDDEN', message: '无权操作' })
      }

      const { id } = request.params as { id: string }
      const experiment = await prisma.experiment.findUnique({
        where: { id },
        include: { klass: { select: { xzzdClassId: true } } },
      })
      if (!experiment) {
        return reply.code(404).send({ error: 'EXPERIMENT_NOT_FOUND', message: '实验不存在' })
      }

      const classIds = await myClassIds(request)
      if (!classIds.includes(experiment.classId)) {
        return reply.code(403).send({ error: 'FORBIDDEN', message: '无权操作该班级的实验' })
      }

      const xzzdClassId = experiment.klass?.xzzdClassId
      if (!xzzdClassId) {
        return reply
          .code(400)
          .send({ error: 'XZZD_CLASS_ID_MISSING', message: '该班级未绑定学在浙大课程' })
      }

      const parsedBody = zjuamCredentialsSchema.safeParse(request.body ?? {})
      if (!parsedBody.success) {
        return reply.code(400).send({ error: 'INVALID_BODY', message: '请求参数不正确' })
      }

      const { sub } = request.user as { sub: string }
      const user = await prisma.user.findUnique({ where: { id: sub } })
      const account = parsedBody.data.account?.trim() || user?.zjuamAccount
      let password = parsedBody.data.password
      if (!password && user?.zjuamPassword) {
        // 密文损坏 / 密钥不匹配时按“未保存密码”处理，避免 500。
        try {
          password = decryptSecret(user.zjuamPassword)
        } catch {
          password = undefined
        }
      }
      if (!account || !password) {
        return reply
          .code(400)
          .send({ error: 'ZJUAM_CREDENTIALS_MISSING', message: '请先保存浙大统一身份认证账号和密码' })
      }

      try {
        const homeworks = await listHomeworkActivities(account, password, xzzdClassId)
        return reply.send({ homeworks })
      } catch (error) {
        if (error instanceof ZjuamError) {
          if (error.code === 'ZJUAM_AUTH_FAILED') {
            return reply
              .code(401)
              .send({ error: 'ZJUAM_AUTH_FAILED', message: '统一身份认证账号或密码错误' })
          }
          return reply
            .code(502)
            .send({ error: 'ZJUAM_UNAVAILABLE', message: '统一身份认证服务暂时不可用' })
        }
        throw error
      }
    },
  )

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

  /** 更新实验（改编号 / 标题 / 绑定题库 / 绑定学在浙大作业），需属于该实验班级 */
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
