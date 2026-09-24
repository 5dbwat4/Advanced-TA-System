import type { FastifyReply, FastifyRequest } from 'fastify'

import { prisma } from '../lib/prisma'
import { isStaff } from '../lib/roles'
import { hashToken, parseScopes, parseToken } from '../lib/tokens'

/** 单次 MCP 请求的调用主体 */
export type McpPrincipal = {
  userId: string
  name: string
  role: string
  tokenId: string
  scopes: Set<string>
  classIds: string[]
}

/**
 * 返回 401。当前仅支持 PAT（静态 Bearer），因此**不** advertise OAuth 的
 * resource_metadata —— 否则会自动探测 OAuth 的客户端会顺着发现流程失败。
 * 将来实现 OAuth 时，这里应加上 `resource_metadata="..."`。
 */
function unauthorized(reply: FastifyReply, message: string): void {
  reply.header('WWW-Authenticate', 'Bearer').code(401).send({ error: 'UNAUTHORIZED', message })
}

/**
 * 从 `Authorization: Bearer <token>` 解析 MCP 调用主体。
 * 校验失败时已写入响应，返回 null。
 */
export async function resolveMcpPrincipal(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<McpPrincipal | null> {
  const header = request.headers.authorization
  const token =
    typeof header === 'string' && header.startsWith('Bearer ') ? header.slice(7).trim() : ''
  if (!token) {
    unauthorized(reply, '缺少访问令牌')
    return null
  }

  const parsed = parseToken(token)
  if (!parsed) {
    unauthorized(reply, '访问令牌格式不正确')
    return null
  }

  const record = await prisma.personalAccessToken.findUnique({
    where: { tokenHash: hashToken(parsed.secret) },
    include: { user: { include: { classes: { select: { id: true } } } } },
  })
  if (!record || record.prefix !== parsed.prefix) {
    unauthorized(reply, '访问令牌无效')
    return null
  }
  if (record.revokedAt) {
    unauthorized(reply, '访问令牌已被撤销')
    return null
  }
  if (record.expiresAt && record.expiresAt.getTime() <= Date.now()) {
    unauthorized(reply, '访问令牌已过期')
    return null
  }
  if (!isStaff(record.user.role)) {
    reply.code(403).send({ error: 'FORBIDDEN', message: '无权访问 MCP' })
    return null
  }

  void prisma.personalAccessToken
    .update({ where: { id: record.id }, data: { lastUsedAt: new Date() } })
    .catch(() => undefined)

  return {
    userId: record.userId,
    name: record.user.name,
    role: record.user.role,
    tokenId: record.id,
    scopes: new Set(parseScopes(record.scopes)),
    classIds: record.user.classes.map((c) => c.id),
  }
}

/** 校验 scope，不足时抛错（由 MCP 层转换为工具错误） */
export function requireScope(principal: McpPrincipal, scope: string): void {
  if (!principal.scopes.has(scope)) {
    throw new Error(`缺少授权范围：${scope}`)
  }
}

/** 写入 MCP 调用审计日志（失败不影响调用） */
export async function audit(
  principal: McpPrincipal | null,
  tool: string,
  ok: boolean,
  message?: string,
): Promise<void> {
  try {
    await prisma.mcpAuditLog.create({
      data: {
        userId: principal?.userId,
        tokenId: principal?.tokenId,
        tool,
        ok,
        message,
      },
    })
  } catch {
    // ignore
  }
}
