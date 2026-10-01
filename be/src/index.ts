import 'dotenv/config'

import type { FastifyError, FastifyInstance } from 'fastify'
import { Prisma } from '@prisma/client'
import cors from '@fastify/cors'
import jwt from '@fastify/jwt'
import Fastify from 'fastify'
import { ZodError } from 'zod'

import { env } from './env'
import { createRealtime } from './lib/realtime'
import { loginRateLimit } from './lib/rate-limit'
import { authRoutes } from './routes/auth'
import { banksRoutes } from './routes/banks'
import { checkoffRoutes } from './routes/checkoff'
import { classesRoutes } from './routes/classes'
import { experimentsRoutes } from './routes/experiments'
import { mcpRoutes } from './routes/mcp'
import { passkeyRoutes } from './routes/passkey'
import { questionsRoutes } from './routes/questions'
import { rosterRoutes } from './routes/roster'
import { scoresRoutes } from './routes/scores'
import { settingsRoutes } from './routes/settings'
import { staffRoutes } from './routes/staff'
import { studentPreviewRoutes } from './routes/student-preview'
import { tokensRoutes } from './routes/tokens'
import { zjuamRoutes } from './routes/zjuam'

const fastify = Fastify({ logger: true })

await fastify.register(cors, { origin: true })

await fastify.register(jwt, { secret: env.jwtSecret })

fastify.setErrorHandler((error: unknown, request, reply) => {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
    return reply.code(409).send({ error: 'ALREADY_EXISTS', message: '记录已存在，请刷新后重试' })
  }
  if (error instanceof ZodError) {
    return reply.code(400).send({ error: 'INVALID_BODY', message: '请求参数不正确' })
  }
  const fastifyError =
    typeof error === 'object' && error !== null && 'statusCode' in error
      ? (error as FastifyError)
      : undefined
  const statusCode = fastifyError?.statusCode
  if (fastifyError && typeof statusCode === 'number' && statusCode >= 400 && statusCode < 500) {
    request.log.info(error)
    return reply
      .code(statusCode)
      .send({ error: fastifyError.code ?? 'INTERNAL', message: fastifyError.message })
  }
  request.log.error(error)
  return reply.code(statusCode ?? 500).send({ error: 'INTERNAL', message: '服务器内部错误' })
})

fastify.decorate('authenticate', async (request, reply) => {
  try {
    await request.jwtVerify()
  } catch {
    return reply.code(401).send({ error: 'UNAUTHORIZED', message: '未登录或登录已过期' })
  }
})

createRealtime(fastify)

/**
 * 登录类公开接口限流（按 IP）：/api/auth/login*、/api/auth/zjuam/login、
 * /api/auth/passkey/authentication-verify。仅限 POST，GET authentication-options
 * 为公开枚举端点（QR / 跳转场景）不限流。
 */
function registerPublicLoginRoutes(app: FastifyInstance): void {
  const limitedRoutes = new Set([
    '/api/auth/login',
    '/api/auth/login/ta',
    '/api/auth/login/teacher',
    '/api/auth/login/student',
    '/api/auth/zjuam/login',
    '/api/auth/passkey/authentication-verify',
  ])

  app.addHook(
    'preHandler',
    async (request, reply) => {
      if (request.method !== 'POST') return
      if (!limitedRoutes.has(request.routeOptions.url ?? '')) return

      const { ok, retryAfterSec } = loginRateLimit(`login:${request.ip}`)
      if (!ok) {
        return await reply
          .code(429)
          .header('Retry-After', String(retryAfterSec))
          .send({ error: 'RATE_LIMITED', message: '请求过于频繁，请稍后重试' })
      }
    },
  )

  app.register(authRoutes, { prefix: '/api/auth' })
  app.register(zjuamRoutes, { prefix: '/api/auth/zjuam' })
  app.register(passkeyRoutes, { prefix: '/api/auth/passkey' })
}

await fastify.register(async function publicLoginScope(app) {
  registerPublicLoginRoutes(app)
})

await fastify.register(classesRoutes, { prefix: '/api/classes' })
await fastify.register(settingsRoutes, { prefix: '/api/settings' })
await fastify.register(tokensRoutes, { prefix: '/api/tokens' })
await fastify.register(staffRoutes, { prefix: '/api/staff' })
await fastify.register(experimentsRoutes, { prefix: '/api/experiments' })
await fastify.register(questionsRoutes, { prefix: '/api/questions' })
await fastify.register(banksRoutes, { prefix: '/api/banks' })
await fastify.register(rosterRoutes, { prefix: '/api' })
await fastify.register(scoresRoutes, { prefix: '/api/scores' })
await fastify.register(checkoffRoutes, { prefix: '/api/checkoff' })
await fastify.register(studentPreviewRoutes, { prefix: '/api/student-preview' })
await fastify.register(mcpRoutes)

fastify.get('/api/health', async () => ({ ok: true }))

try {
  await fastify.listen({ port: env.port, host: '0.0.0.0' })
} catch (error) {
  fastify.log.error(error)
  process.exit(1)
}
