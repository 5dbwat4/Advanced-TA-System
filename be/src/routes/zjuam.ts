import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'

import { encryptSecret } from '../lib/crypto'
import { prisma } from '../lib/prisma'
import { publicUser } from '../lib/user'
import { listCourses } from '../lib/zjuam'
import { resolveZjuamCredentials, sendZjuamError } from '../lib/zjuam-resolve'

const credentialSchema = z.object({
  account: z.string().trim().min(1).max(64),
  password: z.string().trim().min(1).max(128),
})

const listCoursesSchema = z.object({
  account: z.string().trim().min(1).max(64).optional(),
  password: z.string().trim().min(1).max(128).optional(),
})

export const zjuamRoutes: FastifyPluginAsync = async (fastify) => {
  /** 保存 / 更新当前用户的统一身份认证凭据（密码加密存储） */
  fastify.put('/credentials', { onRequest: [fastify.authenticate] }, async (request, reply) => {
    const parsed = credentialSchema.safeParse(request.body)
    if (!parsed.success) {
      return reply.code(400).send({ error: 'INVALID_BODY', message: '请求参数不正确' })
    }

    const { sub } = request.user as { sub: string }
    const existing = await prisma.user.findUnique({ where: { id: sub } })
    if (!existing) {
      return reply.code(401).send({ error: 'UNAUTHORIZED', message: '用户不存在' })
    }

    const { account, password } = parsed.data
    const user = await prisma.user.update({
      where: { id: sub },
      data: { zjuamAccount: account, zjuamPassword: encryptSecret(password) },
      include: { classes: true },
    })

    return reply.send({ user: publicUser(user) })
  })

  /** 删除当前用户的统一身份认证密码（保留账号） */
  fastify.delete('/credentials', { onRequest: [fastify.authenticate] }, async (request, reply) => {
    const { sub } = request.user as { sub: string }
    const existing = await prisma.user.findUnique({ where: { id: sub } })
    if (!existing) {
      return reply.code(401).send({ error: 'UNAUTHORIZED', message: '用户不存在' })
    }

    const user = await prisma.user.update({
      where: { id: sub },
      data: { zjuamPassword: null },
      include: { classes: true },
    })

    return reply.send({ user: publicUser(user) })
  })

  /** 拉取当前用户（或指定凭据）在学在浙大的全部课程 */
  fastify.post('/courses', { onRequest: [fastify.authenticate] }, async (request, reply) => {
    const parsed = listCoursesSchema.safeParse(request.body ?? {})
    if (!parsed.success) {
      return reply.code(400).send({ error: 'INVALID_BODY', message: '请求参数不正确' })
    }

    const { sub } = request.user as { sub: string }
    const credentials = await resolveZjuamCredentials(sub, parsed.data)
    if (!credentials) {
      return reply
        .code(400)
        .send({ error: 'ZJUAM_CREDENTIALS_MISSING', message: '请先保存浙大统一身份认证账号和密码' })
    }

    try {
      const courses = await listCourses(credentials.account, credentials.password)
      return reply.send({ courses })
    } catch (error) {
      return sendZjuamError(reply, error)
    }
  })
}
