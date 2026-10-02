import { Prisma } from '@prisma/client'
import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from 'fastify'
import { z } from 'zod'

import { compareExperimentMark } from '../lib/banks'
import { myClassIds, requireStaff } from '../lib/class-access'
import { prisma } from '../lib/prisma'
import { studentViewUrl as buildStudentViewUrl } from '../lib/student-view'
import {
  assemblePushTargets,
  isSameAsUpstream,
  parseClassSettings,
  resolveScoreRatio,
} from '../lib/xzzd-push'
import {
  fetchCourseStudents,
  fetchHomeworkScores,
  fetchHomeworkSubmissions,
  fetchHomeworkSyncData,
  fetchStudentSubmissionAttachments,
  listHomeworkActivities,
  pushSubmissionScore,
  type ZjuamHomeworkSubmission,
  ZjuamError,
} from '../lib/zjuam'
import { resolveZjuamCredentials, sendZjuamError } from '../lib/zjuam-resolve'

/** 时间线字段（ISO 8601 字符串，null 表示清空） */
const timelineFields = {
  publishTime: z.string().datetime({ offset: true }).nullish(),
  checkoffDeadline: z.string().datetime({ offset: true }).nullish(),
  reportDeadline: z.string().datetime({ offset: true }).nullish(),
}

const createExperimentSchema = z.object({
  mark: z.string().trim().min(1).max(32),
  title: z.string().trim().min(1).max(64),
  classId: z.string().trim().min(1).max(64),
  questionBankId: z.string().trim().min(1).max(64).nullish(),
  ...timelineFields,
})

const updateExperimentSchema = z.object({
  mark: z.string().trim().min(1).max(32).optional(),
  title: z.string().trim().min(1).max(64).optional(),
  questionBankId: z.string().trim().min(1).max(64).nullable().optional(),
  xzzdBindIdCheckout: z.string().trim().min(1).max(64).nullable().optional(),
  xzzdBindIdReport: z.string().trim().min(1).max(64).nullable().optional(),
  ...timelineFields,
})

const zjuamCredentialsSchema = z.object({
  account: z.string().trim().min(1).max(64).optional(),
  password: z.string().trim().min(1).max(128).optional(),
})

const xzzdPushPreviewSchema = zjuamCredentialsSchema.extend({
  /** 推送对象：验收作业 / 报告作业 */
  kind: z.enum(['checkout', 'report']).default('checkout'),
})

const experimentInclude = {
  klass: { select: { id: true, name: true, xzzdClassId: true } },
  questionBank: { select: { id: true, name: true } },
}

/** 时间线字段：ISO 字符串 → Date；null 表示清空；undefined 表示不改 */
function toTimelineDate(value: string | null | undefined): Date | null | undefined {
  if (value === undefined) return undefined
  if (value === null) return null
  return new Date(value)
}

/** 提交排序时间：created_at 非法时退化为提交 id */
function submissionTime(submission: ZjuamHomeworkSubmission): number {
  const time = submission.created_at ? Date.parse(submission.created_at) : Number.NaN
  return Number.isFinite(time) ? time : submission.id
}

/** 取某学生（person id）最近一次提交记录；没有提交返回 null */
function latestSubmissionOf(
  submissions: ZjuamHomeworkSubmission[],
  personId: number,
): ZjuamHomeworkSubmission | null {
  let latest: ZjuamHomeworkSubmission | null = null
  for (const submission of submissions) {
    if (submission.created_by?.id !== personId) continue
    if (!latest || submissionTime(submission) > submissionTime(latest)) latest = submission
  }
  return latest
}

