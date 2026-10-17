import type { Class, User } from '@prisma/client'
import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'

import { requireStaff } from '../lib/class-access'
import { prisma } from '../lib/prisma'

const createTaSchema = z.object({
  /** 学号 */
  studentId: z.string().trim().min(1).max(32),
})

type TaWithClass = User & { klass: Class | null }

/** 助教列表项的安全输出结构 */
function toTa(user: TaWithClass) {
  return {
    id: user.id,
    name: user.name,
    studentId: user.studentId,
    username: user.username,
    classId: user.classId,
    classes: user.klass
      ? [{ id: user.klass.id, name: user.klass.name, type: user.klass.type }]
      : [],
    activated: Boolean(user.username),
    hasPassword: Boolean(user.password),
    zjuamAccount: user.zjuamAccount,
    createdAt: user.createdAt,
  }
}

export const staffRoutes: FastifyPluginAsync = async (fastify) => {
  /** 助教列表 */
  fastify.get('/tas', { onRequest: [fastify.authenticate] }, async (request, reply) => {
    if (!requireStaff(request, reply)) return reply

    const tas = await prisma.user.findMany({
      where: { role: 'TA' },
      include: { klass: true },
      orderBy: { createdAt: 'asc' },
    })

    return { tas: tas.map(toTa) }
  })

  /**
   * 添加助教（仅预置学号，账号处于未解封状态）。
   * TODO: 单班模型下应按班级预置（`{ studentId, classId }`）或取消该接口，
   * 目前保留既有行为，按全局学号去重。
   */
  fastify.post('/tas', { onRequest: [fastify.authenticate] }, async (request, reply) => {
    if (!requireStaff(request, reply)) return reply

    const parsed = createTaSchema.safeParse(request.body)
    if (!parsed.success) {
      return reply.code(400).send({ error: 'INVALID_BODY', message: '请输入有效的学号' })
    }

    const { studentId } = parsed.data

    const existing = await prisma.user.findFirst({
      where: { studentId, role: 'TA' },
      select: { id: true },
    })
    if (existing) {
      return reply.code(409).send({ error: 'ALREADY_EXISTS', message: '该学号已存在于系统中' })
    }

    const user = await prisma.user.create({
      data: { studentId, name: studentId, role: 'TA' },
    })

    return reply.code(201).send({ ta: toTa({ ...user, klass: null }) })
  })
}
