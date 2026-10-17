import { Prisma, type Class } from '@prisma/client'
import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from 'fastify'
import { z } from 'zod'

import { requireStaff } from '../lib/class-access'
import { checkpointRuleBit, checkpointRuleLabels } from '../lib/checkpoints'
import { verifyCourseBindToken } from '../lib/course-bind'
import { hashPassword } from '../lib/password'
import { prisma } from '../lib/prisma'
import { publicUser } from '../lib/user'
import type { ZjuamEnrollment } from '../lib/zjuam'
import { listEnrollments } from '../lib/zjuam'
import { resolveZjuamCredentials, sendZjuamError } from '../lib/zjuam-resolve'

const classParamsSchema = z.object({
  id: z.string().min(1),
})

/** 录入新班级：绑定授权由“获取课程”时签发 */
const createClassSchema = z.object({
  bindToken: z.string().min(1),
  name: z.string().trim().min(1).max(64),
  type: z.enum(['2026-sys1', '2026-sys2', '2026-sys3']),
})

/** 为新班级创建账号：绑定授权由“获取课程”时签发，服务端不再信任客户端课程 id */
const newClassAccountSchema = z.object({
  bindToken: z.string().min(1),
  classId: z.string().trim().min(1),
  name: z.string().trim().min(1).max(32),
  username: z.string().trim().min(1).max(32),
  password: z.string().max(128).optional(),
  syncLogin: z.boolean().optional().default(true),
  syncPreferences: z.boolean().optional().default(true),
})

/** 带 HTTP 状态码的业务异常（由全局错误处理器输出） */
class ClassAccountError extends Error {
  constructor(
    readonly statusCode: number,
    readonly code: string,
    message: string,
  ) {
    super(message)
  }
}

function classAccountError(statusCode: number, code: string, message: string): ClassAccountError {
  return new ClassAccountError(statusCode, code, message)
}

const rosterBodySchema = z.object({
  account: z.string().trim().min(1).max(64).optional(),
  password: z.string().trim().min(1).max(128).optional(),
})

