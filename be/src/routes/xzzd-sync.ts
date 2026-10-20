import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from 'fastify'
import { z } from 'zod'

import { myClassIds, requireStaff } from '../lib/class-access.js'
import { prisma } from '../lib/prisma.js'
import { emitScoreChange } from '../lib/realtime.js'
import { toScoreDto } from '../lib/score.js'
import {
  buildXzzdSyncRows,
  summarizeXzzdSyncRows,
  xzzdSyncAction,
  type XzzdSyncMode,
} from '../lib/xzzd-sync.js'
import { fetchHomeworkSyncData, listHomeworkActivities } from '../lib/zjuam.js'
import { resolveZjuamCredentials, sendZjuamError } from '../lib/zjuam-resolve.js'

const mappingSchema = z
  .object({
    sourceMin: z.number().finite().min(-1000).max(1000),
    sourceMax: z.number().finite().min(-1000).max(1000),
    targetMin: z.number().finite().min(-1000).max(1000),
    targetMax: z.number().finite().min(-1000).max(1000),
  })
  .refine((value) => value.sourceMin !== value.sourceMax, {
    message: '原成绩始末不能相同',
  })
  .refine((value) => value.targetMin !== value.targetMax, {
    message: '目标成绩始末不能相同',
  })

const previewSchema = z.object({
  activityId: z.string().trim().min(1).max(64),
  type: z.number().int().min(0).max(2),
  mapping: mappingSchema.nullable().optional(),
  account: z.string().trim().min(1).max(64).optional(),
  password: z.string().trim().min(1).max(128).optional(),
})

const applySchema = previewSchema.extend({
  mode: z.enum(['onlyEmpty', 'overwrite']).default('onlyEmpty'),
})

type SyncContext = {
  experiment: {
    id: string
    mark: string
    title: string
    classId: string
  }
  courseId: string
  activityId: string
  type: number
  mapping: {
    sourceMin: number
    sourceMax: number
    targetMin: number
    targetMax: number
  } | null
  account: string
  password: string
  staffId: string
}

async function resolveContext(
  request: FastifyRequest,
  reply: FastifyReply,
  body: unknown,
): Promise<SyncContext | null> {
  if (!requireStaff(request, reply)) return null

  const { id } = request.params as { id: string }
  const experiment = await prisma.experiment.findUnique({
    where: { id },
    include: { klass: { select: { xzzdClassId: true } } },
  })
  if (!experiment) {
    reply.code(404).send({ error: 'EXPERIMENT_NOT_FOUND', message: '实验不存在' })
    return null
  }

  const classIds = await myClassIds(request)
  if (!classIds.includes(experiment.classId)) {
    reply.code(403).send({ error: 'FORBIDDEN', message: '无权操作该班级的实验' })
    return null
  }

  const courseId = experiment.klass?.xzzdClassId
  if (!courseId) {
    reply.code(400).send({ error: 'XZZD_CLASS_ID_MISSING', message: '该班级未绑定学在浙大课程' })
    return null
  }

  const parsed = previewSchema.safeParse(body ?? {})
  if (!parsed.success) {
    reply.code(400).send({ error: 'INVALID_BODY', message: '请求参数不正确' })
    return null
  }

  const { sub } = request.user as { sub: string }
  const credentials = await resolveZjuamCredentials(sub, parsed.data)
  if (!credentials) {
    reply
      .code(400)
      .send({ error: 'ZJUAM_CREDENTIALS_MISSING', message: '请先保存浙大统一身份认证账号和密码' })
    return null
  }

  return {
    experiment: {
      id: experiment.id,
      mark: experiment.mark,
      title: experiment.title,
      classId: experiment.classId,
    },
    courseId,
    activityId: parsed.data.activityId,
    type: parsed.data.type,
    mapping: parsed.data.mapping ?? null,
    account: credentials.account,
    password: credentials.password,
    staffId: sub,
  }
}

async function findActivity(
  context: SyncContext,
  reply: FastifyReply,
): Promise<{ id: number; title: string; endTime: string | null; isClosed: boolean; hasScoreCount: number } | null> {
  const activities = await listHomeworkActivities(
    context.account,
    context.password,
    context.courseId,
  )
  const activity = activities.find((item) => String(item.id) === context.activityId)
  if (!activity) {
    reply.code(404).send({ error: 'XZZD_HOMEWORK_NOT_FOUND', message: '学在浙大中未找到该作业' })
    return null
  }
  return activity
}

