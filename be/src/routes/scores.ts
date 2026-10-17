import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'

import { myClassIds, requireStaff } from '../lib/class-access'
import { prisma } from '../lib/prisma'
import { emitReportScore, emitScoreChange } from '../lib/realtime'
import { toScoreDto } from '../lib/score'

const putScoreSchema = z.object({
  userId: z.string().trim().min(1),
  type: z.number().int().min(0).max(3),
  indId: z.string().trim().min(1),
  score: z.number().min(-1000).max(1000),
})

const deleteScoreSchema = z.object({
  userId: z.string().trim().min(1),
  type: z.number().int().min(0).max(3),
  indId: z.string().trim().min(1),
})

const listScoresQuerySchema = z.object({
  classId: z.string().trim().min(1).optional(),
})

export const scoresRoutes: FastifyPluginAsync = async (fastify) => {
  /** 分数列表（仅当前用户所属班级，可按 classId 过滤） */
  fastify.get('/', { onRequest: [fastify.authenticate] }, async (request, reply) => {
    const parsedQuery = listScoresQuerySchema.safeParse(request.query)
    if (!parsedQuery.success) {
      return reply.code(400).send({ error: 'INVALID_QUERY', message: '查询参数不正确' })
    }
    const classId = parsedQuery.data.classId

    if (classId) {
      const classIds = await myClassIds(request)
      if (!classIds.includes(classId)) {
        return reply.code(403).send({ error: 'FORBIDDEN', message: '无权访问该班级' })
      }

      const scores = await prisma.score.findMany({
        where: { student: { classId } },
        orderBy: [{ userId: 'asc' }, { type: 'asc' }, { indId: 'asc' }],
        include: { grader: { select: { id: true, name: true } } },
      })
      return { scores: scores.map(toScoreDto) }
    }

    const classIds = await myClassIds(request)
    if (classIds.length === 0) {
      return { scores: [] }
    }

    const students = await prisma.user.findMany({
      where: { classId: { in: classIds }, role: 'STUDENT', status: 'ACTIVE' },
      select: { id: true },
    })
    const studentIds = students.map((s) => s.id)

    const scores = await prisma.score.findMany({
      where: { userId: { in: studentIds } },
      orderBy: [{ userId: 'asc' }, { type: 'asc' }, { indId: 'asc' }],
      include: { grader: { select: { id: true, name: true } } },
    })
    return { scores: scores.map(toScoreDto) }
  })

  /** 新建 / 更新分数（助教 / 教师） */
  fastify.put('/', { onRequest: [fastify.authenticate] }, async (request, reply) => {
    if (!requireStaff(request, reply)) return reply
    const { sub } = request.user as { sub: string }

    const parsed = putScoreSchema.safeParse(request.body)
    if (!parsed.success) {
      return reply.code(400).send({ error: 'INVALID_BODY', message: '请求参数不正确' })
    }

    const { userId, type, indId, score } = parsed.data

    const student = await prisma.user.findFirst({
      where: { id: userId, role: 'STUDENT', status: 'ACTIVE' },
    })
    if (!student || !student.classId) {
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
      if (experiment.classId !== student.classId) {
        return reply.code(400).send({ error: 'CLASS_MISMATCH', message: '实验与学生不属于同一班级' })
      }
      labId = indId
    }

    const saved = await prisma.score.upsert({
      where: { userId_type_indId: { userId, type, indId } },
      update: { labId, score, graderId: sub },
      create: { userId, type, indId, labId, score, graderId: sub },
      include: { grader: { select: { id: true, name: true } } },
    })

    emitScoreChange(student.classId, {
      action: 'upsert',
      classId: student.classId,
      score: toScoreDto(saved),
    })
    if (type === 2) {
      emitReportScore(indId, userId, toScoreDto(saved), sub, saved.grader?.name ?? '')
    }

    return reply.send({ score: toScoreDto(saved) })
  })

  /** 删除分数（助教 / 教师） */
  fastify.delete('/', { onRequest: [fastify.authenticate] }, async (request, reply) => {
    if (!requireStaff(request, reply)) return reply
    const { sub } = request.user as { sub: string }

    const parsed = deleteScoreSchema.safeParse(request.body)
    if (!parsed.success) {
      return reply.code(400).send({ error: 'INVALID_BODY', message: '请求参数不正确' })
    }

    const { userId, type, indId } = parsed.data

    const existing = await prisma.score.findUnique({
      where: { userId_type_indId: { userId, type, indId } },
    })
    if (!existing) {
      return reply.code(404).send({ error: 'SCORE_NOT_FOUND', message: '分数不存在' })
    }

    const student = await prisma.user.findFirst({
      where: { id: userId, role: 'STUDENT', status: 'ACTIVE' },
    })
    if (!student || !student.classId) {
      return reply.code(404).send({ error: 'STUDENT_NOT_FOUND', message: '学生不存在' })
    }

    const classIds = await myClassIds(request)
    if (!classIds.includes(student.classId)) {
      return reply.code(403).send({ error: 'FORBIDDEN', message: '无权修改该班级成绩' })
    }

    await prisma.score.delete({
      where: { userId_type_indId: { userId, type, indId } },
    })

    emitScoreChange(student.classId, { action: 'delete', classId: student.classId, userId, type, indId })
    if (type === 2) {
      emitReportScore(indId, userId, null, sub, '')
    }

    return reply.send({ ok: true })
  })
}
