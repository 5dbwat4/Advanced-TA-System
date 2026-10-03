import { Prisma, type Class } from '@prisma/client'
import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from 'fastify'
import { z } from 'zod'

import { requireStaff } from '../lib/class-access'
import { checkpointRuleBit, checkpointRuleLabels } from '../lib/checkpoints'
import { prisma } from '../lib/prisma'
import { publicUser } from '../lib/user'
import type { ZjuamEnrollment } from '../lib/zjuam'
import { listEnrollments } from '../lib/zjuam'
import { resolveZjuamCredentials, sendZjuamError } from '../lib/zjuam-resolve'

const createClassSchema = z.object({
  xzzdClassId: z.string().trim().min(1).max(64),
  name: z.string().trim().min(1).max(64),
  type: z.enum(['2026-sys1', '2026-sys2', '2026-sys3']),
})

const classParamsSchema = z.object({
  id: z.string().min(1),
})

const rosterBodySchema = z.object({
  account: z.string().trim().min(1).max(64).optional(),
  password: z.string().trim().min(1).max(128).optional(),
})

const rosterApplySchema = z.object({
  added: z.array(
    z.object({
      studentNo: z.string().trim().min(1),
      name: z.string().trim().min(1),
    }),
  ),
  removed: z.array(z.string().trim().min(1)),
  expectedSyncAt: z.string().datetime().optional(),
})

/** 评分占比：功能测试 / 验收问答 / 报告，三个非负整数 */
const scoreRatioSchema = z.array(z.number().int().min(0).max(10000)).length(3)

const classSettingsPatchSchema = z.object({
  checkpointEnabled: z.boolean().optional(),
  checkpointRule: z.string().trim().max(64).nullable().optional(),
  focusEnabled: z.boolean().optional(),
  /** 全课程是否共用统一评分占比 */
  scoreRatioUnified: z.boolean().optional(),
  /** 课程级评分占比（统一模式使用） */
  scoreRatio: scoreRatioSchema.optional(),
  /** 各实验独立的评分占比，键为实验 id */
  experimentScoreRatios: z.record(scoreRatioSchema).optional(),
  /** 验收评语模板 */
  checkoutCommentTemplate: z.string().max(20000).optional(),
  /** 报告评语模板 */
  reportCommentTemplate: z.string().max(20000).optional(),
})

const focusCreateSchema = z.object({
  stuId: z.string().trim().min(1),
  reason: z.string().trim().max(200).optional(),
})

const focusUpdateSchema = z.object({
  reason: z.string().trim().max(200),
})

const focusDeleteSchema = z.object({
  ids: z.array(z.string().trim().min(1)).min(1).max(1000),
})

const focusParamsSchema = z.object({ id: z.string().min(1), focusId: z.string().min(1) })

const checkpointCreateSchema = z.object({
  stuId: z.string().trim().min(1),
})

const checkpointDeleteSchema = z.object({
  ids: z.array(z.string().trim().min(1)).min(1).max(1000),
})

/** 重点关注记录统一 include（学生姓名 / 学号） */
const focusInclude = { student: { select: { name: true, studentNo: true } } } as const

/** Checkpoint 记录统一 include（学生姓名 / 学号） */
const checkpointInclude = { student: { select: { name: true, studentNo: true } } } as const