async function loadLocalState(experimentId: string, classId: string, type: number) {
  const [students, scores, cache] = await Promise.all([
    prisma.user.findMany({
      where: { classId, role: 'STUDENT', status: 'ACTIVE' },
      select: { id: true, name: true, studentId: true },
      orderBy: [{ studentId: 'asc' }, { name: 'asc' }],
    }),
    prisma.score.findMany({
      where: { labId: experimentId, type },
      select: { userId: true, score: true },
    }),
    prisma.xzzdHomework.findUnique({
      where: { id: experimentId },
      select: { lastXzzdDownSyncAt: true },
    }),
  ])

  return {
    localStudents: students.map((student) => ({
      userId: student.id,
      name: student.name,
      studentId: student.studentId ?? '',
    })),
    localScores: new Map(scores.map((row) => [row.userId, row.score])),
    lastSyncAt: cache?.lastXzzdDownSyncAt ?? null,
  }
}

export const xzzdSyncRoutes: FastifyPluginAsync = async (fastify) => {
  /** 预览：拉取学在浙大旧作业成绩并映射到本地学生，不写库 */
  fastify.post(
    '/:id/xzzd-sync/preview',
    { onRequest: [fastify.authenticate] },
    async (request, reply) => {
      const context = await resolveContext(request, reply, request.body)
      if (!context) return reply

      try {
        const activity = await findActivity(context, reply)
        if (!activity) return reply

        const [data, local] = await Promise.all([
          fetchHomeworkSyncData(
            context.account,
            context.password,
            context.courseId,
            context.activityId,
          ),
          loadLocalState(context.experiment.id, context.experiment.classId, context.type),
        ])

        const rows = buildXzzdSyncRows({
          activityId: context.activityId,
          localStudents: local.localStudents,
          upstreamStudents: data.students,
          homeworkScores: data.homeworkScores,
          localScores: local.localScores,
          mapping: context.mapping,
        })

        return reply.send({
          activity: {
            id: String(activity.id),
            title: activity.title,
            endTime: activity.endTime,
            isClosed: activity.isClosed,
            hasScoreCount: activity.hasScoreCount,
          },
          experiment: context.experiment,
          type: context.type,
          lastSyncAt: local.lastSyncAt,
          rows,
        })
      } catch (error) {
        return sendZjuamError(reply, error)
      }
    },
  )

  /** 执行同步：重新拉取上游数据并按冲突策略写入本地成绩 */
  fastify.post(
    '/:id/xzzd-sync/apply',
    { onRequest: [fastify.authenticate] },
    async (request, reply) => {
      const parsedApply = applySchema.safeParse(request.body ?? {})
      if (!parsedApply.success) {
        return reply.code(400).send({ error: 'INVALID_BODY', message: '请求参数不正确' })
      }

      const context = await resolveContext(request, reply, parsedApply.data)
      if (!context) return reply

      const mode = parsedApply.data.mode as XzzdSyncMode

      try {
        const activity = await findActivity(context, reply)
        if (!activity) return reply

        const [data, local] = await Promise.all([
          fetchHomeworkSyncData(
            context.account,
            context.password,
            context.courseId,
            context.activityId,
          ),
          loadLocalState(context.experiment.id, context.experiment.classId, context.type),
        ])

        const rows = buildXzzdSyncRows({
          activityId: context.activityId,
          localStudents: local.localStudents,
          upstreamStudents: data.students,
          homeworkScores: data.homeworkScores,
          localScores: local.localScores,
          mapping: context.mapping,
        })
        const summary = summarizeXzzdSyncRows(rows, mode)

        const writes = rows.flatMap((row) => {
          const decision = xzzdSyncAction(row, mode)
          if (!row.userId || row.upstreamScore == null) return []
          if (decision.action !== 'create' && decision.action !== 'update') return []
          return [{ userId: row.userId, score: row.upstreamScore }]
        })

        if (writes.length === 0) {
          return reply.send({ ...summary, lastSyncAt: null })
        }

        const syncedAt = new Date()
        const saved = await prisma.$transaction(async (tx) => {
          const result = []
          for (const item of writes) {
            const score = await tx.score.upsert({
              where: {
                userId_type_indId: {
                  userId: item.userId,
                  type: context.type,
                  indId: context.experiment.id,
                },
              },
              update: {
                labId: context.experiment.id,
                score: item.score,
                graderId: context.staffId,
              },
              create: {
                userId: item.userId,
                type: context.type,
                indId: context.experiment.id,
                labId: context.experiment.id,
                score: item.score,
                graderId: context.staffId,
              },
              include: { grader: { select: { id: true, name: true } } },
            })
            result.push(score)
          }

          await tx.xzzdHomework.upsert({
            where: { id: context.experiment.id },
            create: { id: context.experiment.id, lastXzzdDownSyncAt: syncedAt },
            update: { lastXzzdDownSyncAt: syncedAt },
          })

          return result
        })

        for (const score of saved) {
          emitScoreChange(context.experiment.classId, {
            action: 'upsert',
            classId: context.experiment.classId,
            score: toScoreDto(score),
          })
        }

        return reply.send({ ...summary, lastSyncAt: syncedAt.toISOString() })
      } catch (error) {
        return sendZjuamError(reply, error)
      }
    },
  )
}
