import type { FastifyReply, FastifyRequest } from 'fastify'

import { prisma } from './prisma.js'

declare module 'fastify' {
  interface FastifyRequest {
    /** 请求级缓存：当前用户所属班级 id 列表的在途查询 */
    classIdsCache?: Promise<string[]>
  }
}

/** 读取当前用户所属班级 id：单班模型下最多一个 */
export async function myClassIds(request: FastifyRequest): Promise<string[]> {
  if (request.classIdsCache) return request.classIdsCache

  const { sub } = request.user as { sub: string }
  const loading = (async () => {
    const me = await prisma.user.findUnique({ where: { id: sub }, select: { classId: true } })
    return me?.classId ? [me.classId] : []
  })()
  request.classIdsCache = loading
  return loading
}

const STAFF_ROLES = ['TA', 'TEACHER'] as const

/** 生成角色校验中间件，校验失败时直接发送 403 */
export function requireRoles(allowed: readonly string[], message = '无权操作') {
  const allowedSet = new Set(allowed)
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const { role } = request.user as { role?: string }
    if (typeof role !== 'string' || !allowedSet.has(role)) {
      return reply.code(403).send({ error: 'FORBIDDEN', message })
    }
  }
}

export const requireStaffRole = requireRoles(STAFF_ROLES)
export const requireStudentRole = requireRoles(['STUDENT'], '仅学生可操作')
export const requireTARole = requireRoles(['TA'], '仅助教可操作')
export const requireViewerRole = requireRoles(['VIEWER'], '仅观察者可操作')
export const requireViewerOrStaff = requireRoles(['VIEWER', ...STAFF_ROLES])
