import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'

import { myClassIds, requireStaffRole, requireViewerOrStaff } from '../lib/class-access.js'
import { prisma } from '../lib/prisma.js'
import { REMARK_TYPE_CHECKOFF, toRemarkDto } from '../lib/remark.js'
import { resolveStudentExperiment } from '../lib/student-experiment-access.js'

const querySchema = z.object({
  userId: z.string().trim().min(1),
  experimentId: z.string().trim().min(1),
  type: z.coerce.number().int().min(0),
})

const saveSchema = z.object({
  userId: z.string().trim().min(1),
  experimentId: z.string().trim().min(1),
  type: z.coerce.number().int().min(0).default(REMARK_TYPE_CHECKOFF),
  text: z.string().max(5000),
})

export const remarksRoutes: FastifyPluginAsync = async (fastify) => {
  /** 读取某学生某实验某类型的备注（观察者只读可见） */
  fastify.get('/', { onRequest: [fastify.authenticate, requireViewerOrStaff] }, async (request, reply) => {
    const parsed = querySchema.safeParse(request.query)
    if (!parsed.success) {
      return reply.code(400).send({ error: 'INVALID_QUERY', message: '查询参数不正确' })
    }

    const { userId, experimentId, type } = parsed.data
    if (!(await resolveStudentExperiment(request, reply, userId, experimentId))) return reply

    const remark = await prisma.remark.findUnique({
      where: { userId_experimentId_type: { userId, experimentId, type } },
      include: { updatedBy: { select: { name: true } } },
    })
    return reply.send({ remark: remark ? toRemarkDto(remark) : null })
  })

  /** 读取某实验下所有学生的附言（含全部类型），供「查看评语」页批量展示（观察者只读可见） */
  fastify.get(
    '/experiment/:experimentId',
    { onRequest: [fastify.authenticate, requireViewerOrStaff] },
    async (request, reply) => {
      const { experimentId } = request.params as { experimentId: string }
      const experiment = await prisma.experiment.findUnique({
        where: { id: experimentId },
        select: { classId: true },
      })
      if (!experiment) {
        return reply.code(404).send({ error: 'EXPERIMENT_NOT_FOUND', message: '实验不存在' })
      }
      const classIds = await myClassIds(request)
      if (!classIds.includes(experiment.classId)) {
        return reply.code(403).send({ error: 'FORBIDDEN', message: '无权访问该班级的实验' })
      }

      const remarks = await prisma.remark.findMany({
        where: { experimentId },
        include: { updatedBy: { select: { name: true } } },
      })
      return reply.send({ remarks: remarks.map(toRemarkDto) })
    },
  )

  /** 新建 / 更新备注（助教 / 教师） */
  fastify.put('/', { onRequest: [fastify.authenticate, requireStaffRole] }, async (request, reply) => {
    const parsed = saveSchema.safeParse(request.body)
    if (!parsed.success) {
      return reply.code(400).send({ error: 'INVALID_BODY', message: '请求参数不正确' })
    }

    const { userId, experimentId, type, text } = parsed.data
    const { sub } = request.user as { sub: string }
    if (!(await resolveStudentExperiment(request, reply, userId, experimentId))) return reply

    const remark = await prisma.remark.upsert({
      where: { userId_experimentId_type: { userId, experimentId, type } },
      update: { text, updatedById: sub },
      create: { userId, experimentId, type, text, updatedById: sub },
      include: { updatedBy: { select: { name: true } } },
    })
    return reply.send({ remark: toRemarkDto(remark) })
  })
}
