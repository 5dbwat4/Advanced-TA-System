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

export const classesRoutes: FastifyPluginAsync = async (fastify) => {
  /** 当前登录用户是否为助教 / 教师 */
  function requireStaff(request: FastifyRequest): boolean {
    const payload = request.user as { role?: string }
    return isStaff(payload.role ?? '')
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
}
