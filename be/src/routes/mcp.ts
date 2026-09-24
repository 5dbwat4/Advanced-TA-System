import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from 'fastify'

import { resolveMcpPrincipal } from '../mcp/principal'
import { checkRateLimit } from '../mcp/rate-limit'
import { buildMcpServer } from '../mcp/server'

/** Origin 校验：防止 DNS rebinding（非浏览器请求放行，同源放行） */
function originAllowed(request: FastifyRequest): boolean {
  const origin = request.headers.origin
  if (!origin || origin === 'null') return true
  try {
    return new URL(origin).host === request.headers.host
  } catch {
    return false
  }
}

export const mcpRoutes: FastifyPluginAsync = async (fastify) => {
  const handler = async (request: FastifyRequest, reply: FastifyReply) => {
    if (!originAllowed(request)) {
      return reply.code(403).send({ error: 'FORBIDDEN', message: 'Origin 校验失败' })
    }

    const principal = await resolveMcpPrincipal(request, reply)
    if (!principal) return

    const limit = checkRateLimit(principal.tokenId)
    if (!limit.ok) {
      return reply
        .code(429)
        .header('Retry-After', String(limit.retryAfterSec))
        .send({ error: 'RATE_LIMITED', message: '请求过于频繁，请稍后重试' })
    }

    reply.hijack()

    const server = buildMcpServer(principal)
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    })

    const cleanup = () => {
      void transport.close().catch(() => undefined)
      void server.close().catch(() => undefined)
    }
    reply.raw.on('close', cleanup)

    try {
      await server.connect(transport)
      await transport.handleRequest(request.raw, reply.raw, request.body)
    } catch (error) {
      request.log.error(error)
      cleanup()
      if (!reply.raw.headersSent) {
        reply.raw.writeHead(500, { 'content-type': 'application/json' })
        reply.raw.end(
          JSON.stringify({
            jsonrpc: '2.0',
            id: null,
            error: { code: -32603, message: 'Internal error' },
          }),
        )
      }
    }
  }

  fastify.route({ method: ['POST', 'GET', 'DELETE'], url: '/mcp', handler })
}
