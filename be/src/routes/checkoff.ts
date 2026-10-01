import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'

import { compareExperimentMark, parseBankQuestions } from '../lib/banks'
import { myClassIds, requireStaff } from '../lib/class-access'
import { prisma } from '../lib/prisma'
import { emitScoreChange, type ScoreChangeEvent } from '../lib/realtime'
import { toScoreDto } from '../lib/score'

const submitSchema = z.object({
  experimentId: z.string().trim().min(1),
  stuId: z.string().trim().min(1),
  scores: z
    .array(
      z.object({
        type: z.number().int().min(0).max(2),
        score: z.number().min(0).max(100).nullable(),
      }),
    )
    .max(3),
})

export const checkoffRoutes: FastifyPluginAsync = async (fastify) => {
  /** 验收面板数据（实验 / 学生 / 已有分数，可内嵌指定实验的题目） */
  fastify.get('/', { onRequest: [fastify.authenticate] }, async (request, reply) => {
    if (!requireStaff(request, reply)) return reply

    const query = request.query as { classId?: unknown; experimentId?: unknown; includeQuestions?: unknown }
    const classId = typeof query.classId === 'string' ? query.classId : ''
    const experimentId =
      typeof query.experimentId === 'string' && query.experimentId.length > 0 ? query.experimentId : undefined
    const includeQuestions = query.includeQuestions === 'true' || query.includeQuestions === '1'

    const classIds = await myClassIds(request)
    if (!classId || !classIds.includes(classId)) {
      return reply.code(403).send({ error: 'FORBIDDEN', message: '无权访问该班级' })
    }

    const rows = await prisma.experiment.findMany({
      where: { classId },
      include: { questionBank: { select: { questions: true } } },
    })
    const experiments = rows
      .map((e) => ({
        id: e.id,
        mark: e.mark,
        title: e.title,
        classId: e.classId,
        questionCount: parseBankQuestions(e.questionBank?.questions).length,
      }))
      .sort((a, b) => compareExperimentMark(a.mark, b.mark))

    // 班级人数不多，一次返回完整名单供前端本地检索（含拼音）
    const students = await prisma.student.findMany({
      where: { classId },
      orderBy: { studentNo: 'asc' },
      select: { stuId: true, name: true, studentNo: true },
    })

    const scores =
      experimentId && students.length > 0
        ? await prisma.score.findMany({
            where: {
              stuId: { in: students.map((s) => s.stuId) },
              indId: experimentId,
              type: { in: [0, 1, 2] },
            },
            include: { grader: { select: { id: true, name: true } } },
          })
        : []

    let questions: { id: string; question: string; answer: string }[] | undefined
    if (includeQuestions && experimentId) {
      const experiment = await prisma.experiment.findUnique({
        where: { id: experimentId },
        select: { questionBankId: true },
      })
      const bank = experiment?.questionBankId
        ? await prisma.questionBank.findUnique({
            where: { id: experiment.questionBankId },
            select: { questions: true },
          })
        : null
      const ids = parseBankQuestions(bank?.questions)

      const questionRows =
        ids.length > 0
          ? await prisma.question.findMany({
              where: { id: { in: ids } },
              select: { id: true, question: true, answer: true },
            })
          : []
      const byId = new Map(questionRows.map((row) => [row.id, row]))
      questions = []
      for (const id of ids) {
        const row = byId.get(id)
        if (row) questions.push(row)
      }
    }

    return { experiments, students, scores: scores.map(toScoreDto), questions }
  })

  /** 实验题目列表（含答案） */
  fastify.get('/questions', { onRequest: [fastify.authenticate] }, async (request, reply) => {
    if (!requireStaff(request, reply)) return reply

    const query = request.query as { experimentId?: unknown }
    const experimentId = typeof query.experimentId === 'string' ? query.experimentId : ''

    const experiment = await prisma.experiment.findUnique({
      where: { id: experimentId },
      select: { id: true, classId: true, questionBankId: true },
    })
    if (!experiment) {
      return reply.code(404).send({ error: 'EXPERIMENT_NOT_FOUND', message: '实验不存在' })
    }

    const classIds = await myClassIds(request)
    if (!classIds.includes(experiment.classId)) {
      return reply.code(403).send({ error: 'FORBIDDEN', message: '无权访问该班级' })
    }

    const bank = experiment.questionBankId
      ? await prisma.questionBank.findUnique({
          where: { id: experiment.questionBankId },
          select: { questions: true },
        })
      : null
    const ids = parseBankQuestions(bank?.questions)

    const rows =
      ids.length > 0
        ? await prisma.question.findMany({
            where: { id: { in: ids } },
            select: { id: true, question: true, answer: true },
          })
        : []
    const byId = new Map(rows.map((row) => [row.id, row]))
    const questions: { id: string; question: string; answer: string }[] = []
    for (const id of ids) {
      const row = byId.get(id)
      if (row) questions.push(row)
    }

    return { questions }
  })

  /** 提交验收成绩（助教 / 教师） */
  fastify.post('/', { onRequest: [fastify.authenticate] }, async (request, reply) => {
    if (!requireStaff(request, reply)) return reply
    const { sub } = request.user as { sub: string }

    const parsed = submitSchema.safeParse(request.body)
    if (!parsed.success) {
      return reply.code(400).send({ error: 'INVALID_BODY', message: '请求参数不正确' })
    }

    const { experimentId, stuId, scores } = parsed.data

    const student = await prisma.student.findUnique({ where: { stuId } })
    if (!student) {
      return reply.code(404).send({ error: 'STUDENT_NOT_FOUND', message: '学生不存在' })
    }

    const classIds = await myClassIds(request)
    if (!classIds.includes(student.classId)) {
      return reply.code(403).send({ error: 'FORBIDDEN', message: '无权修改该班级成绩' })
    }

    const experiment = await prisma.experiment.findUnique({ where: { id: experimentId } })
    if (!experiment) {
      return reply.code(404).send({ error: 'EXPERIMENT_NOT_FOUND', message: '实验不存在' })
    }
    if (experiment.classId !== student.classId) {
      return reply.code(400).send({ error: 'CLASS_MISMATCH', message: '实验与学生不属于同一班级' })
    }

    const events: ScoreChangeEvent[] = []

    await prisma.$transaction(async (tx) => {
      for (const item of scores) {
        if (item.score === null) {
          await tx.score.deleteMany({ where: { stuId, type: item.type, indId: experimentId } })
          events.push({
            action: 'delete',
            classId: student.classId,
            stuId,
            type: item.type,
            indId: experimentId,
          })
          continue
        }

        const saved = await tx.score.upsert({
          where: { stuId_type_indId: { stuId, type: item.type, indId: experimentId } },
          update: { labId: experimentId, score: item.score, graderId: sub },
          create: {
            stuId,
            type: item.type,
            indId: experimentId,
            labId: experimentId,
            score: item.score,
            graderId: sub,
          },
          include: { grader: { select: { id: true, name: true } } },
        })
        events.push({ action: 'upsert', classId: student.classId, score: toScoreDto(saved) })
      }
    })

    for (const event of events) {
      emitScoreChange(student.classId, event)
    }

    return reply.send({ ok: true })
  })
}
