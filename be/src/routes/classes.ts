import type { Class } from '@prisma/client'
import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from 'fastify'
import { z } from 'zod'

import { decryptSecret } from '../lib/crypto'
import { prisma } from '../lib/prisma'
import { isStaff } from '../lib/roles'
import { publicUser } from '../lib/user'
import type { ZjuamEnrollment } from '../lib/zjuam'
import { listEnrollments, ZjuamError } from '../lib/zjuam'

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

/** 重点关注记录统一 include（学生姓名 / 学号） */
const focusInclude = { student: { select: { name: true, studentNo: true } } } as const

export const classesRoutes: FastifyPluginAsync = async (fastify) => {
  /** 当前登录用户是否为助教 / 教师 */
  function requireStaff(request: FastifyRequest): boolean {
    const payload = request.user as { role?: string }
    return isStaff(payload.role ?? '')
  }

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

  /** 解析请求体或用户已保存的统一身份认证凭据 */
  async function resolveCredentials(
    userId: string,
    input: { account?: string; password?: string },
  ): Promise<{ account: string; password: string } | null> {
    const user = await prisma.user.findUnique({ where: { id: userId } })
    if (!user) return null

    const account = input.account?.trim() || user.zjuamAccount
    let password = input.password
    if (!password && user.zjuamPassword) {
      // 密文损坏 / 密钥不匹配时按“未保存密码”处理，避免 500。
      try {
        password = decryptSecret(user.zjuamPassword)
      } catch {
        password = undefined
      }
    }

    if (!account || !password) return null
    return { account, password }
  }

  /** 新建班级并将当前用户关联到该班级 */
  fastify.post('/', { onRequest: [fastify.authenticate] }, async (request, reply) => {
    if (!requireStaff(request)) {
      return reply.code(403).send({ error: 'FORBIDDEN', message: '仅助教或教师可操作' })
    }

    const parsed = createClassSchema.safeParse(request.body)
    if (!parsed.success) {
      return reply.code(400).send({ error: 'INVALID_BODY', message: '请求参数不正确' })
    }

    const { xzzdClassId, name, type } = parsed.data
    const existing = await prisma.class.findFirst({ where: { xzzdClassId } })
    if (existing) {
      return reply.code(409).send({ error: 'ALREADY_EXISTS', message: '该课程已存在' })
    }

    const klass = await prisma.class.create({ data: { xzzdClassId, name, type } })

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
    if (!requireStaff(request)) {
      return reply.code(403).send({ error: 'FORBIDDEN', message: '仅助教或教师可操作' })
    }

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
      if (!requireStaff(request)) {
        return reply.code(403).send({ error: 'FORBIDDEN', message: '仅助教或教师可操作' })
      }

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
      const credentials = await resolveCredentials(sub, parsedBody.data)
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
        if (error instanceof ZjuamError) {
          if (error.code === 'ZJUAM_AUTH_FAILED') {
            return reply.code(401).send({ error: 'ZJUAM_AUTH_FAILED' })
          }
          return reply
            .code(502)
            .send({ error: 'ZJUAM_UNAVAILABLE', message: '统一身份认证服务暂时不可用' })
        }
        throw error
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
      if (!requireStaff(request)) {
        return reply.code(403).send({ error: 'FORBIDDEN', message: '仅助教或教师可操作' })
      }

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

      const { added, removed } = parsedBody.data

      for (const entry of added) {
        const existing = await prisma.student.findFirst({
          where: { classId: klass.id, studentNo: entry.studentNo },
        })
        if (existing) {
          await prisma.student.update({
            where: { stuId: existing.stuId },
            data: { name: entry.name },
          })
        } else {
          await prisma.student.create({
            data: { studentNo: entry.studentNo, name: entry.name, classId: klass.id },
          })
        }
      }

      for (const studentNo of removed) {
        await prisma.student.deleteMany({ where: { classId: klass.id, studentNo } })
      }

      const syncedAt = new Date()
      await prisma.class.update({
        where: { id: klass.id },
        data: { lastRosterSyncAt: syncedAt },
      })

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
    if (!requireStaff(request)) {
      return reply.code(403).send({ error: 'FORBIDDEN', message: '仅助教或教师可操作' })
    }

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

    return reply.send({ settings: parseClassSettings(updated.settings) })
  })

  /** Checkpoint 认领记录列表 */
  fastify.get('/:id/checkpoints', { onRequest: [fastify.authenticate] }, async (request, reply) => {
    const parsed = classParamsSchema.safeParse(request.params)
    if (!parsed.success) {
      return reply.code(400).send({ error: 'INVALID_BODY', message: '请求参数不正确' })
    }

    const klass = await resolveOwnedClass(request, reply, parsed.data.id)
    if (!klass) return reply

    const claims = await prisma.checkpointClaimed.findMany({
      where: { classId: klass.id },
      include: { student: { select: { name: true, studentNo: true } } },
      orderBy: { createdAt: 'desc' },
    })

    return reply.send({ claims })
  })

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
      if (!requireStaff(request)) {
        return reply.code(403).send({ error: 'FORBIDDEN', message: '仅助教或教师可操作' })
      }

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

      const existing = await prisma.focusStudent.findUnique({
        where: { classId_stuId: { classId: klass.id, stuId } },
      })
      if (existing) {
        return reply.code(409).send({ error: 'ALREADY_EXISTS', message: '该学生已在重点关注名单中' })
      }

      const focusStudent = await prisma.focusStudent.create({
        data: { classId: klass.id, stuId, reason: reason ?? '' },
        include: focusInclude,
      })

      return reply.code(201).send({ focusStudent })
    },
  )

  /** 修改重点关注原因 */
  fastify.patch(
    '/:id/focus-students/:focusId',
    { onRequest: [fastify.authenticate] },
    async (request, reply) => {
      if (!requireStaff(request)) {
        return reply.code(403).send({ error: 'FORBIDDEN', message: '仅助教或教师可操作' })
      }

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
      if (!requireStaff(request)) {
        return reply.code(403).send({ error: 'FORBIDDEN', message: '仅助教或教师可操作' })
      }

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
