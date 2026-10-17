import type { Class, User } from '@prisma/client'
import type { FastifyInstance, FastifyPluginAsync } from 'fastify'
import { z } from 'zod'

import { verifyCaptcha } from '../lib/hcaptcha'
import { prisma } from '../lib/prisma'
import { hashPassword, verifyPassword } from '../lib/password'
import { isRole, isStaff, type Role } from '../lib/roles'
import type { StudentViewPayload } from '../lib/student-view'
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

const selectionSchema = z.object({
  selectionToken: z.string().min(1),
  userId: z.string().min(1),
})

const exchangeSchema = z.object({
  token: z.string().min(1),
})

/** 选择页候选 */
type LoginCandidate = {
  userId: string
  name: string
  studentId: string | null
  classId: string | null
  className: string | null
  role: Role
}

type SelectionPayload = {
  purpose: 'login-select'
  userIds: string[]
}

type UserWithClass = User & { klass: Class | null }

function toCandidate(user: UserWithClass): LoginCandidate {
  return {
    userId: user.id,
    name: user.name,
    studentId: user.studentId,
    classId: user.classId,
    className: user.klass?.name ?? null,
    role: (isRole(user.role) ? user.role : 'STUDENT') as Role,
  }
}

/** 账号密码命中多个班级时返回选择页数据 */
async function selectionResponse(
  fastify: FastifyInstance,
  candidates: UserWithClass[],
) {
  const selectionToken = fastify.jwt.sign(
    { purpose: 'login-select', userIds: candidates.map((user) => user.id) } satisfies SelectionPayload,
    { expiresIn: '5m' },
  )
  return {
    requiresSelection: true as const,
    selectionToken,
    candidates: candidates.map(toCandidate),
  }
}

/** 登录成功后签发 JWT */
async function issueLogin(fastify: FastifyInstance, user: UserWithClass) {
  const token = await fastify.jwt.sign({ sub: user.id, role: user.role })
  return { token, user: publicUser(user) }
}

/**
 * 账号 / 学号 + 密码登录：可能命中多个班级的账号。
 * - 命中 1 个：直接签发 JWT
 * - 命中多个：返回 selectionToken + 候选，不签发 JWT
 */
async function passwordLogin(
  fastify: FastifyInstance,
  identifier: string,
  password: string,
  expectedRole?: Role,
) {
  const candidates = await prisma.user.findMany({
    where: {
      OR: [{ username: identifier }, { studentId: identifier }],
      status: 'ACTIVE',
      ...(expectedRole ? { role: expectedRole } : {}),
    },
    include: { klass: true },
  })

  if (candidates.length === 0) {
    return { ok: false as const, status: 401, error: 'INVALID_CREDENTIALS', message: '账号或密码错误' }
  }

  const matched: UserWithClass[] = []
  for (const user of candidates) {
    if (!user.password) continue
    if (await verifyPassword(password, user.password)) {
      matched.push(user)
    }
  }

  if (matched.length === 0) {
    return { ok: false as const, status: 401, error: 'INVALID_CREDENTIALS', message: '账号或密码错误' }
  }
  if (matched.length === 1) {
    return { ok: true as const, ...(await issueLogin(fastify, matched[0])) }
  }
  return { ok: true as const, ...(await selectionResponse(fastify, matched)) }
}

/**
 * 首次登录时按学在浙大课程绑定班级：单班模型下仅在恰好命中 1 个班时写入，
 * 幂等，失败仅记录警告，绝不影响登录流程。
 */
async function bindClassOnFirstLogin(
  fastify: FastifyInstance,
  user: UserWithClass,
  instructorCourseIds: number[],
): Promise<UserWithClass> {
  if (!isStaff(user.role) || user.classId) {
    return user
  }

  try {
    const classes = await prisma.class.findMany({ where: { xzzdClassId: { not: null } } })
    const matches = classes.filter((klass) => {
      const xzzdClassId = klass.xzzdClassId
      if (xzzdClassId == null) return false
      return instructorCourseIds.some((courseId) => String(courseId) === xzzdClassId)
    })
    if (matches.length !== 1) {
      if (matches.length > 1) {
        fastify.log.warn({ userId: user.id }, '命中多个班级，单班模型下不自动绑定')
      }
      return user
    }

    return await prisma.user.update({
      where: { id: user.id },
      data: { classId: matches[0].id },
      include: { klass: true },
    })
  } catch (error) {
    fastify.log.warn({ err: error, userId: user.id }, '自动绑定班级失败')
    return user
  }
}

/** 需要人机验证的登录入口（完整路径） */
const CAPTCHA_LOGIN_ROUTES = new Set([
  '/api/auth/login',
  '/api/auth/login/ta',
  '/api/auth/login/teacher',
  '/api/auth/login/student',
  '/api/auth/zjuam/login',
])

