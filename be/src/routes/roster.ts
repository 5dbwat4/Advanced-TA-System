import type { FastifyPluginAsync } from 'fastify'

import { prisma } from '../lib/prisma'

export const rosterRoutes: FastifyPluginAsync = async (fastify) => {
  /** 班级列表 */
  fastify.get('/classes', { onRequest: [fastify.authenticate] }, async () => {
    const classes = await prisma.class.findMany({
      orderBy: [{ type: 'asc' }, { name: 'asc' }],
    })
    return { classes }
  })

  /** 学生列表（含所属班级，仅当前用户所属班级） */
  fastify.get('/students', { onRequest: [fastify.authenticate] }, async (request) => {
    const { sub } = request.user as { sub: string }
    const me = await prisma.user.findUnique({ where: { id: sub }, include: { classes: true } })
    const classIds = (me?.classes ?? []).map((c) => c.id)

    if (classIds.length === 0) {
      return { students: [] }
    }

    const students = await prisma.student.findMany({
      where: { classId: { in: classIds } },
      include: { klass: true },
      orderBy: [{ studentNo: 'asc' }, { classId: 'asc' }],
    })
    return { students }
  })
}
