import type { PersonalAccessToken } from '@prisma/client'
import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'

import { prisma } from '../lib/prisma'
import { isStaff } from '../lib/roles'
import { generateToken, MCP_SCOPES, parseScopes } from '../lib/tokens'

const createSchema = z.object({
  name: z.string().trim().min(1).max(64),
  scopes: z.array(z.enum(MCP_SCOPES)).min(1).max(MCP_SCOPES.length),
  expiresInDays: z.number().int().min(1).max(3650).optional(),
})

const auditQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).optional(),
})

/** 令牌对外结构（不含明文 / 哈希） */
function serializeToken(token: PersonalAccessToken) {
  return {
    id: token.id,
    name: token.name,
    prefix: token.prefix,
    scopes: parseScopes(token.scopes),
    expiresAt: token.expiresAt,
    revokedAt: token.revokedAt,
    lastUsedAt: token.lastUsedAt,
    createdAt: token.createdAt,
  }
}

export const tokensRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.addHook('onRequest', fastify.authenticate)
  fastify.addHook('onRequest', async (request, reply) => {
    const { role } = request.user as { role?: string }
    if (typeof role !== 'string' || !isStaff(role)) {
      reply.code(403).send({ error: 'FORBIDDEN', message: '无权操作' })
    }
  })

  /** 当前用户的令牌列表 */
  fastify.get('/', async (request) => {
    const { sub } = request.user as { sub: string }
    const tokens = await prisma.personalAccessToken.findMany({
      where: { userId: sub },
      orderBy: { createdAt: 'desc' },
    })
    return { tokens: tokens.map(serializeToken) }
  })

  /** 当前用户的 MCP 调用审计日志（倒序） */
  fastify.get('/audit', async (request) => {
    const { sub } = request.user as { sub: string }
    const parsed = auditQuerySchema.safeParse(request.query)
    const limit = parsed.success ? (parsed.data.limit ?? 50) : 50
    const logs = await prisma.mcpAuditLog.findMany({
      where: { userId: sub },
      orderBy: { createdAt: 'desc' },
      take: limit,
    })
    return {
      logs: logs.map((log) => ({
        id: log.id,
        tokenId: log.tokenId,
        tool: log.tool,
        ok: log.ok,
        message: log.message,
        createdAt: log.createdAt,
      })),
    }
  })

  /** 新建令牌：明文仅在本次响应返回 */
  fastify.post('/', async (request, reply) => {
    const parsed = createSchema.safeParse(request.body)
    if (!parsed.success) {
      return reply.code(400).send({ error: 'INVALID_BODY', message: '请求参数不正确' })
    }

    const { sub } = request.user as { sub: string }
    const { token, prefix, tokenHash } = generateToken()
    const expiresAt = parsed.data.expiresInDays
      ? new Date(Date.now() + parsed.data.expiresInDays * 24 * 60 * 60 * 1000)
      : null

    const record = await prisma.personalAccessToken.create({
      data: {
        userId: sub,
        name: parsed.data.name,
        prefix,
        tokenHash,
        scopes: JSON.stringify(parsed.data.scopes),
        expiresAt,
      },
    })

    return reply.code(201).send({ token, tokenRecord: serializeToken(record) })
  })

  /** 撤销令牌 */
  fastify.delete('/:id', async (request, reply) => {
    const { sub } = request.user as { sub: string }
    const { id } = request.params as { id: string }

    const existing = await prisma.personalAccessToken.findFirst({ where: { id, userId: sub } })
    if (!existing) {
      return reply.code(404).send({ error: 'TOKEN_NOT_FOUND', message: '令牌不存在' })
    }

    await prisma.personalAccessToken.update({
      where: { id },
      data: { revokedAt: new Date() },
    })

    return reply.send({ ok: true })
  })
}
