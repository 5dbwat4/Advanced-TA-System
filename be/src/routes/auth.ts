import type { Class, User } from '@prisma/client'
import type { FastifyInstance, FastifyPluginAsync } from 'fastify'
import { z } from 'zod'

import { prisma } from '../lib/prisma'
import { hashPassword, verifyPassword } from '../lib/password'
import { isStaff, type Role } from '../lib/roles'
import { publicUser } from '../lib/user'
import { loginToCourses, ZjuamError } from '../lib/zjuam'

const loginSchema = z.object({
  /** 用户名 或 学号 */
  identifier: z.string().trim().min(1),
  password: z.string().min(1),
})

const zjuamLoginSchema = z.object({
  account: z.string().trim().min(1),
  password: z.string().min(1),
})

const setupSchema = z.object({
  username: z.string().trim().min(1).max(32),
  /** 可留空；留空视为不设置密码 */
  password: z
    .union([z.literal(''), z.string().min(8).max(128)])
    .optional()
    .transform((value) => (value ? value : undefined)),
})

/** 助教 / 老师 的通用账号密码校验 */
async function staffPasswordLogin(
  identifier: string,
  password: string,
  expectedRole?: Extract<Role, 'TA' | 'TEACHER'>,
) {
  const user = await prisma.user.findFirst({
    where: { OR: [{ username: identifier }, { studentId: identifier }] },
    include: { classes: true },
  })

  if (!user || !user.password) {
    return { ok: false as const, status: 401, error: 'INVALID_CREDENTIALS', message: '账号或密码错误' }
  }
  if (!isStaff(user.role)) {
    return { ok: false as const, status: 403, error: 'STAFF_ONLY', message: '该账号不是助教或教师' }
  }
  if (expectedRole && user.role !== expectedRole) {
    return { ok: false as const, status: 403, error: 'ROLE_MISMATCH', message: '该账号不属于所选身份' }
  }

  const valid = await verifyPassword(password, user.password)
  if (!valid) {
    return { ok: false as const, status: 401, error: 'INVALID_CREDENTIALS', message: '账号或密码错误' }
  }

  return { ok: true as const, user }
}

/**
 * 首次登录时按学在浙大课程自动绑定班级：仅当用户为助教 / 教师时执行，
 * 将 instructorCourseIds 命中的全部班级（多对多）连入，幂等，失败仅记录警告，绝不影响登录流程。
 */
async function bindClassOnFirstLogin(
  fastify: FastifyInstance,
  user: User & { classes?: Class[] },
  instructorCourseIds: number[],
): Promise<User & { classes: Class[] }> {
  if (!isStaff(user.role)) {
    return { ...user, classes: user.classes ?? [] }
  }

  try {
    const classes = await prisma.class.findMany({ where: { xzzdClassId: { not: null } } })
    const matches = classes.filter((klass) => {
      const xzzdClassId = klass.xzzdClassId
      if (xzzdClassId == null) return false
      return instructorCourseIds.some((courseId) => String(courseId) === xzzdClassId)
    })
    if (matches.length === 0) {
      return { ...user, classes: user.classes ?? [] }
    }

    return await prisma.user.update({
      where: { id: user.id },
      data: { classes: { connect: matches.map((klass) => ({ id: klass.id })) } },
      include: { classes: true },
    })
  } catch (error) {
    fastify.log.warn({ err: error, userId: user.id }, '自动绑定班级失败')
    return { ...user, classes: user.classes ?? [] }
  }
}

