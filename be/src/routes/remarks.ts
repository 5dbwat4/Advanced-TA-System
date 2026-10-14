import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'

import { myClassIds, requireStaff } from '../lib/class-access'
import { prisma } from '../lib/prisma'
import { REMARK_TYPE_CHECKOFF, toRemarkDto } from '../lib/remark'

const querySchema = z.object({
  stuId: z.string().trim().min(1),
  experimentId: z.string().trim().min(1),
  type: z.coerce.number().int().min(0),
})

const saveSchema = z.object({
  stuId: z.string().trim().min(1),
  experimentId: z.string().trim().min(1),
  type: z.coerce.number().int().min(0).default(REMARK_TYPE_CHECKOFF),
  text: z.string().max(5000),
})

export const remarksRoutes: FastifyPluginAsync = async (fastify) => {
  /** 读取某学生某实验某类型的备注 */
  fastify.get('/', { onRequest: [fastify.authenticate] }, async (request, reply) => {
    if (!requireStaff(request, reply)) return reply

    const parsed = querySchema.safeParse(request.query)
    if (!parsed.success) {
      return reply.code(400).send({ error: 'INVALID_QUERY', message: '查询参数不正确' })
    }

    const { stuId, experimentId, type } = parsed.data
    const remark = await prisma.remark.findUnique({
      where: { stuId_experimentId_type: { stuId, experimentId, type } },
      include: { updatedBy: { select: { name: true } } },
    })
    if (!remark) {
      return reply.send({ remark: null })
    }

    return reply.send({ remark: toRemarkDto(remark) })
  })

  /** 读取某实验下所有学生的附言（含全部类型），供「查看评语」页批量展示 */
  fastify.get(
    '/experiment/:experimentId',
    { onRequest: [fastify.authenticate] },
    async (request, reply) => {
      if (!requireStaff(request, reply)) return reply

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
  fastify.put('/', { onRequest: [fastify.authenticate] }, async (request, reply) => {
    if (!requireStaff(request, reply)) return reply

    const parsed = saveSchema.safeParse(request.body)
    if (!parsed.success) {
      return reply.code(400).send({ error: 'INVALID_BODY', message: '请求参数不正确' })
    }

    const { stuId, experimentId, type, text } = parsed.data
    const { sub } = request.user as { sub: string }

    const student = await prisma.student.findUnique({ where: { stuId } })
    if (!student) {
      return reply.code(404).send({ error: 'STUDENT_NOT_FOUND', message: '学生不存在' })
    }
    const experiment = await prisma.experiment.findUnique({ where: { id: experimentId } })
    if (!experiment) {
      return reply.code(404).send({ error: 'EXPERIMENT_NOT_FOUND', message: '实验不存在' })
    }

    const remark = await prisma.remark.upsert({
      where: { stuId_experimentId_type: { stuId, experimentId, type } },
      update: { text, updatedById: sub },
      create: { stuId, experimentId, type, text, updatedById: sub },
      include: { updatedBy: { select: { name: true } } },
    })

    return reply.send({ remark: toRemarkDto(remark) })
  })
}
