import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'

import { hashPassword } from '../lib/password.js'
import { prisma } from '../lib/prisma.js'
import {
  DRAW_COUNT_DEFAULT,
  DRAW_COUNT_MAX,
  DRAW_COUNT_MIN,
  parsePreferences,
  publicUser,
  type UserPreferences,
} from '../lib/user.js'
import { isUsernameTaken } from '../lib/username.js'
import { parseCredentials, serializeCredentials } from '../lib/webauthn.js'

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
  z.object({
    action: z.literal('set_avatar'),
    /** 头像 id（前端内置头像目录）；null 表示恢复默认（首字母） */
    avatar: z.number().int().min(0).max(100_000).nullable(),
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
        include: { klass: true },
      })
      return reply.send({ user: publicUser(updatedUser) })
    }

    if (parsed.data.action === 'set_username') {
      const { username } = parsed.data
      if (await isUsernameTaken(prisma, username, user)) {
        return reply.code(409).send({ error: 'USERNAME_TAKEN', message: '该用户名已被占用' })
      }
      const updatedUser = await prisma.user.update({
        where: { id: user.id },
        data: { username, name: username },
        include: { klass: true },
      })
      return reply.send({ user: publicUser(updatedUser) })
    }

    if (parsed.data.action === 'set_avatar') {
      const updatedUser = await prisma.user.update({
        where: { id: user.id },
        data: { avatar: parsed.data.avatar },
        include: { klass: true },
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
      include: { klass: true },
    })

    return reply.send({ user: publicUser(updatedUser) })
  })

  const preferencesSchema = z.object({
    device: z.enum(['single', 'multi']),
    draw: z.enum(['random', 'fixed']),
    markdownEditor: z.enum(['uiw', 'mdx']).optional(),
    markdownStyle: z.enum(['github', 'prose']).optional(),
    drawCount: z.number().int().min(DRAW_COUNT_MIN).max(DRAW_COUNT_MAX).optional(),
  })

  /** 更新验收偏好（未提交的字段沿用已有值） */
  fastify.put('/preferences', { onRequest: [fastify.authenticate] }, async (request, reply) => {
    const parsed = preferencesSchema.safeParse(request.body)
    if (!parsed.success) return reply.code(400).send({ error: 'INVALID_BODY', message: '请求参数不正确' })
    const { sub } = request.user as { sub: string }
    const current = await prisma.user.findUnique({
      where: { id: sub },
      select: { preferences: true },
    })
    const existing = parsePreferences(current?.preferences)
    const next: UserPreferences = {
      device: parsed.data.device,
      draw: parsed.data.draw,
      markdownEditor: parsed.data.markdownEditor ?? existing?.markdownEditor ?? 'uiw',
      markdownStyle: parsed.data.markdownStyle ?? existing?.markdownStyle ?? 'github',
      drawCount: parsed.data.drawCount ?? existing?.drawCount ?? DRAW_COUNT_DEFAULT,
    }
    const updated = await prisma.user.update({
      where: { id: sub },
      data: { preferences: JSON.stringify(next) },
      include: { klass: true },
    })
    return reply.send({ user: publicUser(updated) })
  })
}