export const authRoutes: FastifyPluginAsync = async (fastify) => {
  /** 登录前校验 hCaptcha；未配置 HCAPTCHA_SECRET 时自动跳过 */
  fastify.addHook('preHandler', async (request, reply) => {
    if (request.method !== 'POST') return
    if (!CAPTCHA_LOGIN_ROUTES.has(request.routeOptions.url ?? '')) return

    const raw = (request.body as { captchaToken?: unknown } | null)?.captchaToken
    const token = typeof raw === 'string' ? raw : undefined
    if (!(await verifyCaptcha(token))) {
      return reply.code(400).send({ error: 'CAPTCHA_FAILED', message: '人机验证失败，请重试' })
    }
  })

  /** 通用：用户名 / 学号 + 密码登录（staff / 学生） */
  fastify.post('/login', async (request, reply) => {
    const parsed = loginSchema.safeParse(request.body)
    if (!parsed.success) {
      return reply.code(400).send({ error: 'INVALID_BODY', message: '请输入账号和密码' })
    }

    const result = await passwordLogin(fastify, parsed.data.identifier, parsed.data.password)
    if (!result.ok) {
      return reply.code(result.status).send({ error: result.error, message: result.message })
    }
    return reply.send(result)
  })

  /** 助教专用入口 */
  fastify.post('/login/ta', async (request, reply) => {
    const parsed = loginSchema.safeParse(request.body)
    if (!parsed.success) {
      return reply.code(400).send({ error: 'INVALID_BODY', message: '请输入账号和密码' })
    }

    const result = await passwordLogin(fastify, parsed.data.identifier, parsed.data.password, 'TA')
    if (!result.ok) {
      return reply
        .code(result.status)
        .send({ ...result, message: result.status === 401 ? '该账号不是助教' : result.message })
    }
    return reply.send(result)
  })

  /** 教师专用入口 */
  fastify.post('/login/teacher', async (request, reply) => {
    const parsed = loginSchema.safeParse(request.body)
    if (!parsed.success) {
      return reply.code(400).send({ error: 'INVALID_BODY', message: '请输入账号和密码' })
    }

    const result = await passwordLogin(fastify, parsed.data.identifier, parsed.data.password, 'TEACHER')
    if (!result.ok) {
      return reply
        .code(result.status)
        .send({ ...result, message: result.status === 401 ? '该账号不是教师' : result.message })
    }
    return reply.send(result)
  })

  /** 学生专用入口 */
  fastify.post('/login/student', async (request, reply) => {
    const parsed = loginSchema.safeParse(request.body)
    if (!parsed.success) {
      return reply.code(400).send({ error: 'INVALID_BODY', message: '请输入账号和密码' })
    }

    const result = await passwordLogin(fastify, parsed.data.identifier, parsed.data.password, 'STUDENT')
    if (!result.ok) {
      return reply
        .code(result.status)
        .send({ ...result, message: result.status === 401 ? '该账号不是学生' : result.message })
    }
    return reply.send(result)
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
    const studentId = account
    const { name, zjuPersonId } = result.profile

    const existing = await prisma.user.findMany({
      where: { OR: [{ studentId: account }, { zjuamAccount: account }] },
      include: { klass: true },
    })

    if (existing.length > 0) {
      const active = existing.filter((user) => user.status === 'ACTIVE')
      if (active.length === 0) {
        return reply.code(403).send({ error: 'ACCOUNT_DISABLED', message: '该账号已被移出名单' })
      }

      // 同一人的跨班账号共享统一身份认证信息
      await prisma.user.updateMany({
        where: { id: { in: active.map((user) => user.id) } },
        data: {
          zjuamAccount: account,
          zjuSyncedAt: new Date(),
          ...(zjuPersonId !== undefined ? { zjuPersonId } : {}),
          ...(active.some((user) => user.studentId === null) ? { studentId } : {}),
        },
      })

      if (active.length === 1) {
        const user = await bindClassOnFirstLogin(fastify, active[0], result.instructorCourseIds)
        const refreshed = await prisma.user.findUniqueOrThrow({
          where: { id: user.id },
          include: { klass: true },
        })
        return reply.send(await issueLogin(fastify, refreshed))
      }

      return reply.send(await selectionResponse(fastify, active))
    }

    if (result.isInstructor !== true) {
      return reply.code(403).send({ error: 'NOT_IN_ROSTER', message: '该学号不在助教名单中' })
    }

    // 助教自助注册：按命中的班级各建一条（单班模型）
    const classes = await prisma.class.findMany({ where: { xzzdClassId: { not: null } } })
    const matches = classes.filter((klass) => {
      if (klass.xzzdClassId == null) return false
      return result.instructorCourseIds.some((courseId) => String(courseId) === klass.xzzdClassId)
    })
    if (matches.length === 0) {
      return reply.code(403).send({ error: 'NOT_IN_ROSTER', message: '该学号不在助教名单中' })
    }

    const created = await Promise.all(
      matches.map((klass) =>
        prisma.user.create({
          data: {
            studentId,
            name: name ?? account,
            role: 'TA',
            classId: klass.id,
            zjuamAccount: account,
            zjuPersonId: zjuPersonId ?? null,
            zjuSyncedAt: new Date(),
          },
          include: { klass: true },
        }),
      ),
    )

    if (created.length === 1) {
      return reply.send(await issueLogin(fastify, created[0]))
    }
    return reply.send(await selectionResponse(fastify, created))
  })

  /** 多班选择：校验 selectionToken 后签发所选账号的 JWT */
  fastify.post('/select', async (request, reply) => {
    const parsed = selectionSchema.safeParse(request.body)
    if (!parsed.success) {
      return reply.code(400).send({ error: 'INVALID_BODY', message: '请选择要登录的班级' })
    }

    let payload: SelectionPayload
    try {
      payload = fastify.jwt.verify<SelectionPayload>(parsed.data.selectionToken)
    } catch {
      return reply.code(401).send({ error: 'INVALID_SELECTION', message: '选择已过期，请重新登录' })
    }
    if (payload.purpose !== 'login-select' || !payload.userIds.includes(parsed.data.userId)) {
      return reply.code(401).send({ error: 'INVALID_SELECTION', message: '选择已过期，请重新登录' })
    }

    const user = await prisma.user.findUnique({
      where: { id: parsed.data.userId },
      include: { klass: true },
    })
    if (!user || user.status !== 'ACTIVE') {
      return reply.code(401).send({ error: 'INVALID_SELECTION', message: '账号不可用' })
    }

    return reply.send(await issueLogin(fastify, user))
  })

  /** 学生预览链接换取登录态 */
  fastify.post('/student/exchange', async (request, reply) => {
    const parsed = exchangeSchema.safeParse(request.body)
    if (!parsed.success) {
      return reply.code(400).send({ error: 'INVALID_BODY', message: '链接无效' })
    }

    let payload: StudentViewPayload
    try {
      payload = fastify.jwt.verify<StudentViewPayload>(parsed.data.token)
    } catch {
      return reply.code(401).send({ error: 'INVALID_TOKEN', message: '链接无效或已过期' })
    }

    const user = await prisma.user.findUnique({
      where: { id: payload.userId },
      include: { klass: true },
    })
    if (!user || user.role !== 'STUDENT' || user.status !== 'ACTIVE') {
      return reply.code(401).send({ error: 'INVALID_TOKEN', message: '链接无效或已过期' })
    }

    const experiment = await prisma.experiment.findUnique({
      where: { id: payload.experimentId },
      select: { classId: true },
    })
    if (!experiment || experiment.classId !== user.classId) {
      return reply.code(401).send({ error: 'INVALID_TOKEN', message: '链接无效或已过期' })
    }

    return reply.send(await issueLogin(fastify, user))
  })

  /** 当前登录用户 */
  fastify.get('/me', { onRequest: [fastify.authenticate] }, async (request, reply) => {
    const payload = request.user as { sub: string }
    const user = await prisma.user.findUnique({
      where: { id: payload.sub },
      include: { klass: true },
    })
    if (!user) {
      return reply.code(401).send({ error: 'UNAUTHORIZED', message: '用户不存在' })
    }
    if (user.status !== 'ACTIVE') {
      return reply.code(403).send({ error: 'ACCOUNT_DISABLED', message: '该账号已被移出名单' })
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
    const current = await prisma.user.findUnique({ where: { id: sub }, include: { klass: true } })
    if (!current) {
      return reply.code(401).send({ error: 'UNAUTHORIZED', message: '用户不存在' })
    }

    const { username, password } = parsed.data

    const clash = await prisma.user.findFirst({
      where: {
        username,
        classId: current.classId,
        NOT: { id: current.id },
      },
      select: { id: true },
    })
    if (clash) {
      return reply.code(409).send({ error: 'USERNAME_TAKEN', message: '该用户名在本班已存在' })
    }

    const passwordHash = password ? await hashPassword(password) : undefined

    const updatedUser = await prisma.user.update({
      where: { id: sub },
      data: { username, name: username, ...(passwordHash ? { password: passwordHash } : {}) },
      include: { klass: true },
    })

    return reply.send({ user: publicUser(updatedUser) })
  })

  /** 退出登录（JWT 无状态，由客户端丢弃 token） */
  fastify.post('/logout', async (_request, reply) => {
    return reply.send({ ok: true })
  })
}