export const authRoutes: FastifyPluginAsync = async (fastify) => {
  /** 助教 / 老师：用户名 或 学号 + 密码 登录 */
  fastify.post('/login', async (request, reply) => {
    const parsed = loginSchema.safeParse(request.body)
    if (!parsed.success) {
      return reply.code(400).send({ error: 'INVALID_BODY', message: '请输入账号和密码' })
    }

    const result = await staffPasswordLogin(parsed.data.identifier, parsed.data.password)
    if (!result.ok) {
      return reply.code(result.status).send({ error: result.error, message: result.message })
    }

    const token = await reply.jwtSign({ sub: result.user.id, role: result.user.role })
    return reply.send({ token, user: publicUser(result.user) })
  })

  /** 助教专用入口 */
  fastify.post('/login/ta', async (request, reply) => {
    const parsed = loginSchema.safeParse(request.body)
    if (!parsed.success) {
      return reply.code(400).send({ error: 'INVALID_BODY', message: '请输入账号和密码' })
    }

    const result = await staffPasswordLogin(parsed.data.identifier, parsed.data.password, 'TA')
    if (!result.ok) {
      return reply.code(result.status).send({ error: result.error, message: result.message })
    }

    const token = await reply.jwtSign({ sub: result.user.id, role: result.user.role })
    return reply.send({ token, user: publicUser(result.user) })
  })

  /** 教师专用入口 */
  fastify.post('/login/teacher', async (request, reply) => {
    const parsed = loginSchema.safeParse(request.body)
    if (!parsed.success) {
      return reply.code(400).send({ error: 'INVALID_BODY', message: '请输入账号和密码' })
    }

    const result = await staffPasswordLogin(parsed.data.identifier, parsed.data.password, 'TEACHER')
    if (!result.ok) {
      return reply.code(result.status).send({ error: result.error, message: result.message })
    }

    const token = await reply.jwtSign({ sub: result.user.id, role: result.user.role })
    return reply.send({ token, user: publicUser(result.user) })
  })

  /** 统一身份认证（ZJUAM）登录：一等身份，成功即自动开通 / 关联本地 User */
  fastify.post('/zjuam/login', async (request, reply) => {
    const parsed = zjuamLoginSchema.safeParse(request.body)
    if (!parsed.success) {
      return reply.code(400).send({ error: 'INVALID_BODY', message: '请输入统一身份认证账号和密码' })
    }

    const { account, password } = parsed.data

    const loginResult = await loginToCourses(account, password).catch((error: unknown) => {
      if (error instanceof ZjuamError) return error
      throw error
    })

    if (loginResult instanceof ZjuamError) {
      if (loginResult.code === 'ZJUAM_AUTH_FAILED') {
        return reply.code(401).send({ error: 'ZJUAM_AUTH_FAILED', message: '统一身份认证账号或密码错误' })
      }
      return reply.code(502).send({ error: 'ZJUAM_UNAVAILABLE', message: '统一身份认证服务暂时不可用' })
    }

    const result = loginResult

    // 凭据正确即可信任该统一身份认证账号对应此学号
    const studentId = account
    const { name, zjuPersonId } = result.profile

    const existing =
      (await prisma.user.findUnique({ where: { studentId }, include: { classes: true } })) ??
      (await prisma.user.findFirst({ where: { zjuamAccount: account }, include: { classes: true } }))

    if (existing) {
      // 预置学号（白名单）：无论是否 isInstructor 均允许登录，保留 DB 的 role / name
      let user = await prisma.user.update({
        where: { id: existing.id },
        data: {
          zjuamAccount: account,
          zjuSyncedAt: new Date(),
          ...(zjuPersonId !== undefined ? { zjuPersonId } : {}),
          // 仅在原本为空时回填；findUnique 已确认该学号未被其他行占用
          ...(existing.studentId === null ? { studentId } : {}),
        },
        include: { classes: true },
      })

      user = await bindClassOnFirstLogin(fastify, user, result.instructorCourseIds)

      const token = await reply.jwtSign({ sub: user.id, role: user.role })
      return reply.send({ token, user: publicUser(user) })
    }

    if (result.isInstructor !== true) {
      return reply.code(403).send({ error: 'NOT_IN_ROSTER', message: '该学号未在助教名单中' })
    }

    // 助教自助注册：username 留空，前端据此引导至完善信息页
    let user = await prisma.user.create({
      data: {
        studentId,
        name: name ?? account,
        role: 'TA',
        zjuamAccount: account,
        zjuPersonId: zjuPersonId ?? null,
        zjuSyncedAt: new Date(),
      },
      include: { classes: true },
    })

    user = await bindClassOnFirstLogin(fastify, user, result.instructorCourseIds)

    const token = await reply.jwtSign({ sub: user.id, role: user.role })
    return reply.send({ token, user: publicUser(user) })
  })

  /** 学生登录：暂未开放 */
  fastify.post('/login/student', async (_request, reply) => {
    return reply.code(501).send({ error: 'NOT_IMPLEMENTED', message: '学生登录暂未开放' })
  })

  /** 当前登录用户 */
  fastify.get('/me', { onRequest: [fastify.authenticate] }, async (request, reply) => {
    const payload = request.user as { sub: string }
    const user = await prisma.user.findUnique({
      where: { id: payload.sub },
      include: { classes: true },
    })
    if (!user) {
      return reply.code(401).send({ error: 'UNAUTHORIZED', message: '用户不存在' })
    }
    return reply.send({ user: publicUser(user) })
  })

  /** 完善信息：统一身份认证自动开通的账号设置用户名 / 可选密码 */
  fastify.post('/setup', { onRequest: [fastify.authenticate] }, async (request, reply) => {
    const parsed = setupSchema.safeParse(request.body)
    if (!parsed.success) {
      return reply.code(400).send({
        error: 'INVALID_BODY',
        message: '姓名长度需为 1-32 个字符（密码若填写至少 8 位）',
      })
    }

    const { sub } = request.user as { sub: string }
    const current = await prisma.user.findUnique({ where: { id: sub }, include: { classes: true } })
    if (!current) {
      return reply.code(401).send({ error: 'UNAUTHORIZED', message: '用户不存在' })
    }

    const { username, password } = parsed.data

    const passwordHash = password ? await hashPassword(password) : undefined

    const updatedUser = await prisma.user.update({
      where: { id: sub },
      data: { username, name: username, ...(passwordHash ? { password: passwordHash } : {}) },
      include: { classes: true },
    })

    return reply.send({ user: publicUser(updatedUser) })
  })

  /** 退出登录（JWT 无状态，由客户端丢弃 token） */
  fastify.post('/logout', async (_request, reply) => {
    return reply.send({ ok: true })
  })
}
