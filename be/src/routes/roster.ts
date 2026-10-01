import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'

import { myClassIds } from '../lib/class-access'
import { prisma } from '../lib/prisma'

const studentsQuerySchema = z.object({
  classId: z.string().trim().min(1).optional(),
})

export const rosterRoutes: FastifyPluginAsync = async (fastify) => {
  /** 班级列表 */
  fastify.get('/classes', { onRequest: [fastify.authenticate] }, async () => {
    const classes = await prisma.class.findMany({
      orderBy: [{ type: 'asc' }, { name: 'asc' }],
    })
    return { classes }
  })

  /** 学生列表（含所属班级，仅当前用户所属班级，可按 classId 过滤） */
  fastify.get('/students', { onRequest: [fastify.authenticate] }, async (request, reply) => {
    const parsedQuery = studentsQuerySchema.safeParse(request.query)
    if (!parsedQuery.success) {
      return reply.code(400).send({ error: 'INVALID_QUERY', message: '查询参数不正确' })
    }
    const filterClassId = parsedQuery.data.classId

    const classIds = await myClassIds(request)

    if (filterClassId) {
      if (!classIds.includes(filterClassId)) {
        return reply.code(403).send({ error: 'FORBIDDEN', message: '无权访问该班级' })
      }

      const students = await prisma.student.findMany({
        where: { classId: filterClassId },
        include: { klass: { select: { id: true, name: true, type: true, xzzdClassId: true } } },
        orderBy: [{ studentNo: 'asc' }, { classId: 'asc' }],
      })
      return { students }
    }

    if (classIds.length === 0) {
      return { students: [] }
    }

    const students = await prisma.student.findMany({
      where: { classId: { in: classIds } },
      include: { klass: { select: { id: true, name: true, type: true, xzzdClassId: true } } },
      orderBy: [{ studentNo: 'asc' }, { classId: 'asc' }],
    })
    return { students }
  })
}
