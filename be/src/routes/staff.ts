import { Prisma, type Class, type User } from '@prisma/client'
import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'

import { requireStaff } from '../lib/class-access'
import { prisma } from '../lib/prisma'

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
  /** 助教列表 */
  fastify.get('/tas', { onRequest: [fastify.authenticate] }, async (request, reply) => {
    if (!requireStaff(request, reply)) return reply

    const tas = await prisma.user.findMany({
      where: { role: 'TA' },
      include: { classes: true },
      orderBy: { createdAt: 'asc' },
    })

    return { tas: tas.map(toTa) }
  })

  /** 添加助教（仅预置学号，账号处于未解封状态） */
  fastify.post('/tas', { onRequest: [fastify.authenticate] }, async (request, reply) => {
    if (!requireStaff(request, reply)) return reply

    const parsed = createTaSchema.safeParse(request.body)
    if (!parsed.success) {
      return reply.code(400).send({ error: 'INVALID_BODY', message: '请输入有效的学号' })
    }

    const { studentId } = parsed.data

    let user
    try {
      user = await prisma.user.create({
        data: { studentId, name: studentId, role: 'TA' },
      })
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        return reply.code(409).send({ error: 'ALREADY_EXISTS', message: '该学号已存在于系统中' })
      }
      throw error
    }

    return reply.code(201).send({ ta: toTa({ ...user, classes: [] }) })
  })
}
