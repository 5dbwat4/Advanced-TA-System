import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'

import { requireStaff } from '../lib/class-access'
import { prisma } from '../lib/prisma'

const querySchema = z.object({
  stuId: z.string().trim().min(1),
  experimentId: z.string().trim().min(1),
})

const saveSchema = z.object({
  stuId: z.string().trim().min(1),
  experimentId: z.string().trim().min(1),
  text: z.string().max(5000),
})

type RemarkWithEditor = {
  stuId: string
  experimentId: string
  text: string
  updatedById: string | null
  updatedBy: { name: string } | null
  updatedAt: Date
}

function toDto(remark: RemarkWithEditor) {
  return {
    stuId: remark.stuId,
    experimentId: remark.experimentId,
    text: remark.text,
    updatedById: remark.updatedById,
    updatedByName: remark.updatedBy?.name ?? null,
    updatedAt: remark.updatedAt,
  }
}

export const remarksRoutes: FastifyPluginAsync = async (fastify) => {
  /** 读取某学生某实验的备注 */
  fastify.get('/', { onRequest: [fastify.authenticate] }, async (request, reply) => {
    if (!requireStaff(request, reply)) return reply

    const parsed = querySchema.safeParse(request.query)
    if (!parsed.success) {
      return reply.code(400).send({ error: 'INVALID_QUERY', message: '查询参数不正确' })
    }

    const { stuId, experimentId } = parsed.data
    const remark = await prisma.remark.findUnique({
      where: { stuId_experimentId: { stuId, experimentId } },
      include: { updatedBy: { select: { name: true } } },
    })
    if (!remark) {
      return reply.send({ remark: null })
    }

    return reply.send({ remark: toDto(remark) })
  })

  /** 新建 / 更新备注（助教 / 教师） */
  fastify.put('/', { onRequest: [fastify.authenticate] }, async (request, reply) => {
    if (!requireStaff(request, reply)) return reply

    const parsed = saveSchema.safeParse(request.body)
    if (!parsed.success) {
      return reply.code(400).send({ error: 'INVALID_BODY', message: '请求参数不正确' })
    }

    const { stuId, experimentId, text } = parsed.data
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
      where: { stuId_experimentId: { stuId, experimentId } },
      update: { text, updatedById: sub },
      create: { stuId, experimentId, text, updatedById: sub },
      include: { updatedBy: { select: { name: true } } },
    })

    return reply.send({ remark: toDto(remark) })
  })
}
