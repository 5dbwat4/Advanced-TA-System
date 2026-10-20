import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'

import { env } from '../env.js'
import { requireStudent } from '../lib/class-access.js'
import { prisma } from '../lib/prisma.js'
import { pushConfigured } from '../lib/push.js'

const subscriptionSchema = z.object({
  endpoint: z.string().url().max(4096),
  keys: z.object({
    p256dh: z.string().min(1).max(512),
    auth: z.string().min(1).max(256),
  }),
})

const unsubscribeSchema = z.object({
  endpoint: z.string().url().max(4096),
})

export const pushRoutes: FastifyPluginAsync = async (fastify) => {
  /** 公开的 VAPID 公钥，前端用于 pushManager.subscribe */
  fastify.get('/public-key', async (_request, reply) => {
    if (!pushConfigured) {
      return reply.code(503).send({ error: 'PUSH_DISABLED', message: '后台推送未配置' })
    }
    return reply.send({ publicKey: env.vapidPublicKey })
  })

  /** 保存/更新当前学生的浏览器推送订阅 */
  fastify.post('/subscribe', { onRequest: [fastify.authenticate] }, async (request, reply) => {
    if (!requireStudent(request, reply)) return reply
    if (!pushConfigured) {
      return reply.code(503).send({ error: 'PUSH_DISABLED', message: '后台推送未配置' })
    }

    const parsed = subscriptionSchema.safeParse(request.body)
    if (!parsed.success) {
      return reply.code(400).send({ error: 'INVALID_BODY', message: '请求参数不正确' })
    }

    const { sub } = request.user as { sub: string }
    const { endpoint, keys } = parsed.data
    const userAgent = request.headers['user-agent']?.slice(0, 512) ?? null

    const subscription = await prisma.pushSubscription.upsert({
      where: { endpoint },
      update: {
        userId: sub,
        p256dh: keys.p256dh,
        auth: keys.auth,
        userAgent,
      },
      create: {
        userId: sub,
        endpoint,
        p256dh: keys.p256dh,
        auth: keys.auth,
        userAgent,
      },
    })

    return reply.send({ ok: true, id: subscription.id })
  })

  /** 删除当前学生的某个浏览器推送订阅 */
  fastify.post('/unsubscribe', { onRequest: [fastify.authenticate] }, async (request, reply) => {
    if (!requireStudent(request, reply)) return reply

    const parsed = unsubscribeSchema.safeParse(request.body)
    if (!parsed.success) {
      return reply.code(400).send({ error: 'INVALID_BODY', message: '请求参数不正确' })
    }

    const { sub } = request.user as { sub: string }
    await prisma.pushSubscription.deleteMany({
      where: { userId: sub, endpoint: parsed.data.endpoint },
    })

    return reply.send({ ok: true })
  })
}
