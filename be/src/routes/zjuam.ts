import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'

import { decryptSecret, encryptSecret } from '../lib/crypto'
import { prisma } from '../lib/prisma'
import { publicUser } from '../lib/user'
import { listCourses, ZjuamError } from '../lib/zjuam'

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
    const user = await prisma.user.findUnique({ where: { id: sub } })
    if (!user) {
      return reply.code(401).send({ error: 'UNAUTHORIZED', message: '用户不存在' })
    }

    const account = parsed.data.account?.trim() || user.zjuamAccount
    let password = parsed.data.password
    if (!password && user.zjuamPassword) {
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
      const courses = await listCourses(account, password)
      return reply.send({ courses })
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
  })
}
