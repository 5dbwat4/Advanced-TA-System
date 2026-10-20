import { Prisma, type Class, type User } from '@prisma/client'
import type { FastifyInstance, FastifyPluginAsync } from 'fastify'
import { z } from 'zod'

import { env } from '../env.js'
import { verifyCaptcha } from '../lib/hcaptcha.js'
import { prisma } from '../lib/prisma.js'
import { hashPassword, verifyPassword } from '../lib/password.js'
import { isRole, type Role } from '../lib/roles.js'
import type { StudentViewPayload } from '../lib/student-view.js'
import { isUsernameTaken } from '../lib/username.js'
import { publicUser } from '../lib/user.js'
import { loginToCourses, ZjuamError } from '../lib/zjuam.js'

const loginSchema = z.object({
  /** 用户名 或 学号 */
  identifier: z.string().trim().min(1),
  password: z.string().min(1),
})

const zjuamLoginSchema = z.object({
  account: z.string().trim().min(1),
  password: z.string().min(1),
})

const classSelectSchema = z.object({
  selectionToken: z.string().min(1),
  optionKey: z.string().min(1),
  type: z.enum(['2026-sys1', '2026-sys2', '2026-sys3']).optional(),
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

const switchAccountSchema = z.object({
  userId: z.string().min(1),
})

const studentUnlockSchema = z.object({
  username: z.string().trim().min(1).max(32),
  password: z
    .union([z.literal(''), z.string().min(8).max(128)])
    .optional()
    .transform((value) => (value ? value : undefined)),
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

/** 首次登录选择班级页的可选项；课程可能尚未录入本地 Class */
type ClassSelectOption = {
  key: string
  name: string
  classId: string | null
  courseId: string | null
  registered: boolean
}

type ClassSelectPayload = {
  purpose: 'zjuam-class-select'
  account: string
  name: string | null
  zjuPersonId: number | null
  /** existing=已登记账号；new=未登记但命中已录入课程 */
  mode: 'existing' | 'new'
  options: ClassSelectOption[]
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

/** 首次登录选择班级：签发短期的班级选择 JWT，不直接签发登录 JWT */
function classSelectionResponse(
  fastify: FastifyInstance,
  input: Omit<ClassSelectPayload, 'purpose'>,
) {
  const selectionToken = fastify.jwt.sign(
    { purpose: 'zjuam-class-select', ...input } satisfies ClassSelectPayload,
    { expiresIn: '5m' },
  )
  return {
    requiresClassSelection: true as const,
    selectionToken,
    courses: input.options.map((option) => ({
      key: option.key,
      name: option.name,
      registered: option.registered,
    })),
  }
}

/** 校验班级选择 JWT；无效 / 过期 / 用途不符时返回 null */
function verifyClassSelectToken(
  fastify: FastifyInstance,
  token: string,
): ClassSelectPayload | null {
  try {
    const payload = fastify.jwt.verify<ClassSelectPayload>(token)
    if (
      payload.purpose !== 'zjuam-class-select' ||
      typeof payload.account !== 'string' ||
      (payload.mode !== 'existing' && payload.mode !== 'new') ||
      !Array.isArray(payload.options)
    ) {
      return null
    }
    return payload
  } catch {
    return null
  }
}

/** 课程展示名：优先本地班级名，其次学在浙大显示名 */
function classOptionName(input: {
  className?: string | null
  displayName?: string | null
  courseName?: string | null
  courseId: string
}): string {
  return input.className || input.displayName || input.courseName || input.courseId
}

function isUniqueConstraintError(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002'
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

/** 需要人机验证的登录入口（完整路径） */
const CAPTCHA_LOGIN_ROUTES = new Set([
  '/api/auth/login',
  '/api/auth/login/ta',
  '/api/auth/login/teacher',
  '/api/auth/login/student',
  '/api/auth/zjuam/login',
])

/** 是否为 localhost / 127.0.0.1 / ::1（用于开发环境跳过人机验证） */
function isLocalhostOrigin(value: string | undefined): boolean {
  if (!value) return false
  try {
    const hostname = new URL(value).hostname.toLowerCase()
    return (
      hostname === 'localhost' ||
      hostname === '127.0.0.1' ||
      hostname === '[::1]' ||
      hostname === '::1' ||
      hostname.endsWith('.localhost')
    )
  } catch {
    return false
  }
}

function isLocalhostRequest(request: {
  headers: { origin?: string; referer?: string; host?: string }
}): boolean {
  if (isLocalhostOrigin(request.headers.origin) || isLocalhostOrigin(request.headers.referer)) {
    return true
  }
  if (request.headers.origin || request.headers.referer) return false
  return isLocalhostOrigin(request.headers.host ? `http://${request.headers.host}` : undefined)
}

export const authRoutes: FastifyPluginAsync = async (fastify) => {
  /** 登录前校验 hCaptcha；未配置 HCAPTCHA_SECRET 时自动跳过 */
  fastify.addHook('preHandler', async (request, reply) => {
    if (request.method !== 'POST') return
    if (!CAPTCHA_LOGIN_ROUTES.has(request.routeOptions.url ?? '')) return
    if (env.isDev && isLocalhostRequest(request)) return

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
    const name = result.profile.name ?? null
    const zjuPersonId = result.profile.zjuPersonId ?? null
    const instructorCourses = result.instructorCourses

    const instructorCourseIdSet = new Set(instructorCourses.map((course) => String(course.id)))
    const allClasses = await prisma.class.findMany({ where: { xzzdClassId: { not: null } } })
    const localClasses = allClasses.filter(
      (klass) => klass.xzzdClassId !== null && instructorCourseIdSet.has(klass.xzzdClassId),
    )
    const localClassByCourseId = new Map(
      localClasses.map((klass) => [klass.xzzdClassId ?? '', klass]),
    )

    const existing = await prisma.user.findMany({
      where: {
        OR: [{ studentId: account }, { zjuamAccount: account }],
        role: { in: ['TA', 'TEACHER'] },
      },
      include: { klass: true },
      orderBy: { createdAt: 'asc' },
    })
    const active = existing.filter((user) => user.status === 'ACTIVE')

    if (existing.length > 0 && active.length === 0) {
      return reply.code(403).send({ error: 'ACCOUNT_DISABLED', message: '该账号已被移出名单' })
    }

    // A. 已登记账号：更新统一身份认证信息；唯一且已绑定班级时直接登录
    if (active.length > 0) {
      await prisma.user.updateMany({
        where: { id: { in: active.map((user) => user.id) } },
        data: {
          zjuamAccount: account,
          zjuSyncedAt: new Date(),
          ...(zjuPersonId !== null ? { zjuPersonId } : {}),
          ...(active.some((user) => user.studentId === null) ? { studentId: account } : {}),
        },
      })

      if (active.length === 1 && active[0].classId) {
        const refreshed = await prisma.user.findUniqueOrThrow({
          where: { id: active[0].id },
          include: { klass: true },
        })
        return reply.send(await issueLogin(fastify, refreshed))
      }

      // 未绑定 / 多班：进入班级选择。A 可选择其担任助教的任意课程（含未录入课程）
      const options = new Map<string, ClassSelectOption>()
      for (const course of instructorCourses) {
        const klass = localClassByCourseId.get(String(course.id))
        const key = klass ? `class:${klass.id}` : `course:${course.id}`
        options.set(key, {
          key,
          name: classOptionName({
            className: klass?.name,
            displayName: course.displayName,
            courseName: course.name,
            courseId: String(course.id),
          }),
          classId: klass?.id ?? null,
          courseId: String(course.id),
          registered: Boolean(klass),
        })
      }
      // 已绑定账号对应的班级也保留为可选项
      for (const user of active) {
        if (!user.klass) continue
        const key = `class:${user.klass.id}`
        if (options.has(key)) continue
        options.set(key, {
          key,
          name: user.klass.name,
          classId: user.klass.id,
          courseId: user.klass.xzzdClassId,
          registered: true,
        })
      }

      if (options.size === 0) {
        return reply.code(403).send({
          error: 'NO_CLASS_AVAILABLE',
          message: '你目前没有可选择的班级，请联系课程教师',
        })
      }

      return reply.send(
        classSelectionResponse(fastify, {
          account,
          name,
          zjuPersonId,
          mode: 'existing',
          options: [...options.values()],
        }),
      )
    }

    // B. 未登记：只有在已录入课程中担任助教才放行，且只能选择这些已录入课程
    if (localClasses.length === 0) {
      return reply.code(403).send({
        error: 'NOT_IN_REGISTERED_COURSE',
        message: '该学号未在已录入的课程中担任助教',
      })
    }

    return reply.send(
      classSelectionResponse(fastify, {
        account,
        name,
        zjuPersonId,
        mode: 'new',
        options: localClasses.map((klass) => ({
          key: `class:${klass.id}`,
          name: klass.name,
          classId: klass.id,
          courseId: klass.xzzdClassId,
          registered: true,
        })),
      }),
    )
  })

  /** 首次登录选择班级：校验短期 JWT 后绑定 / 创建账号并签发登录 JWT */
  fastify.post('/zjuam/select-class', async (request, reply) => {
    const parsed = classSelectSchema.safeParse(request.body)
    if (!parsed.success) {
      return reply.code(400).send({ error: 'INVALID_BODY', message: '请选择要进入的班级' })
    }

    const payload = verifyClassSelectToken(fastify, parsed.data.selectionToken)
    if (!payload) {
      return reply.code(401).send({ error: 'INVALID_SELECTION', message: '选择已过期，请重新登录' })
    }

    const option = payload.options.find((item) => item.key === parsed.data.optionKey)
    if (!option) {
      return reply.code(401).send({ error: 'INVALID_SELECTION', message: '选择已过期，请重新登录' })
    }

    const account = payload.account
    const accountWhere: Prisma.UserWhereInput = {
      status: 'ACTIVE',
      role: { in: ['TA', 'TEACHER'] },
      OR: [{ studentId: account }, { zjuamAccount: account }],
    }

    // 防止在登录 / 选择班级的间隙账号被移除后重新创建
    const knownAccounts = await prisma.user.findMany({
      where: {
        role: { in: ['TA', 'TEACHER'] },
        OR: [{ studentId: account }, { zjuamAccount: account }],
      },
      select: { status: true },
    })
    if (knownAccounts.length > 0 && knownAccounts.every((item) => item.status !== 'ACTIVE')) {
      return reply.code(403).send({ error: 'ACCOUNT_DISABLED', message: '该账号已被移出名单' })
    }

    let klass: Class | null = null
    if (option.classId) {
      klass = await prisma.class.findUnique({ where: { id: option.classId } })
    }
    if (!klass && option.courseId) {
      klass = await prisma.class.findUnique({ where: { xzzdClassId: option.courseId } })
    }

    if (!klass) {
      // 仅 A 类用户可以选择尚未录入的课程；B 类只能选已录入课程
      if (payload.mode !== 'existing' || option.registered || !option.courseId) {
        return reply.code(409).send({ error: 'CLASS_UNAVAILABLE', message: '该班级已不存在，请重新登录' })
      }
      if (!parsed.data.type) {
        return reply.code(400).send({ error: 'CLASS_TYPE_REQUIRED', message: '请选择班级类型' })
      }

      try {
        klass = await prisma.class.create({
          data: {
            xzzdClassId: option.courseId,
            name: option.name,
            type: parsed.data.type,
          },
        })
      } catch (error) {
        if (!isUniqueConstraintError(error)) throw error
        klass = await prisma.class.findUnique({ where: { xzzdClassId: option.courseId } })
        if (!klass) {
          return reply.code(409).send({ error: 'CLASS_UNAVAILABLE', message: '班级创建失败，请重试' })
        }
      }
    }

    const zjuamData = {
      zjuamAccount: account,
      zjuPersonId: payload.zjuPersonId,
      zjuSyncedAt: new Date(),
    }

    let user = await prisma.user.findFirst({
      where: { ...accountWhere, classId: klass.id },
      include: { klass: true },
    })
    if (user) {
      user = await prisma.user.update({
        where: { id: user.id },
        data: {
          ...zjuamData,
          ...(user.studentId === null ? { studentId: account } : {}),
          ...(user.username ? {} : { name: payload.name ?? user.name }),
        },
        include: { klass: true },
      })
      return reply.send(await issueLogin(fastify, user))
    }

    // 优先复用“添加新助教”预置的未绑定账号
    const unbound = await prisma.user.findFirst({
      where: { ...accountWhere, classId: null },
      include: { klass: true },
      orderBy: { createdAt: 'asc' },
    })
    if (unbound) {
      user = await prisma.user.update({
        where: { id: unbound.id },
        data: {
          ...zjuamData,
          ...(unbound.studentId === null ? { studentId: account } : {}),
          classId: klass.id,
          ...(unbound.username ? {} : { name: payload.name ?? unbound.name }),
        },
        include: { klass: true },
      })
      return reply.send(await issueLogin(fastify, user))
    }

    try {
      user = await prisma.user.create({
        data: {
          studentId: account,
          name: payload.name ?? account,
          role: 'TA',
          classId: klass.id,
          ...zjuamData,
        },
        include: { klass: true },
      })
    } catch (error) {
      if (!isUniqueConstraintError(error)) throw error
      user = await prisma.user.findFirst({
        where: { ...accountWhere, classId: klass.id },
        include: { klass: true },
      })
      if (!user) {
        return reply.code(409).send({ error: 'ACCOUNT_EXISTS', message: '该班级已存在你的账号' })
      }
    }

    return reply.send(await issueLogin(fastify, user))
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

    const { uid, eid } = payload
    if (typeof uid !== 'string' || typeof eid !== 'string') {
      return reply.code(401).send({ error: 'INVALID_TOKEN', message: '链接无效或已过期' })
    }

    const user = await prisma.user.findUnique({
      where: { id: uid },
      include: { klass: true },
    })
    if (!user || user.role !== 'STUDENT' || user.status !== 'ACTIVE') {
      return reply.code(401).send({ error: 'INVALID_TOKEN', message: '链接无效或已过期' })
    }

    const experiment = await prisma.experiment.findUnique({
      where: { id: eid },
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

  /** 当前学号已绑定的全部课程账号（含助教 / 学生身份） */
  fastify.get('/accounts', { onRequest: [fastify.authenticate] }, async (request, reply) => {
    const payload = request.user as { sub: string }
    const current = await prisma.user.findUnique({
      where: { id: payload.sub },
      select: { id: true, studentId: true },
    })
    if (!current) {
      return reply.code(401).send({ error: 'UNAUTHORIZED', message: '用户不存在' })
    }

    const users = await prisma.user.findMany({
      where: current.studentId
        ? { studentId: current.studentId, status: 'ACTIVE' }
        : { id: current.id, status: 'ACTIVE' },
      include: { klass: true },
      orderBy: { createdAt: 'asc' },
    })

    return reply.send({ accounts: users.map(toCandidate) })
  })

  /** 在同学号的多个课程账号之间切换 */
  fastify.post(
    '/accounts/switch',
    { onRequest: [fastify.authenticate] },
    async (request, reply) => {
      const parsed = switchAccountSchema.safeParse(request.body)
      if (!parsed.success) {
        return reply.code(400).send({ error: 'INVALID_BODY', message: '请求参数不正确' })
      }

      const payload = request.user as { sub: string }
      const current = await prisma.user.findUnique({
        where: { id: payload.sub },
        select: { studentId: true, role: true, status: true },
      })
      if (!current || current.status !== 'ACTIVE') {
        return reply.code(401).send({ error: 'UNAUTHORIZED', message: '用户不存在' })
      }

      const target = await prisma.user.findUnique({
        where: { id: parsed.data.userId },
        include: { klass: true },
      })
      if (!target || target.status !== 'ACTIVE') {
        return reply.code(404).send({ error: 'ACCOUNT_NOT_FOUND', message: '账号不存在' })
      }
      if (!current.studentId || target.studentId !== current.studentId) {
        return reply.code(403).send({ error: 'ACCOUNT_MISMATCH', message: '只能切换到同学号的账号' })
      }
      if (current.role === 'STUDENT' && target.role !== 'STUDENT') {
        return reply.code(403).send({ error: 'FORBIDDEN', message: '学生账号不能切换到助教账号' })
      }

      return reply.send(await issueLogin(fastify, target))
    },
  )

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

    if (await isUsernameTaken(prisma, username, current)) {
      return reply.code(409).send({ error: 'USERNAME_TAKEN', message: '该用户名已被占用' })
    }

    const passwordHash = password ? await hashPassword(password) : undefined

    const updatedUser = await prisma.user.update({
      where: { id: sub },
      data: { username, name: username, ...(passwordHash ? { password: passwordHash } : {}) },
      include: { klass: true },
    })

    return reply.send({ user: publicUser(updatedUser) })
  })

  /** 学生首次进入：设置用户名，可选设置密码（WebAuthn 由前端直接绑定） */
  fastify.post(
    '/student/unlock',
    { onRequest: [fastify.authenticate] },
    async (request, reply) => {
      const parsed = studentUnlockSchema.safeParse(request.body)
      if (!parsed.success) {
        return reply.code(400).send({
          error: 'INVALID_BODY',
          message: '用户名长度需为 1-32 个字符（密码若填写至少 8 位）',
        })
      }

      const { sub } = request.user as { sub: string }
      const current = await prisma.user.findUnique({
        where: { id: sub },
        include: { klass: true },
      })
      if (!current) {
        return reply.code(401).send({ error: 'UNAUTHORIZED', message: '用户不存在' })
      }
      if (current.role !== 'STUDENT') {
        return reply.code(403).send({ error: 'FORBIDDEN', message: '仅学生账号可解封' })
      }
      if (current.status !== 'ACTIVE') {
        return reply.code(403).send({ error: 'ACCOUNT_DISABLED', message: '该账号已被移出名单' })
      }
      if (current.username) {
        return reply.code(409).send({ error: 'ALREADY_UNLOCKED', message: '账号已解封' })
      }

      const { username, password } = parsed.data
      if (await isUsernameTaken(prisma, username, current)) {
        return reply.code(409).send({ error: 'USERNAME_TAKEN', message: '该用户名已被占用' })
      }

      const passwordHash = password ? await hashPassword(password) : undefined
      const updated = await prisma.user.update({
        where: { id: current.id },
        data: { username, ...(passwordHash ? { password: passwordHash } : {}) },
        include: { klass: true },
      })

      return reply.send({ user: publicUser(updated) })
    },
  )

  /** 退出登录（JWT 无状态，由客户端丢弃 token） */
  fastify.post('/logout', async (_request, reply) => {
    return reply.send({ ok: true })
  })
}