export const classesRoutes: FastifyPluginAsync = async (fastify) => {
  /** 解析课程设置 JSON 字符串（损坏时按空对象处理） */
  function parseClassSettings(raw: string | null): Record<string, unknown> {
    if (!raw) return {}
    try {
      const parsed = JSON.parse(raw)
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
        ? (parsed as Record<string, unknown>)
        : {}
    } catch {
      return {}
    }
  }

  /** 加载班级并校验归属：不存在 404，不属于当前用户 403 */
  async function resolveOwnedClass(
    request: FastifyRequest,
    reply: FastifyReply,
    classId: string,
  ): Promise<Class | null> {
    const klass = await prisma.class.findUnique({ where: { id: classId } })
    if (!klass) {
      reply.code(404).send({ error: 'CLASS_NOT_FOUND', message: '课程不存在' })
      return null
    }

    const { sub } = request.user as { sub: string }
    const owned = await prisma.class.findFirst({
      where: { id: classId, tas: { some: { id: sub } } },
    })
    if (!owned) {
      reply.code(403).send({ error: 'FORBIDDEN', message: '无权操作该班级' })
      return null
    }

    return klass
  }

  /** 新建班级并将当前用户关联到该班级 */
  fastify.post('/', { onRequest: [fastify.authenticate] }, async (request, reply) => {
    if (!requireStaff(request, reply)) return reply

    const parsed = createClassSchema.safeParse(request.body)
    if (!parsed.success) {
      return reply.code(400).send({ error: 'INVALID_BODY', message: '请求参数不正确' })
    }

    const { xzzdClassId, name, type } = parsed.data

    let klass
    try {
      klass = await prisma.class.create({ data: { xzzdClassId, name, type } })
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        return reply.code(409).send({ error: 'ALREADY_EXISTS', message: '该课程已存在' })
      }
      throw error
    }

    const { sub } = request.user as { sub: string }
    const updatedUser = await prisma.user.update({
      where: { id: sub },
      data: { classes: { connect: { id: klass.id } } },
      include: { classes: true },
    })

    return reply.code(201).send({
      class: { id: klass.id, name: klass.name, type: klass.type, xzzdClassId: klass.xzzdClassId },
      user: publicUser(updatedUser),
    })
  })

  /** 将当前用户关联到指定班级 */
  fastify.post('/:id/join', { onRequest: [fastify.authenticate] }, async (request, reply) => {
    if (!requireStaff(request, reply)) return reply

    const parsed = classParamsSchema.safeParse(request.params)
    if (!parsed.success) {
      return reply.code(400).send({ error: 'INVALID_BODY', message: '请求参数不正确' })
    }

    const klass = await prisma.class.findUnique({ where: { id: parsed.data.id } })
    if (!klass) {
      return reply.code(404).send({ error: 'CLASS_NOT_FOUND', message: '课程不存在' })
    }

    const { sub } = request.user as { sub: string }
    const updatedUser = await prisma.user.update({
      where: { id: sub },
      data: { classes: { connect: { id: klass.id } } },
      include: { classes: true },
    })

    return reply.send({ user: publicUser(updatedUser) })
  })

  /** 预览学在浙大学生名单同步差异（仅比对，不写库） */
  fastify.post(
    '/:id/roster/preview',
    { onRequest: [fastify.authenticate] },
    async (request, reply) => {
      if (!requireStaff(request, reply)) return reply

      const parsedParams = classParamsSchema.safeParse(request.params)
      if (!parsedParams.success) {
        return reply.code(400).send({ error: 'INVALID_BODY', message: '请求参数不正确' })
      }

      const klass = await resolveOwnedClass(request, reply, parsedParams.data.id)
      if (!klass) return reply

      if (!klass.xzzdClassId) {
        return reply
          .code(400)
          .send({ error: 'XZZD_CLASS_ID_MISSING', message: '该班级未绑定学在浙大课程' })
      }

      const parsedBody = rosterBodySchema.safeParse(request.body ?? {})
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

      let enrollments: ZjuamEnrollment[]
      try {
        enrollments = await listEnrollments(
          credentials.account,
          credentials.password,
          klass.xzzdClassId,
        )
      } catch (error) {
        return sendZjuamError(reply, error)
      }

      const currentStudents = await prisma.student.findMany({ where: { classId: klass.id } })
      const currentNos = new Set(currentStudents.map((student) => student.studentNo))
      const fetchedNos = new Set(enrollments.map((enrollment) => enrollment.studentNo))

      const added = enrollments
        .filter((enrollment) => !currentNos.has(enrollment.studentNo))
        .map((enrollment) => ({ studentNo: enrollment.studentNo, name: enrollment.name }))
      const removed = currentStudents
        .filter((student) => !fetchedNos.has(student.studentNo))
        .map((student) => ({ studentNo: student.studentNo, name: student.name }))

      return reply.send({
        added,
        removed,
        unchangedCount: currentStudents.length - removed.length,
      })
    },
  )

  /** 应用学在浙大学生名单同步：新增 / 更新 / 删除并记录同步时间 */
  fastify.post(
    '/:id/roster/apply',
    { onRequest: [fastify.authenticate] },
    async (request, reply) => {
      if (!requireStaff(request, reply)) return reply

      const parsedParams = classParamsSchema.safeParse(request.params)
      if (!parsedParams.success) {
        return reply.code(400).send({ error: 'INVALID_BODY', message: '请求参数不正确' })
      }

      const klass = await resolveOwnedClass(request, reply, parsedParams.data.id)
      if (!klass) return reply

      const parsedBody = rosterApplySchema.safeParse(request.body ?? {})
      if (!parsedBody.success) {
        return reply.code(400).send({ error: 'INVALID_BODY', message: '请求参数不正确' })
      }

      const { added, removed, expectedSyncAt } = parsedBody.data

      const syncedAt = new Date()
      const stale = await prisma.$transaction(async (tx) => {
        const fresh = await tx.class.findUnique({
          where: { id: klass.id },
          select: { lastRosterSyncAt: true },
        })
        if (
          expectedSyncAt !== undefined &&
          (fresh?.lastRosterSyncAt?.toISOString() ?? null) !== expectedSyncAt
        ) {
          return true
        }

        for (const entry of added) {
          const existing = await tx.student.findFirst({
            where: { classId: klass.id, studentNo: entry.studentNo },
          })
          if (existing) {
            await tx.student.update({
              where: { stuId: existing.stuId },
              data: { name: entry.name },
            })
          } else {
            await tx.student.create({
              data: { studentNo: entry.studentNo, name: entry.name, classId: klass.id },
            })
          }
        }

        if (removed.length > 0) {
          await tx.student.deleteMany({
            where: { classId: klass.id, studentNo: { in: removed } },
          })
        }

        await tx.class.update({
          where: { id: klass.id },
          data: { lastRosterSyncAt: syncedAt },
        })
        return false
      })

      if (stale) {
        return reply.code(409).send({
          error: 'ROSTER_STALE',
          message: '名单已被其他人更新，请重新预览后再应用',
        })
      }

      return reply.send({
        addedCount: added.length,
        removedCount: removed.length,
        lastRosterSyncAt: syncedAt,
      })
    },
  )

  /** 读取课程设置 */
  fastify.get('/:id/settings', { onRequest: [fastify.authenticate] }, async (request, reply) => {
    const parsed = classParamsSchema.safeParse(request.params)
    if (!parsed.success) {
      return reply.code(400).send({ error: 'INVALID_BODY', message: '请求参数不正确' })
    }

    const klass = await resolveOwnedClass(request, reply, parsed.data.id)
    if (!klass) return reply

    return reply.send({ settings: parseClassSettings(klass.settings) })
  })

  /** 更新课程设置（局部合并） */
  fastify.patch('/:id/settings', { onRequest: [fastify.authenticate] }, async (request, reply) => {
    if (!requireStaff(request, reply)) return reply

    const parsedParams = classParamsSchema.safeParse(request.params)
    if (!parsedParams.success) {
      return reply.code(400).send({ error: 'INVALID_BODY', message: '请求参数不正确' })
    }

    const klass = await resolveOwnedClass(request, reply, parsedParams.data.id)
    if (!klass) return reply

    const parsedBody = classSettingsPatchSchema.safeParse(request.body ?? {})
    if (!parsedBody.success) {
      return reply.code(400).send({ error: 'INVALID_BODY', message: '请求参数不正确' })
    }

    const current = parseClassSettings(klass.settings)
    const { experimentScoreRatios, ...rest } = parsedBody.data
    const settings: Record<string, unknown> = { ...current, ...rest }
    if (experimentScoreRatios) {
      const prev = current.experimentScoreRatios
      // 逐实验合并，避免一次写入覆盖其它实验的占比
      settings.experimentScoreRatios = {
        ...(prev && typeof prev === 'object' && !Array.isArray(prev)
          ? (prev as Record<string, unknown>)
          : {}),
        ...experimentScoreRatios,
      }
    }
    const updated = await prisma.class.update({
      where: { id: klass.id },
      data: { settings: JSON.stringify(settings) },
    })

    // 课程级规则变更时，名单内所有人的已应用规则位同步更新
    if ('checkpointRule' in rest) {
      await prisma.checkpointClaimed.updateMany({
        where: { classId: klass.id },
        data: { appliedRules: checkpointRuleBit(settings.checkpointRule) },
      })
    }

    return reply.send({ settings: parseClassSettings(updated.settings) })
  })

  /** Checkpoint 名单列表 */
  fastify.get('/:id/checkpoints', { onRequest: [fastify.authenticate] }, async (request, reply) => {
    const parsed = classParamsSchema.safeParse(request.params)
    if (!parsed.success) {
      return reply.code(400).send({ error: 'INVALID_BODY', message: '请求参数不正确' })
    }

    const klass = await resolveOwnedClass(request, reply, parsed.data.id)
    if (!klass) return reply

    const claims = await prisma.checkpointClaimed.findMany({
      where: { classId: klass.id },
      include: checkpointInclude,
      orderBy: { createdAt: 'desc' },
    })

    return reply.send({
      claims: claims.map((claim) => ({
        ...claim,
        appliedRuleLabels: checkpointRuleLabels(claim.appliedRules),
      })),
    })
  })

  /** 添加 Checkpoint 学生 */
  fastify.post(
    '/:id/checkpoints',
    { onRequest: [fastify.authenticate] },
    async (request, reply) => {
      if (!requireStaff(request, reply)) return reply

      const parsedParams = classParamsSchema.safeParse(request.params)
      if (!parsedParams.success) {
        return reply.code(400).send({ error: 'INVALID_BODY', message: '请求参数不正确' })
      }

      const klass = await resolveOwnedClass(request, reply, parsedParams.data.id)
      if (!klass) return reply

      const parsedBody = checkpointCreateSchema.safeParse(request.body ?? {})
      if (!parsedBody.success) {
        return reply.code(400).send({ error: 'INVALID_BODY', message: '请求参数不正确' })
      }

      const { stuId } = parsedBody.data

      const student = await prisma.student.findFirst({ where: { stuId, classId: klass.id } })
      if (!student) {
        return reply.code(404).send({ error: 'STUDENT_NOT_FOUND', message: '学生不存在' })
      }

      const settings = parseClassSettings(klass.settings)
      const appliedRules = checkpointRuleBit(settings.checkpointRule)

      let claim
      try {
        claim = await prisma.checkpointClaimed.create({
          data: { classId: klass.id, stuId, appliedRules },
          include: checkpointInclude,
        })
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
          return reply
            .code(409)
            .send({ error: 'ALREADY_EXISTS', message: '该学生已在 Checkpoint 名单中' })
        }
        throw error
      }

      return reply.code(201).send({
        claim: { ...claim, appliedRuleLabels: checkpointRuleLabels(claim.appliedRules) },
      })
    },
  )

  /** 批量移除 Checkpoint 学生 */
  fastify.delete(
    '/:id/checkpoints',
    { onRequest: [fastify.authenticate] },
    async (request, reply) => {
      if (!requireStaff(request, reply)) return reply

      const parsedParams = classParamsSchema.safeParse(request.params)
      if (!parsedParams.success) {
        return reply.code(400).send({ error: 'INVALID_BODY', message: '请求参数不正确' })
      }

      const klass = await resolveOwnedClass(request, reply, parsedParams.data.id)
      if (!klass) return reply

      const parsedBody = checkpointDeleteSchema.safeParse(request.body ?? {})
      if (!parsedBody.success) {
        return reply.code(400).send({ error: 'INVALID_BODY', message: '请求参数不正确' })
      }

      const { count } = await prisma.checkpointClaimed.deleteMany({
        where: { classId: klass.id, id: { in: parsedBody.data.ids } },
      })

      return reply.send({ ok: true, deletedCount: count })
    },
  )

  /** 重点关注学生名单 */
  fastify.get(
    '/:id/focus-students',
    { onRequest: [fastify.authenticate] },
    async (request, reply) => {
      const parsed = classParamsSchema.safeParse(request.params)
      if (!parsed.success) {
        return reply.code(400).send({ error: 'INVALID_BODY', message: '请求参数不正确' })
      }

      const klass = await resolveOwnedClass(request, reply, parsed.data.id)
      if (!klass) return reply

      const focusStudents = await prisma.focusStudent.findMany({
        where: { classId: klass.id },
        include: focusInclude,
        orderBy: { createdAt: 'asc' },
      })

      return reply.send({ focusStudents })
    },
  )

  /** 新增重点关注学生 */
  fastify.post(
    '/:id/focus-students',
    { onRequest: [fastify.authenticate] },
    async (request, reply) => {
      if (!requireStaff(request, reply)) return reply

      const parsedParams = classParamsSchema.safeParse(request.params)
      if (!parsedParams.success) {
        return reply.code(400).send({ error: 'INVALID_BODY', message: '请求参数不正确' })
      }

      const klass = await resolveOwnedClass(request, reply, parsedParams.data.id)
      if (!klass) return reply

      const parsedBody = focusCreateSchema.safeParse(request.body ?? {})
      if (!parsedBody.success) {
        return reply.code(400).send({ error: 'INVALID_BODY', message: '请求参数不正确' })
      }

      const { stuId, reason } = parsedBody.data

      const student = await prisma.student.findFirst({ where: { stuId, classId: klass.id } })
      if (!student) {
        return reply.code(404).send({ error: 'STUDENT_NOT_FOUND', message: '学生不存在' })
      }

      let focusStudent
      try {
        focusStudent = await prisma.focusStudent.create({
          data: { classId: klass.id, stuId, reason: reason ?? '' },
          include: focusInclude,
        })
      } catch (error) {
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === 'P2002'
        ) {
          return reply.code(409).send({ error: 'ALREADY_EXISTS', message: '该学生已在重点关注名单中' })
        }
        throw error
      }

      return reply.code(201).send({ focusStudent })
    },
  )

  /** 修改重点关注原因 */
  fastify.patch(
    '/:id/focus-students/:focusId',
    { onRequest: [fastify.authenticate] },
    async (request, reply) => {
      if (!requireStaff(request, reply)) return reply

      const parsedParams = focusParamsSchema.safeParse(request.params)
      if (!parsedParams.success) {
        return reply.code(400).send({ error: 'INVALID_BODY', message: '请求参数不正确' })
      }

      const klass = await resolveOwnedClass(request, reply, parsedParams.data.id)
      if (!klass) return reply

      const parsedBody = focusUpdateSchema.safeParse(request.body ?? {})
      if (!parsedBody.success) {
        return reply.code(400).send({ error: 'INVALID_BODY', message: '请求参数不正确' })
      }

      const existing = await prisma.focusStudent.findFirst({
        where: { id: parsedParams.data.focusId, classId: klass.id },
      })
      if (!existing) {
        return reply
          .code(404)
          .send({ error: 'FOCUS_STUDENT_NOT_FOUND', message: '重点关注记录不存在' })
      }

      const focusStudent = await prisma.focusStudent.update({
        where: { id: existing.id },
        data: { reason: parsedBody.data.reason },
        include: focusInclude,
      })

      return reply.send({ focusStudent })
    },
  )

  /** 批量移除重点关注学生 */
  fastify.delete(
    '/:id/focus-students',
    { onRequest: [fastify.authenticate] },
    async (request, reply) => {
      if (!requireStaff(request, reply)) return reply

      const parsedParams = classParamsSchema.safeParse(request.params)
      if (!parsedParams.success) {
        return reply.code(400).send({ error: 'INVALID_BODY', message: '请求参数不正确' })
      }

      const klass = await resolveOwnedClass(request, reply, parsedParams.data.id)
      if (!klass) return reply

      const parsedBody = focusDeleteSchema.safeParse(request.body ?? {})
      if (!parsedBody.success) {
        return reply.code(400).send({ error: 'INVALID_BODY', message: '请求参数不正确' })
      }

      const { count } = await prisma.focusStudent.deleteMany({
        where: { classId: klass.id, id: { in: parsedBody.data.ids } },
      })

      return reply.send({ ok: true, deletedCount: count })
    },
  )
}
