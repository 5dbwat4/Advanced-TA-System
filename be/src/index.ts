import 'dotenv/config'

import cors from '@fastify/cors'
import jwt from '@fastify/jwt'
import Fastify from 'fastify'

import { env } from './env'
import { createRealtime } from './lib/realtime'
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

fastify.decorate('authenticate', async (request, reply) => {
  try {
    await request.jwtVerify()
  } catch {
    return reply.code(401).send({ error: 'UNAUTHORIZED', message: '未登录或登录已过期' })
  }
})

createRealtime(fastify)

await fastify.register(classesRoutes, { prefix: '/api/classes' })
await fastify.register(authRoutes, { prefix: '/api/auth' })
await fastify.register(zjuamRoutes, { prefix: '/api/auth/zjuam' })
await fastify.register(passkeyRoutes, { prefix: '/api/auth/passkey' })
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
