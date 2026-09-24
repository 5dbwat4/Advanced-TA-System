import type { Class, User } from '@prisma/client'
import type { FastifyPluginAsync, FastifyRequest } from 'fastify'
import { z } from 'zod'

import { prisma } from '../lib/prisma'
import { isStaff } from '../lib/roles'

const createTaSchema = z.object({
  /** 学号 */
  studentId: z.string().trim().min(1).max(32),
})

type TaWithClass = User & { classes: Class[] }

/** 助教列表项的安全输出结构 */
function toTa(user: TaWithClass) {
  return {
    id: user.id,
    name: user.name,
    studentId: user.studentId,
    username: user.username,
    classes: user.classes.map((c) => ({ id: c.id, name: c.name, type: c.type })),
    activated: Boolean(user.username),
    hasPassword: Boolean(user.password),
    zjuamAccount: user.zjuamAccount,
    createdAt: user.createdAt,
  }
}

export const staffRoutes: FastifyPluginAsync = async (fastify) => {
  /** 当前登录用户是否为助教 / 教师 */
  function requireStaff(request: FastifyRequest): boolean {
    const payload = request.user as { role?: string }
    return isStaff(payload.role ?? '')
  }

  /** 助教列表 */
  fastify.get('/tas', { onRequest: [fastify.authenticate] }, async (request, reply) => {
    if (!requireStaff(request)) {
      return reply.code(403).send({ error: 'FORBIDDEN', message: '仅助教或教师可操作' })
    }

    const tas = await prisma.user.findMany({
      where: { role: 'TA' },
      include: { classes: true },
      orderBy: { createdAt: 'asc' },
    })

    return { tas: tas.map(toTa) }
  })

  /** 添加助教（仅预置学号，账号处于未解封状态） */
  fastify.post('/tas', { onRequest: [fastify.authenticate] }, async (request, reply) => {
    if (!requireStaff(request)) {
      return reply.code(403).send({ error: 'FORBIDDEN', message: '仅助教或教师可操作' })
    }

    const parsed = createTaSchema.safeParse(request.body)
    if (!parsed.success) {
      return reply.code(400).send({ error: 'INVALID_BODY', message: '请输入有效的学号' })
    }

    const { studentId } = parsed.data
    const existing = await prisma.user.findUnique({ where: { studentId } })
    if (existing) {
      return reply.code(409).send({ error: 'ALREADY_EXISTS', message: '该学号已存在于系统中' })
    }

    const user = await prisma.user.create({
      data: { studentId, name: studentId, role: 'TA' },
    })

    return reply.code(201).send({ ta: toTa({ ...user, classes: [] }) })
  })
}