const rosterApplySchema = z.object({
  added: z.array(
    z.object({
      studentId: z.string().trim().min(1),
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
  userId: z.string().trim().min(1),
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
  userId: z.string().trim().min(1),
})

const checkpointDeleteSchema = z.object({
  ids: z.array(z.string().trim().min(1)).min(1).max(1000),
})

/** 重点关注记录统一 include（学生姓名 / 学号） */
const focusInclude = { student: { select: { name: true, studentId: true } } } as const

/** Checkpoint 记录统一 include（学生姓名 / 学号） */
const checkpointInclude = { student: { select: { name: true, studentId: true } } } as const

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
      where: { id: classId, users: { some: { id: sub } } },
    })
    if (!owned) {
      reply.code(403).send({ error: 'FORBIDDEN', message: '无权操作该班级' })
      return null
    }

    return klass
  }

  /** 录入新班级：仅持有该课程绑定授权的任课教师可创建 */
  fastify.post('/', { onRequest: [fastify.authenticate] }, async (request, reply) => {
    if (!requireStaff(request, reply)) return reply

    const parsed = createClassSchema.safeParse(request.body ?? {})
    if (!parsed.success) {
      return reply.code(400).send({ error: 'INVALID_BODY', message: '请求参数不正确' })
    }

    const { sub } = request.user as { sub: string }
    const bind = verifyCourseBindToken(fastify, parsed.data.bindToken, sub)
    if (!bind) {
      return reply.code(401).send({
        error: 'BIND_TOKEN_INVALID',
        message: '课程绑定授权已失效，请重新获取课程',
      })
    }

    const existing = await prisma.class.findUnique({ where: { xzzdClassId: bind.courseId } })
    if (existing) {
      return reply.send({
        class: {
          id: existing.id,
          name: existing.name,
          type: existing.type,
          xzzdClassId: existing.xzzdClassId,
        },
      })
    }

    let klass: Class
    try {
      klass = await prisma.class.create({
        data: {
          xzzdClassId: bind.courseId,
          name: parsed.data.name,
          type: parsed.data.type,
        },
      })
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        const raced = await prisma.class.findUnique({ where: { xzzdClassId: bind.courseId } })
        if (raced) {
          return reply.send({
            class: {
              id: raced.id,
              name: raced.name,
              type: raced.type,
              xzzdClassId: raced.xzzdClassId,
            },
          })
        }
      }
      throw error
    }

    return reply.code(201).send({
      class: {
        id: klass.id,
        name: klass.name,
        type: klass.type,
        xzzdClassId: klass.xzzdClassId,
      },
    })
  })

  /**
   * 为新班级创建助教 / 教师账号。
   * 单班模型下，绑定新课程不再移动当前账号，而是复制身份信息到新账号。
   */
  fastify.post(
    '/new-account',
    { onRequest: [fastify.authenticate] },
    async (request, reply) => {
      if (!requireStaff(request, reply)) return reply

      const parsed = newClassAccountSchema.safeParse(request.body ?? {})
      if (!parsed.success) {
        return reply.code(400).send({ error: 'INVALID_BODY', message: '请求参数不正确' })
      }

      const { sub } = request.user as { sub: string }
      const current = await prisma.user.findUnique({ where: { id: sub } })
      if (!current || !current.studentId) {
        return reply.code(400).send({
          error: 'IDENTITY_MISSING',
          message: '当前账号缺少学号，请先通过统一身份认证登录并完善信息',
        })
      }

      const {
        bindToken,
        classId,
        name,
        username,
        password,
        syncLogin,
        syncPreferences,
      } = parsed.data
      const bind = verifyCourseBindToken(fastify, bindToken, sub)
      if (!bind) {
        return reply.code(401).send({
          error: 'BIND_TOKEN_INVALID',
          message: '课程绑定授权已失效，请重新获取课程',
        })
      }

      if (password && password.length < 8) {
        return reply.code(400).send({ error: 'INVALID_PASSWORD', message: '密码至少 8 位' })
      }
      const passwordHash = password
        ? await hashPassword(password)
        : syncLogin
          ? current.password
          : null

      try {
        const result = await prisma.$transaction(async (tx) => {
          const klass = await tx.class.findUnique({ where: { id: classId } })
          if (!klass) {
            throw classAccountError(404, 'CLASS_NOT_FOUND', '课程不存在')
          }
          if (klass.xzzdClassId !== bind.courseId) {
            throw classAccountError(403, 'CLASS_MISMATCH', '该班级不属于授权课程')
          }

          const existing = await tx.user.findFirst({
            where: { classId: klass.id, role: current.role, studentId: current.studentId },
            select: { id: true },
          })
          if (existing) {
            throw classAccountError(409, 'ACCOUNT_EXISTS', '该班级已存在当前助教的账号')
          }

          const usernameTaken = await tx.user.findFirst({
            where: { classId: klass.id, username },
            select: { id: true },
          })
          if (usernameTaken) {
            throw classAccountError(409, 'USERNAME_TAKEN', '该用户名在本班已存在')
          }

          const created = await tx.user.create({
            data: {
              name,
              role: current.role,
              studentId: current.studentId,
              username,
              password: passwordHash,
              avatar: syncPreferences ? current.avatar : null,
              zjuamAccount: current.zjuamAccount,
              zjuamPassword: current.zjuamPassword,
              zjuPersonId: current.zjuPersonId,
              zjuSyncedAt: current.zjuSyncedAt,
              preferences: syncPreferences ? current.preferences : null,
              classId: klass.id,
              status: 'ACTIVE',
            },
            include: { klass: true },
          })

          return { klass, created }
        })

        const token = await reply.jwtSign({ sub: result.created.id, role: result.created.role })
        return reply.code(201).send({
          token,
          user: publicUser(result.created),
          class: {
            id: result.klass.id,
            name: result.klass.name,
            type: result.klass.type,
            xzzdClassId: result.klass.xzzdClassId,
          },
        })
      } catch (error) {
        if (error instanceof ClassAccountError) {
          return reply.code(error.statusCode).send({ error: error.code, message: error.message })
        }
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
          return reply.code(409).send({ error: 'ALREADY_EXISTS', message: '课程或用户名已存在' })
        }
        throw error
      }
    },
  )

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

      const currentStudents = await prisma.user.findMany({
        where: { classId: klass.id, role: 'STUDENT', status: 'ACTIVE', studentId: { not: null } },
        select: { studentId: true, name: true },
      })
      const currentNos = new Set(currentStudents.map((student) => student.studentId ?? ''))
      const fetchedNos = new Set(enrollments.map((enrollment) => enrollment.studentId))

      const added = enrollments
        .filter((enrollment) => !currentNos.has(enrollment.studentId))
        .map((enrollment) => ({ studentId: enrollment.studentId, name: enrollment.name }))
      const removed = currentStudents
        .filter((student) => !fetchedNos.has(student.studentId ?? ''))
        .map((student) => ({ studentId: student.studentId ?? '', name: student.name }))
        .filter((student) => student.studentId.length > 0)

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
          const existing = await tx.user.findFirst({
            where: { classId: klass.id, role: 'STUDENT', studentId: entry.studentId },
          })
          if (existing) {
            await tx.user.update({
              where: { id: existing.id },
              data: { name: entry.name, status: 'ACTIVE', removedAt: null },
            })
          } else {
            await tx.user.create({
              data: {
                studentId: entry.studentId,
                name: entry.name,
                classId: klass.id,
                role: 'STUDENT',
                status: 'ACTIVE',
              },
            })
          }
        }

        if (removed.length > 0) {
          await tx.user.updateMany({
            where: {
              classId: klass.id,
              role: 'STUDENT',
              status: 'ACTIVE',
              studentId: { in: removed },
            },
            data: { status: 'REMOVED', removedAt: syncedAt },
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
    if (!requireStaff(request, reply)) return reply

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
    if (!requireStaff(request, reply)) return reply

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

      const { userId } = parsedBody.data

      const student = await prisma.user.findFirst({
        where: { id: userId, classId: klass.id, role: 'STUDENT', status: 'ACTIVE' },
      })
      if (!student) {
        return reply.code(404).send({ error: 'STUDENT_NOT_FOUND', message: '学生不存在' })
      }

      const settings = parseClassSettings(klass.settings)
      const appliedRules = checkpointRuleBit(settings.checkpointRule)

      let claim
      try {
        claim = await prisma.checkpointClaimed.create({
          data: { classId: klass.id, userId, appliedRules },
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
      if (!requireStaff(request, reply)) return reply

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

      const { userId, reason } = parsedBody.data

      const student = await prisma.user.findFirst({
        where: { id: userId, classId: klass.id, role: 'STUDENT', status: 'ACTIVE' },
      })
      if (!student) {
        return reply.code(404).send({ error: 'STUDENT_NOT_FOUND', message: '学生不存在' })
      }

      let focusStudent
      try {
        focusStudent = await prisma.focusStudent.create({
          data: { classId: klass.id, userId, reason: reason ?? '' },
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
