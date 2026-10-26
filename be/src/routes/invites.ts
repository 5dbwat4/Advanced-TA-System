import type { FastifyInstance, FastifyPluginAsync } from 'fastify'
import { z } from 'zod'

import { requireStaff } from '../lib/class-access.js'
import { hashPassword } from '../lib/password.js'
import { prisma } from '../lib/prisma.js'
import { INVITABLE_ROLES } from '../lib/roles.js'
import { publicUser } from '../lib/user.js'

/** 邀请链接有效期：7 天 */
const INVITE_TTL_SECONDS = 7 * 24 * 60 * 60

const invitePayloadSchema = z.object({
  type: z.literal('invite-link'),
  inviter: z.string().min(1),
  role: z.enum(INVITABLE_ROLES),
  expires_at: z.number().int().positive(),
})

type InvitePayload = z.infer<typeof invitePayloadSchema>
type UserWithClass = Parameters<typeof publicUser>[0]

const createInviteSchema = z.object({
  role: z.enum(INVITABLE_ROLES),
})

const tokenQuerySchema = z.object({
  token: z.string().min(1),
})

const acceptInviteSchema = z.object({
  token: z.string().min(1),
  studentId: z
    .string()
    .trim()
    .max(32)
    .optional()
    .transform((value) => (value ? value : undefined)),
  username: z.string().trim().min(1).max(32),
  name: z.string().trim().min(1).max(32),
  password: z
    .union([z.literal(''), z.string().min(8).max(128)])
    .optional()
    .transform((value) => (value ? value : undefined)),
})

function verifyInvite(fastify: FastifyInstance, token: string): InvitePayload | null {
  try {
    const payload = fastify.jwt.verify<Record<string, unknown>>(token)
    const parsed = invitePayloadSchema.safeParse(payload)
    return parsed.success ? parsed.data : null
  } catch {
    return null
  }
}

async function issueLogin(fastify: FastifyInstance, user: UserWithClass) {
  const token = await fastify.jwt.sign({ sub: user.id, role: user.role })
  return { token, user: publicUser(user) }
}

async function loadInviteContext(fastify: FastifyInstance, token: string) {
  const payload = verifyInvite(fastify, token)
  if (!payload) return null

  const inviter = await prisma.user.findUnique({
    where: { id: payload.inviter },
    select: {
      id: true,
      name: true,
      classId: true,
      status: true,
      klass: { select: { id: true, name: true } },
    },
  })
  if (!inviter || inviter.status !== 'ACTIVE' || !inviter.classId || !inviter.klass) {
    return null
  }

  return { payload, inviter }
}

export const inviteRoutes: FastifyPluginAsync = async (fastify) => {
  /** 生成邀请链接 JWT（仅 staff） */
  fastify.post('/', { onRequest: [fastify.authenticate] }, async (request, reply) => {
    if (!requireStaff(request, reply)) return reply

    const parsed = createInviteSchema.safeParse(request.body)
    if (!parsed.success) {
      return reply.code(400).send({ error: 'INVALID_BODY', message: '请选择有效的用户类型' })
    }

    const { sub } = request.user as { sub: string }
    const inviter = await prisma.user.findUnique({
      where: { id: sub },
      select: { classId: true, status: true },
    })
    if (!inviter || inviter.status !== 'ACTIVE' || !inviter.classId) {
      return reply
        .code(400)
        .send({ error: 'CLASS_REQUIRED', message: '当前账号未绑定班级，无法生成邀请链接' })
    }

    const expiresAt = Math.floor(Date.now() / 1000) + INVITE_TTL_SECONDS
    const token = await fastify.jwt.sign(
      {
        type: 'invite-link',
        inviter: sub,
        role: parsed.data.role,
        expires_at: expiresAt,
      },
      { expiresIn: INVITE_TTL_SECONDS },
    )

    return reply.code(201).send({
      token,
      role: parsed.data.role,
      expiresAt: new Date(expiresAt * 1000).toISOString(),
    })
  })

  /** 查看邀请信息（公开） */
  fastify.get('/info', async (request, reply) => {
    const parsed = tokenQuerySchema.safeParse(request.query)
    if (!parsed.success) {
      return reply.code(400).send({ error: 'INVALID_TOKEN', message: '邀请链接无效' })
    }

    const context = await loadInviteContext(fastify, parsed.data.token)
    if (!context) {
      return reply.code(401).send({ error: 'INVALID_TOKEN', message: '邀请链接无效或已过期' })
    }

    return reply.send({
      role: context.payload.role,
      expiresAt: new Date(context.payload.expires_at * 1000).toISOString(),
      inviterName: context.inviter.name,
      className: context.inviter.klass?.name ?? null,
    })
  })

  /** 接受邀请：按学工号 / 用户名在邀请人所在班级创建账号，并直接登录 */
  fastify.post('/accept', async (request, reply) => {
    const parsed = acceptInviteSchema.safeParse(request.body)
    if (!parsed.success) {
      return reply
        .code(400)
        .send({ error: 'INVALID_BODY', message: '请填写学工号、用户名与姓名（密码至少 8 位）' })
    }

    const context = await loadInviteContext(fastify, parsed.data.token)
    if (!context) {
      return reply.code(401).send({ error: 'INVALID_TOKEN', message: '邀请链接无效或已过期' })
    }

    const { role } = context.payload
    const classId = context.inviter.classId as string
    const { studentId, username, name, password } = parsed.data

    if (!studentId && !password) {
      return reply.code(400).send({ error: 'IDENTITY_REQUIRED', message: '至少要提供学工号或密码之一' })
    }

    const existing = await prisma.user.findFirst({
      where: {
        classId,
        OR: [{ username }, ...(studentId ? [{ studentId }] : [])],
      },
      select: { id: true },
    })
    if (existing) {
      return reply.code(409).send({
        error: 'ALREADY_EXISTS',
        message: '该学工号或用户名在本班已存在，请直接登录',
      })
    }

    const passwordHash = password ? await hashPassword(password) : undefined

    const unbound = studentId
      ? await prisma.user.findFirst({
          where: { studentId, role, classId: null, status: 'ACTIVE' },
          orderBy: { createdAt: 'asc' },
          include: { klass: true },
        })
      : null
    if (unbound) {
      const updated = await prisma.user.update({
        where: { id: unbound.id },
        data: {
          classId,
          username,
          name,
          ...(passwordHash ? { password: passwordHash } : {}),
        },
        include: { klass: true },
      })
      return reply.send(await issueLogin(fastify, updated))
    }

    const created = await prisma.user.create({
      data: {
        studentId: studentId ?? null,
        username,
        name,
        role,
        classId,
        ...(passwordHash ? { password: passwordHash } : {}),
      },
      include: { klass: true },
    })

    return reply.code(201).send(await issueLogin(fastify, created))
  })
}
