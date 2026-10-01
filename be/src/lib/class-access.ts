import type { FastifyReply, FastifyRequest } from 'fastify'

import { prisma } from './prisma'
import { isStaff } from './roles'

declare module 'fastify' {
  interface FastifyRequest {
    /** 请求级缓存：当前用户所属班级 id 列表的在途查询 */
    classIdsCache?: Promise<string[]>
  }
}

/** 读取当前用户所属班级 id 列表（请求级缓存，挂在 request 上避免重复查询） */
export async function myClassIds(request: FastifyRequest): Promise<string[]> {
  if (request.classIdsCache) return request.classIdsCache

  const { sub } = request.user as { sub: string }
  const loading = (async () => {
    const me = await prisma.user.findUnique({ where: { id: sub }, include: { classes: true } })
    return (me?.classes ?? []).map((c) => c.id)
  })()
  request.classIdsCache = loading
  return loading
}

/** 要求 staff 角色，否则发送 403 并返回 false */
export function requireStaff(request: FastifyRequest, reply: FastifyReply): boolean {
  const { role } = request.user as { role?: string }
  if (typeof role !== 'string' || !isStaff(role)) {
    reply.code(403).send({ error: 'FORBIDDEN', message: '无权操作' })
    return false
  }
  return true
}
