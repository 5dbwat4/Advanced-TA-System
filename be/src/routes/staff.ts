import { randomBytes } from 'node:crypto'
import type { Class, User } from '@prisma/client'
import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'

import { requireStaffRole, requireViewerOrStaff } from '../lib/class-access.js'
import { hashPassword } from '../lib/password.js'
import { prisma } from '../lib/prisma.js'
import { INVITABLE_ROLES } from '../lib/roles.js'

const createTaSchema = z.object({
  /** 学号 */
  studentId: z.string().trim().min(1).max(32),
})

const createMemberSchema = z.object({
  /** 学工号 */
  studentId: z.string().trim().min(1).max(32),
  role: z.enum(INVITABLE_ROLES),
})

const listMembersQuerySchema = z.object({
  classId: z.string().trim().min(1).optional(),
})

/** Staff 名单显示顺序：教师 → 助教 → 观察者 */
const STAFF_ROLE_ORDER: Record<string, number> = { TEACHER: 0, TA: 1, VIEWER: 2 }

const staffMemberSelect = {
  id: true,
  name: true,
  role: true,
  studentId: true,
  username: true,
  avatar: true,
} as const

type StaffMemberRow = {
  id: string
  name: string
  role: string
  studentId: string | null
  username: string | null
  avatar: number | null
}

/** Staff 名单项的安全输出结构 */
function toStaffMember(user: StaffMemberRow) {
  return {
    id: user.id,
    name: user.name,
    role: user.role,
    studentId: user.studentId ?? '',
    username: user.username,
    avatar: user.avatar,
  }
}

type TaWithClass = User & { klass: Class | null }

/** 助教列表项的安全输出结构 */
function toTa(user: TaWithClass) {
  return {
    id: user.id,
    name: user.name,
    role: user.role,
    studentId: user.studentId,
    username: user.username,
    classId: user.classId,
    classes: user.klass
      ? [{ id: user.klass.id, name: user.klass.name, type: user.klass.type }]
      : [],
    activated: Boolean(user.username),
    hasPassword: Boolean(user.password),
    zjuamAccount: user.zjuamAccount,
    createdAt: user.createdAt,
  }
}

export const staffRoutes: FastifyPluginAsync = async (fastify) => {
  /** 当前课程的 Staff 名单（教师 / 助教 / 观察者） */
  fastify.get('/members', { onRequest: [fastify.authenticate, requireViewerOrStaff] }, async (request, reply) => {
    const parsed = listMembersQuerySchema.safeParse(request.query)
    if (!parsed.success) {
      return reply.code(400).send({ error: 'INVALID_QUERY', message: '课程参数无效' })
    }

    const { sub } = request.user as { sub: string }
    const me = await prisma.user.findUnique({
      where: { id: sub },
      select: { classId: true },
    })
    const classId = parsed.data.classId ?? me?.classId ?? null
    if (!classId) {
      return reply
        .code(400)
        .send({ error: 'CLASS_REQUIRED', message: '当前账号未绑定班级，无法查看 Staff 名单' })
    }
    if (me?.classId !== classId) {
      return reply.code(403).send({ error: 'FORBIDDEN', message: '无权查看该课程的 Staff 名单' })
    }

    const members = await prisma.user.findMany({
      where: { classId, role: { in: [...INVITABLE_ROLES] } },
      select: staffMemberSelect,
      orderBy: { createdAt: 'asc' },
    })

    members.sort(
      (a, b) => (STAFF_ROLE_ORDER[a.role] ?? 99) - (STAFF_ROLE_ORDER[b.role] ?? 99),
    )

    return { members: members.map(toStaffMember) }
  })

  /**
   * 为当前班级添加助教：创建【学号 + 班级】记录，并生成一次性初始密码。
   * 该账号首次登录后仍需在 /setup 设置用户名，并可绑定密码 / WebAuthn。
   */
  fastify.post('/tas/class', { onRequest: [fastify.authenticate, requireStaffRole] }, async (request, reply) => {

    const parsed = createTaSchema.safeParse(request.body)
    if (!parsed.success) {
      return reply.code(400).send({ error: 'INVALID_BODY', message: '请输入有效的学号' })
    }

    const { sub } = request.user as { sub: string }
    const current = await prisma.user.findUnique({
      where: { id: sub },
      select: { classId: true },
    })
    if (!current?.classId) {
      return reply
        .code(400)
        .send({ error: 'CLASS_REQUIRED', message: '当前账号未绑定班级，无法添加助教' })
    }

    const { studentId } = parsed.data
    const existing = await prisma.user.findFirst({
      where: { studentId, classId: current.classId },
      select: { id: true, role: true },
    })
    if (existing) {
      return reply.code(409).send({
        error: 'ALREADY_EXISTS',
        message: existing.role === 'TA' ? '该学号已是本班助教' : '该学号已在本班中',
      })
    }

    const password = randomBytes(12).toString('hex')
    const passwordHash = await hashPassword(password)

    const unbound = await prisma.user.findFirst({
      where: { studentId, role: 'TA', classId: null, status: 'ACTIVE' },
      orderBy: { createdAt: 'asc' },
    })
    const user = unbound
      ? await prisma.user.update({
          where: { id: unbound.id },
          data: {
            classId: current.classId,
            password: passwordHash,
            ...(unbound.username ? {} : { name: studentId }),
          },
          include: { klass: true },
        })
      : await prisma.user.create({
          data: {
            studentId,
            name: studentId,
            role: 'TA',
            classId: current.classId,
            password: passwordHash,
          },
          include: { klass: true },
        })

    return reply.code(201).send({ ta: toTa(user), password })
  })

  /**
   * 为当前班级添加指定角色的用户：创建【学工号 + 班级】记录，并生成一次性初始密码。
   */
  fastify.post('/users/class', { onRequest: [fastify.authenticate, requireStaffRole] }, async (request, reply) => {

    const parsed = createMemberSchema.safeParse(request.body)
    if (!parsed.success) {
      return reply.code(400).send({ error: 'INVALID_BODY', message: '请输入有效的学工号 / 用户名和用户类型' })
    }

    const { sub } = request.user as { sub: string }
    const current = await prisma.user.findUnique({
      where: { id: sub },
      select: { classId: true },
    })
    if (!current?.classId) {
      return reply
        .code(400)
        .send({ error: 'CLASS_REQUIRED', message: '当前账号未绑定班级，无法添加用户' })
    }

    const { studentId, role } = parsed.data
    const existing = await prisma.user.findFirst({
      where: {
        classId: current.classId,
        OR: [{ studentId }, { username: studentId }],
      },
      select: { id: true, role: true },
    })
    if (existing) {
      return reply.code(409).send({
        error: 'ALREADY_EXISTS',
        message: `该学工号 / 用户名已在本班中（${existing.role}）`,
      })
    }

    const password = randomBytes(12).toString('hex')
    const passwordHash = await hashPassword(password)

    const unbound = await prisma.user.findFirst({
      where: {
        role,
        classId: null,
        status: 'ACTIVE',
        OR: [{ studentId }, { username: studentId }],
      },
      orderBy: { createdAt: 'asc' },
    })
    const user = unbound
      ? await prisma.user.update({
          where: { id: unbound.id },
          data: {
            classId: current.classId,
            password: passwordHash,
            ...(unbound.username ? {} : { name: studentId }),
          },
          include: { klass: true },
        })
      : await prisma.user.create({
          data: {
            studentId,
            name: studentId,
            role,
            classId: current.classId,
            password: passwordHash,
          },
          include: { klass: true },
        })

    return reply.code(201).send({ user: toTa(user), password })
  })
}
