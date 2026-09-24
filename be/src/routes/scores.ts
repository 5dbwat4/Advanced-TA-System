import type { FastifyPluginAsync, FastifyRequest } from 'fastify'
import { z } from 'zod'

import { prisma } from '../lib/prisma'
import { emitScoreChange } from '../lib/realtime'
import { isStaff } from '../lib/roles'
import { toScoreDto } from '../lib/score'

const putScoreSchema = z.object({
  stuId: z.string().trim().min(1),
  type: z.number().int().min(0).max(3),
  indId: z.string().trim().min(1),
  score: z.number().min(0).max(100),
})

const deleteScoreSchema = z.object({
  stuId: z.string().trim().min(1),
  type: z.number().int().min(0).max(3),
  indId: z.string().trim().min(1),
})

export const scoresRoutes: FastifyPluginAsync = async (fastify) => {
  /** 读取当前用户所属班级 id 列表 */
  async function myClassIds(request: FastifyRequest): Promise<string[]> {
    const { sub } = request.user as { sub: string }
    const me = await prisma.user.findUnique({ where: { id: sub }, include: { classes: true } })
    return (me?.classes ?? []).map((c) => c.id)
  }

  /** 分数列表（仅当前用户所属班级） */
  fastify.get('/', { onRequest: [fastify.authenticate] }, async (request) => {
    const classIds = await myClassIds(request)
    if (classIds.length === 0) {
      return { scores: [] }
    }

    const students = await prisma.student.findMany({
      where: { classId: { in: classIds } },
      select: { stuId: true },
    })
    const studentIds = students.map((s) => s.stuId)

    const scores = await prisma.score.findMany({
      where: { stuId: { in: studentIds } },
      orderBy: [{ stuId: 'asc' }, { type: 'asc' }, { indId: 'asc' }],
      include: { grader: { select: { id: true, name: true } } },
    })
    return { scores: scores.map(toScoreDto) }
  })

  /** 新建 / 更新分数（助教 / 教师） */
  fastify.put('/', { onRequest: [fastify.authenticate] }, async (request, reply) => {
    const { sub, role } = request.user as { sub: string; role?: string }
    if (typeof role !== 'string' || !isStaff(role)) {
      return reply.code(403).send({ error: 'FORBIDDEN', message: '无权操作' })
    }

    const parsed = putScoreSchema.safeParse(request.body)
    if (!parsed.success) {
      return reply.code(400).send({ error: 'INVALID_BODY', message: '请求参数不正确' })
    }

    const { stuId, type, indId, score } = parsed.data

    const student = await prisma.student.findUnique({ where: { stuId } })
    if (!student) {
      return reply.code(404).send({ error: 'STUDENT_NOT_FOUND', message: '学生不存在' })
    }

    const classIds = await myClassIds(request)
    if (!classIds.includes(student.classId)) {
      return reply.code(403).send({ error: 'FORBIDDEN', message: '无权修改该班级成绩' })
    }

    let labId: string | null = null
    if (type !== 3) {
      const experiment = await prisma.experiment.findUnique({ where: { id: indId } })
      if (!experiment) {
        return reply.code(404).send({ error: 'EXPERIMENT_NOT_FOUND', message: '实验不存在' })
      }
      labId = indId
    }

    const saved = await prisma.score.upsert({
      where: { stuId_type_indId: { stuId, type, indId } },
      update: { labId, score, graderId: sub },
      create: { stuId, type, indId, labId, score, graderId: sub },
      include: { grader: { select: { id: true, name: true } } },
    })

    emitScoreChange(student.classId, {
      action: 'upsert',
      classId: student.classId,
      score: toScoreDto(saved),
    })

    return reply.send({ score: toScoreDto(saved) })
  })

  /** 删除分数（助教 / 教师） */
  fastify.delete('/', { onRequest: [fastify.authenticate] }, async (request, reply) => {
    const { role } = request.user as { role?: string }
    if (typeof role !== 'string' || !isStaff(role)) {
      return reply.code(403).send({ error: 'FORBIDDEN', message: '无权操作' })
    }

    const parsed = deleteScoreSchema.safeParse(request.body)
    if (!parsed.success) {
      return reply.code(400).send({ error: 'INVALID_BODY', message: '请求参数不正确' })
    }

    const { stuId, type, indId } = parsed.data

    const existing = await prisma.score.findUnique({
      where: { stuId_type_indId: { stuId, type, indId } },
    })
    if (!existing) {
      return reply.code(404).send({ error: 'SCORE_NOT_FOUND', message: '分数不存在' })
    }

    const student = await prisma.student.findUnique({ where: { stuId } })
    if (!student) {
      return reply.code(404).send({ error: 'STUDENT_NOT_FOUND', message: '学生不存在' })
    }

    const classIds = await myClassIds(request)
    if (!classIds.includes(student.classId)) {
      return reply.code(403).send({ error: 'FORBIDDEN', message: '无权修改该班级成绩' })
    }

    await prisma.score.delete({
      where: { stuId_type_indId: { stuId, type, indId } },
    })

    emitScoreChange(student.classId, { action: 'delete', classId: student.classId, stuId, type, indId })

    return reply.send({ ok: true })
  })
}
