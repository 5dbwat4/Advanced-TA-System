import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'

import { hashPassword } from '../lib/password'
import { prisma } from '../lib/prisma'
import { publicUser } from '../lib/user'
import { parseCredentials, serializeCredentials } from '../lib/webauthn'

const settingsSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('set_password'),
    newPassword: z.string().min(8).max(128),
  }),
  z.object({
    action: z.literal('set_username'),
    username: z.string().trim().min(1).max(32),
  }),
  z.object({
    action: z.literal('remove_passkey'),
    passkeyId: z.string().min(1),
  }),
])

export const settingsRoutes: FastifyPluginAsync = async (fastify) => {
  /** 账号设置：设置密码 / 移除通行密钥 */
  fastify.patch('/', { onRequest: [fastify.authenticate] }, async (request, reply) => {
    const parsed = settingsSchema.safeParse(request.body)
    if (!parsed.success) {
      return reply.code(400).send({ error: 'INVALID_BODY', message: '请求参数不正确' })
    }

    const { sub } = request.user as { sub: string }
    const user = await prisma.user.findUnique({ where: { id: sub } })
    if (!user) {
      return reply.code(401).send({ error: 'UNAUTHORIZED', message: '用户不存在' })
    }

    if (parsed.data.action === 'set_password') {
      const passwordHash = await hashPassword(parsed.data.newPassword)
      const updatedUser = await prisma.user.update({
        where: { id: user.id },
        data: { password: passwordHash },
        include: { classes: true },
      })
      return reply.send({ user: publicUser(updatedUser) })
    }

    if (parsed.data.action === 'set_username') {
      const { username } = parsed.data
      const taken = await prisma.user.findFirst({
        where: { username, NOT: { id: user.id } },
        select: { id: true },
      })
      if (taken) {
        return reply.code(409).send({ error: 'USERNAME_TAKEN', message: '该用户名已被使用' })
      }
      const updatedUser = await prisma.user.update({
        where: { id: user.id },
        data: { username, name: username },
        include: { classes: true },
      })
      return reply.send({ user: publicUser(updatedUser) })
    }

    const { passkeyId } = parsed.data
    const credentials = parseCredentials(user)
    const next = credentials.filter((credential) => credential.id !== passkeyId)
    if (next.length === credentials.length) {
      return reply.code(404).send({ error: 'PASSKEY_NOT_FOUND', message: '未找到该通行密钥' })
    }

    const updatedUser = await prisma.user.update({
      where: { id: user.id },
      data: { webauthn: next.length === 0 ? null : serializeCredentials(next) },
      include: { classes: true },
    })

    return reply.send({ user: publicUser(updatedUser) })
  })

  const preferencesSchema = z.object({
    device: z.enum(['single', 'multi']),
    draw: z.enum(['random', 'fixed']),
  })

  /** 更新验收偏好 */
  fastify.put('/preferences', { onRequest: [fastify.authenticate] }, async (request, reply) => {
    const parsed = preferencesSchema.safeParse(request.body)
    if (!parsed.success) return reply.code(400).send({ error: 'INVALID_BODY', message: '请求参数不正确' })
    const { sub } = request.user as { sub: string }
    const updated = await prisma.user.update({
      where: { id: sub },
      data: { preferences: JSON.stringify(parsed.data) },
      include: { classes: true },
    })
    return reply.send({ user: publicUser(updated) })
  })
}