export const experimentsRoutes: FastifyPluginAsync = async (fastify) => {
  /**
   * 推送 / 预览共用的前置校验：staff、实验归属、作业绑定、请求体与凭据。
   * 校验失败时已通过 reply 发送错误响应，返回 null。
   */
  async function resolveXzzdPushContext(
    request: FastifyRequest,
    reply: FastifyReply,
    experimentId: string,
    body: unknown,
  ): Promise<{
    activityId: string
    courseId: string
    classId: string
    kind: 'checkout' | 'report'
    account: string
    password: string
  } | null> {
    if (!requireStaff(request, reply)) return null

    const experiment = await prisma.experiment.findUnique({
      where: { id: experimentId },
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

    const parsedBody = xzzdPushPreviewSchema.safeParse(body ?? {})
    if (!parsedBody.success) {
      reply.code(400).send({ error: 'INVALID_BODY', message: '请求参数不正确' })
      return null
    }

    const activityId =
      parsedBody.data.kind === 'report'
        ? experiment.xzzdBindIdReport
        : experiment.xzzdBindIdCheckout
    if (!activityId) {
      reply.code(400).send({ error: 'XZZD_BIND_MISSING', message: '该实验尚未绑定学在浙大作业' })
      return null
    }

      const { sub } = request.user as { sub: string }
      const credentials = await resolveZjuamCredentials(sub, parsedBody.data)
      if (!credentials) {
        return reply
          .code(400)
          .send({ error: 'ZJUAM_CREDENTIALS_MISSING', message: '请先保存浙大统一身份认证账号和密码' })
      }

    return {
      activityId,
      courseId,
      classId: experiment.classId,
      kind: parsedBody.data.kind,
      account: credentials.account,
      password: credentials.password,
    }
  }

  /** 实验列表 */
  fastify.get('/', { onRequest: [fastify.authenticate] }, async (request) => {
    const classIds = await myClassIds(request)
    const experiments = await prisma.experiment.findMany({
      where: { classId: { in: classIds } },
      include: experimentInclude,
    })
    experiments.sort((a, b) => compareExperimentMark(a.mark, b.mark))
    return { experiments }
  })

  /**
   * 指定课程的实验列表 + 截止时间最早的进行中实验编号（mark）。
   * 进行中：已发布（publishTime 为空视为已发布）且验收 / 报告截止时间至少一个未过期；
   * 截止时间取未过期者中最早的一个；无进行中实验时 currentMark 为 null。
   */
  fastify.get(
    '/with-current',
    { onRequest: [fastify.authenticate] },
    async (request, reply) => {
      const query = request.query as { classId?: unknown }
      const classId = typeof query.classId === 'string' ? query.classId : ''
      if (!classId) {
        return reply.code(400).send({ error: 'INVALID_QUERY', message: '缺少 classId 参数' })
      }

      const classIds = await myClassIds(request)
      if (!classIds.includes(classId)) {
        return reply.code(403).send({ error: 'FORBIDDEN', message: '无权访问该班级' })
      }

      const now = Date.now()
      const experiments = await prisma.experiment.findMany({
        where: { classId },
        include: experimentInclude,
      })
      experiments.sort((a, b) => compareExperimentMark(a.mark, b.mark))

      let currentMark: string | null = null
      let earliestDeadline = Number.POSITIVE_INFINITY
      for (const experiment of experiments) {
        if (experiment.publishTime && experiment.publishTime.getTime() > now) continue
        const upcoming = [experiment.checkoffDeadline, experiment.reportDeadline]
          .filter((deadline): deadline is Date => deadline !== null && deadline.getTime() > now)
        if (upcoming.length === 0) continue
        const nearest = Math.min(...upcoming.map((deadline) => deadline.getTime()))
        if (nearest < earliestDeadline) {
          earliestDeadline = nearest
          currentMark = experiment.mark
        }
      }

      return { experiments, currentMark }
    },
  )

  /** 实验详情 */
  fastify.get('/:id', { onRequest: [fastify.authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const experiment = await prisma.experiment.findUnique({
      where: { id },
      include: experimentInclude,
    })
    if (!experiment) {
      return reply.code(404).send({ error: 'EXPERIMENT_NOT_FOUND', message: '实验不存在' })
    }
    const classIds = await myClassIds(request)
    if (!classIds.includes(experiment.classId)) {
      return reply.code(403).send({ error: 'FORBIDDEN', message: '无权访问该班级的实验' })
    }
    return { experiment }
  })

  /**
   * 拉取该实验所属班级在学在浙大的作业（homework）列表，供绑定验收 / 报告。
   * 凭据优先取请求体（"密码保存在本地" 模式），否则回退到用户已保存的凭据。
   */
  fastify.post(
    '/:id/xzzd-homeworks',
    { onRequest: [fastify.authenticate] },
    async (request, reply) => {
      if (!requireStaff(request, reply)) return reply

      const { id } = request.params as { id: string }
      const experiment = await prisma.experiment.findUnique({
        where: { id },
        include: { klass: { select: { xzzdClassId: true } } },
      })
      if (!experiment) {
        return reply.code(404).send({ error: 'EXPERIMENT_NOT_FOUND', message: '实验不存在' })
      }

      const classIds = await myClassIds(request)
      if (!classIds.includes(experiment.classId)) {
        return reply.code(403).send({ error: 'FORBIDDEN', message: '无权操作该班级的实验' })
      }

      const xzzdClassId = experiment.klass?.xzzdClassId
      if (!xzzdClassId) {
        return reply
          .code(400)
          .send({ error: 'XZZD_CLASS_ID_MISSING', message: '该班级未绑定学在浙大课程' })
      }

      const parsedBody = zjuamCredentialsSchema.safeParse(request.body ?? {})
      if (!parsedBody.success) {
        return reply.code(400).send({ error: 'INVALID_BODY', message: '请求参数不正确' })
      }

    const { sub } = request.user as { sub: string }
    const credentials = await resolveZjuamCredentials(sub, parsedBody.data)
      if (!credentials) {
        return reply
          .code(400)
          .send({ error: 'ZJUAM_CREDENTIALS_MISSING', message: '请先保存浙大统一身份认证账号和密码' })
      }

      try {
        const homeworks = await listHomeworkActivities(
          credentials.account,
          credentials.password,
          xzzdClassId,
        )
        return reply.send({ homeworks })
      } catch (error) {
        return sendZjuamError(reply, error)
      }
    },
  )

  /**
   * 拉取某学生（学在浙大 person id）在绑定作业下的提交附件列表（仅元数据）。
   * kind=checkout 取验收作业，kind=report 取报告作业；不写库。
   */
  fastify.post(
    '/:id/xzzd-submissions/:personId',
    { onRequest: [fastify.authenticate] },
    async (request, reply) => {
      const { id, personId: rawPersonId } = request.params as { id: string; personId: string }
      const personId = Number(rawPersonId)
      if (!Number.isInteger(personId) || personId <= 0) {
        return reply.code(400).send({ error: 'INVALID_BODY', message: '请求参数不正确' })
      }

      const context = await resolveXzzdPushContext(request, reply, id, request.body)
      if (!context) return reply

      try {
        const attachments = await fetchStudentSubmissionAttachments(
          context.account,
          context.password,
          context.activityId,
          personId,
        )
        return reply.send({ activityId: context.activityId, attachments })
      } catch (error) {
        return sendZjuamError(reply, error)
      }
    },
  )

  /**
   * 推送成绩流程第一步（只读预览）：拉取绑定作业的提交记录、上游成绩与学生名单。
   * kind=checkout 取验收作业，kind=report 取报告作业；不写库。
   */
  fastify.post(
    '/:id/xzzd-push/preview',
    { onRequest: [fastify.authenticate] },
    async (request, reply) => {
      const { id } = request.params as { id: string }
      const context = await resolveXzzdPushContext(request, reply, id, request.body)
      if (!context) return reply

      try {
        const data = await fetchHomeworkSyncData(
          context.account,
          context.password,
          context.courseId,
          context.activityId,
        )
        return reply.send(data)
      } catch (error) {
        return sendZjuamError(reply, error)
      }
    },
  )

  /**
   * 推送成绩流程（SSE）：按步骤执行并通过事件实时上报进度。
   * 事件：step（running / done / error）、assembled（组装结果）、
   * push（单个学生 pushing / pushed / unchanged / failed）、done、error。
   */
  fastify.post(
    '/:id/xzzd-push/stream',
    { onRequest: [fastify.authenticate] },
    async (request, reply) => {
      const { id } = request.params as { id: string }
      const context = await resolveXzzdPushContext(request, reply, id, request.body)
      if (!context) return reply

      const { activityId, courseId, classId, kind, account, password } = context

      // 前置校验通过后接管底层连接，后续手动写 SSE 帧
      reply.hijack()
      reply.raw.writeHead(200, {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no',
      })

      let disconnected = false
      request.raw.on('close', () => {
        disconnected = true
      })

      const send = (event: string, data: unknown): void => {
        if (disconnected) return
        reply.raw.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
      }

      const runStep = async <T>(
        stepId: string,
        label: string,
        run: () => Promise<T>,
        detailOf?: (result: T) => string | undefined,
      ): Promise<T> => {
        send('step', { id: stepId, label, status: 'running' })
        try {
          const result = await run()
          send('step', { id: stepId, label, status: 'done', detail: detailOf?.(result) })
          return result
        } catch (error) {
          send('step', {
            id: stepId,
            label,
            status: 'error',
            detail: error instanceof Error ? error.message : '未知错误',
          })
          throw error
        }
      }

      try {
        const submissions = await runStep(
          'fetch-submissions',
          '获取提交记录',
          () => fetchHomeworkSubmissions(account, password, activityId),
          (list) => `共 ${list.length} 条`,
        )
        if (disconnected) return

        const homeworkScores = await runStep(
          'fetch-scores',
          '获取上游成绩',
          () => fetchHomeworkScores(account, password, activityId),
          (list) => `共 ${list.length} 条`,
        )
        if (disconnected) return

        const students = await runStep(
          'fetch-students',
          '获取学生名单',
          () => fetchCourseStudents(account, password, courseId),
          (list) => `共 ${list.length} 人`,
        )
        if (disconnected) return

        await runStep('persist', '写入本地数据库', () =>
          prisma.xzzdHomework.upsert({
            where: { id },
            create: { id, value: JSON.stringify({ students, submissions }) },
            update: { value: JSON.stringify({ students, submissions }) },
          }),
        )
        if (disconnected) return

        // 组装所需本地数据：实验分值比例 / 评语模板（课程设置）+ 学生分数
        const local = await runStep('collect-local', '读取实验配置与学生成绩', async () => {
          const [klass, localStudents, scoreRows] = await Promise.all([
            prisma.class.findUnique({ where: { id: classId }, select: { settings: true } }),
            prisma.student.findMany({
              where: { classId },
              select: { stuId: true, name: true, studentNo: true },
            }),
            prisma.score.findMany({
              where: { labId: id, type: { in: [0, 1, 2] } },
              select: {
                stuId: true,
                type: true,
                score: true,
                updatedAt: true,
                grader: { select: { name: true } },
              },
            }),
          ])

          return {
            settings: parseClassSettings(klass?.settings ?? null),
            students: localStudents,
            scores: scoreRows.map((row) => ({
              stuId: row.stuId,
              type: row.type,
              score: row.score,
              graderName: row.grader?.name ?? null,
              updatedAt: row.updatedAt,
            })),
          }
        })
        if (disconnected) return

        const targets = await runStep(
          'assemble',
          '组装学生成绩',
          async () => {
            const templateRaw =
              kind === 'report'
                ? local.settings.reportCommentTemplate
                : local.settings.checkoutCommentTemplate
            return assemblePushTargets({
              kind,
              template: typeof templateRaw === 'string' ? templateRaw : '',
              ratio: resolveScoreRatio(local.settings, id),
              studentViewUrl: (stuId) => buildStudentViewUrl(fastify, stuId, id),
              students: local.students,
              upstreamStudents: students,
              scores: local.scores,
            })
          },
          (list) => {
            const ready = list.filter((item) => !item.skippedReason).length
            return `可推送 ${ready} 人，跳过 ${list.length - ready} 人`
          },
        )

        send('assembled', { targets })

        // 推送：逐一发送成绩与评语；与上游完全一致的跳过
        const readyTargets = targets.filter((item) => !item.skippedReason)
        const upstreamScoreByStudent = new Map(homeworkScores.map((row) => [row.student_id, row]))
        let unchangedCount = 0

        const pushed = await runStep(
          'push-scores',
          '推送成绩与评语',
          async () => {
            const records: Array<{
              stuId: string
              personId: number
              submissionId: number | null
              score: number
              comment: string
            }> = []

            for (const [index, target] of readyTargets.entries()) {
              if (disconnected) return records
              if (target.personId == null || target.pushScore == null) continue

              const upstream = upstreamScoreByStudent.get(target.personId) ?? null
              if (isSameAsUpstream({ pushScore: target.pushScore, comment: target.comment }, upstream)) {
                unchangedCount += 1
                send('push', { stuId: target.stuId, status: 'unchanged' })
                send('step', {
                  id: 'push-scores',
                  label: '推送成绩与评语',
                  status: 'running',
                  detail: `${index + 1}/${readyTargets.length}`,
                })
                continue
              }

              const submission = latestSubmissionOf(submissions, target.personId)
              send('push', { stuId: target.stuId, status: 'pushing' })
              try {
                await pushSubmissionScore(account, password, activityId, {
                  submissionId: submission?.id ?? null,
                  studentId: target.personId,
                  score: target.pushScore.toFixed(1),
                  comment: target.comment,
                })
              } catch (error) {
                send('push', {
                  stuId: target.stuId,
                  status: 'failed',
                  message: error instanceof Error ? error.message : '推送失败',
                })
                throw error
              }
              records.push({
                stuId: target.stuId,
                personId: target.personId,
                submissionId: submission?.id ?? null,
                score: target.pushScore,
                comment: target.comment,
              })
              send('push', { stuId: target.stuId, status: 'pushed' })
              send('step', {
                id: 'push-scores',
                label: '推送成绩与评语',
                status: 'running',
                detail: `${index + 1}/${readyTargets.length}`,
              })
            }

            return records
          },
          (records) =>
            unchangedCount > 0
              ? `已推送 ${records.length} 人，跳过 ${unchangedCount} 人（无变化）`
              : `已推送 ${records.length} 人`,
        )
        if (disconnected) return

        // 写回数据库：推送结果 + 向上同步时间
        const pushedAt = new Date()
        await runStep('write-back', '写回数据库', () =>
          prisma.$transaction([
            prisma.xzzdHomework.upsert({
              where: { id },
              create: {
                id,
                value: JSON.stringify({
                  students,
                  submissions,
                  lastPush: { kind, at: pushedAt.toISOString(), records: pushed },
                }),
                lastXzzdUpSyncAt: pushedAt,
              },
              update: {
                value: JSON.stringify({
                  students,
                  submissions,
                  lastPush: { kind, at: pushedAt.toISOString(), records: pushed },
                }),
                lastXzzdUpSyncAt: pushedAt,
              },
            }),
            prisma.experiment.update({
              where: { id },
              data: { lastXzzdUpSyncAt: pushedAt },
            }),
          ]),
        )

        const ready = targets.filter((item) => !item.skippedReason).length
        const doneMessage =
          pushed.length === 0
            ? unchangedCount > 0
              ? `推送完成：${unchangedCount} 人无变化，未发送请求`
              : '推送完成：没有需要推送的学生'
            : `推送完成：更新 ${pushed.length} 人${
                unchangedCount > 0 ? `，跳过 ${unchangedCount} 人（无变化）` : ''
              }`
        send('done', {
          stage: 'pushed',
          message: doneMessage,
          activityId,
          submissions: submissions.length,
          homeworkScores: homeworkScores.length,
          students: students.length,
          assembled: targets.length,
          ready,
          skipped: targets.length - ready,
          pushed: pushed.length,
          unchanged: unchangedCount,
        })
      } catch (error) {
        if (error instanceof ZjuamError) {
          send('error', { code: error.code, message: error.message })
        } else {
          send('error', { code: 'INTERNAL', message: '推送失败，请稍后重试' })
        }
      } finally {
        if (!disconnected) reply.raw.end()
      }
    },
  )

  /** 新建实验 */
  fastify.post('/', { onRequest: [fastify.authenticate] }, async (request, reply) => {
    if (!requireStaff(request, reply)) return reply

    const parsed = createExperimentSchema.safeParse(request.body)
    if (!parsed.success) {
      return reply.code(400).send({ error: 'INVALID_BODY', message: '请求参数不正确' })
    }

    const { mark, title, classId, questionBankId, publishTime, checkoffDeadline, reportDeadline } =
      parsed.data

    const klass = await prisma.class.findUnique({ where: { id: classId } })
    if (!klass) {
      return reply.code(404).send({ error: 'CLASS_NOT_FOUND', message: '课程不存在' })
    }

    const classIds = await myClassIds(request)
    if (!classIds.includes(classId)) {
      return reply.code(403).send({ error: 'FORBIDDEN', message: '无权操作该班级的实验' })
    }

    if (questionBankId) {
      const bank = await prisma.questionBank.findUnique({ where: { id: questionBankId } })
      if (!bank) {
        return reply.code(404).send({ error: 'BANK_NOT_FOUND', message: '题库不存在' })
      }
    }

    let experiment
    try {
      experiment = await prisma.experiment.create({
        data: {
          mark,
          title,
          classId,
          questionBankId: questionBankId ?? null,
          publishTime: toTimelineDate(publishTime) ?? null,
          checkoffDeadline: toTimelineDate(checkoffDeadline) ?? null,
          reportDeadline: toTimelineDate(reportDeadline) ?? null,
        },
        include: experimentInclude,
      })
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        return reply.code(409).send({ error: 'EXPERIMENT_EXISTS', message: '该实验已存在' })
      }
      throw error
    }

    return reply.code(201).send({ experiment })
  })

  /** 更新实验（改编号 / 标题 / 绑定题库 / 绑定学在浙大作业），需属于该实验班级 */
  fastify.patch('/:id', { onRequest: [fastify.authenticate] }, async (request, reply) => {
    if (!requireStaff(request, reply)) return reply

    const { id } = request.params as { id: string }

    const parsed = updateExperimentSchema.safeParse(request.body)
    if (!parsed.success) {
      return reply.code(400).send({ error: 'INVALID_BODY', message: '请求参数不正确' })
    }

    const existing = await prisma.experiment.findUnique({ where: { id } })
    if (!existing) {
      return reply.code(404).send({ error: 'EXPERIMENT_NOT_FOUND', message: '实验不存在' })
    }

    const classIds = await myClassIds(request)
    if (!classIds.includes(existing.classId)) {
      return reply.code(403).send({ error: 'FORBIDDEN', message: '无权操作该班级的实验' })
    }

    if (parsed.data.questionBankId) {
      const bank = await prisma.questionBank.findUnique({ where: { id: parsed.data.questionBankId } })
      if (!bank) {
        return reply.code(404).send({ error: 'BANK_NOT_FOUND', message: '题库不存在' })
      }
    }

    const { publishTime, checkoffDeadline, reportDeadline, ...rest } = parsed.data
    const data = {
      ...rest,
      ...(publishTime !== undefined ? { publishTime: toTimelineDate(publishTime) } : {}),
      ...(checkoffDeadline !== undefined ? { checkoffDeadline: toTimelineDate(checkoffDeadline) } : {}),
      ...(reportDeadline !== undefined ? { reportDeadline: toTimelineDate(reportDeadline) } : {}),
    }

    let experiment
    try {
      experiment = await prisma.experiment.update({
        where: { id },
        data,
        include: experimentInclude,
      })
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        return reply.code(409).send({ error: 'EXPERIMENT_EXISTS', message: '该实验编号已存在' })
      }
      throw error
    }

    return reply.send({ experiment })
  })
}
