import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
} from '@simplewebauthn/server'
import type { AuthenticationResponseJSON, RegistrationResponseJSON } from '@simplewebauthn/server'
import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'

import { env } from '../env'
import { prisma } from '../lib/prisma'
import { publicUser } from '../lib/user'
import { findUserByCredentialId, parseCredentials, serializeCredentials } from '../lib/webauthn'
import type { StoredCredential } from '../lib/webauthn'

/** 无状态挑战：签入短期 JWT，验证时原样带回 */
type ChallengePayload = {
  challenge: string
  sub: string
  purpose: 'webauthn-registration' | 'webauthn-authentication'
}

const verifySchema = z.object({
  response: z.unknown(),
  challengeToken: z.string().min(1),
})

const optionsQuerySchema = z.object({
  /** 用户名 或 学号；提供且命中时下发 allowCredentials 以跳过凭据选择器 */
  identifier: z.string().trim().min(1).optional(),
})

const invalidChallenge = { error: 'INVALID_CHALLENGE', message: '挑战已失效，请重试' } as const

export const passkeyRoutes: FastifyPluginAsync = async (fastify) => {
  /** 为当前登录用户生成注册选项 */
  fastify.get(
    '/registration-options',
    { onRequest: [fastify.authenticate] },
    async (request, reply) => {
      const { sub } = request.user as { sub: string }

      const user = await prisma.user.findUnique({ where: { id: sub } })
      if (!user) {
        return reply.code(401).send({ error: 'UNAUTHORIZED', message: '用户不存在' })
      }

      const options = await generateRegistrationOptions({
        rpName: env.passkeyRpName,
        rpID: env.passkeyRpId,
        userName: user.studentId ?? user.username ?? user.id,
        userID: new TextEncoder().encode(user.id),
        attestationType: 'none',
        excludeCredentials: parseCredentials(user).map((credential) => ({
          id: credential.id,
          transports: credential.transports,
        })),
        authenticatorSelection: {
          residentKey: 'required',
          userVerification: 'preferred',
        },
      })

      const challengeToken = fastify.jwt.sign(
        { challenge: options.challenge, sub: user.id, purpose: 'webauthn-registration' },
        { expiresIn: '5m' },
      )

      return reply.send({ options, challengeToken })
    },
  )

  /** 校验注册结果并持久化凭据 */
  fastify.post(
    '/registration-verify',
    { onRequest: [fastify.authenticate] },
    async (request, reply) => {
      const parsed = verifySchema.safeParse(request.body)
      if (!parsed.success) {
        return reply.code(400).send({ error: 'INVALID_BODY', message: '请求参数不正确' })
      }

      const { sub } = request.user as { sub: string }

      let payload: ChallengePayload
      try {
        payload = fastify.jwt.verify<ChallengePayload>(parsed.data.challengeToken)
      } catch {
        return reply.code(400).send(invalidChallenge)
      }

      if (payload.purpose !== 'webauthn-registration' || payload.sub !== sub) {
        return reply.code(400).send(invalidChallenge)
      }

      const user = await prisma.user.findUnique({ where: { id: sub } })
      if (!user) {
        return reply.code(401).send({ error: 'UNAUTHORIZED', message: '用户不存在' })
      }

      let verification: Awaited<ReturnType<typeof verifyRegistrationResponse>>
      try {
        verification = await verifyRegistrationResponse({
          response: parsed.data.response as RegistrationResponseJSON,
          expectedChallenge: payload.challenge,
          expectedOrigin: env.passkeyOrigin,
          expectedRPID: env.passkeyRpId,
        })
      } catch {
        return reply.code(400).send({ error: 'VERIFICATION_FAILED', message: '通行密钥注册校验失败' })
      }

      if (!verification.verified) {
        return reply.code(400).send({ error: 'VERIFICATION_FAILED', message: '通行密钥注册校验失败' })
      }

      const { credential, credentialDeviceType, credentialBackedUp } = verification.registrationInfo

      const stored: StoredCredential = {
        id: credential.id,
        publicKey: Buffer.from(credential.publicKey).toString('base64url'),
        counter: credential.counter,
        deviceType: credentialDeviceType,
        backedUp: credentialBackedUp,
        transports: credential.transports,
        createdAt: new Date().toISOString(),
      }

      const existing = parseCredentials(user)
      const merged = existing.some((item) => item.id === stored.id)
        ? existing.map((item) => (item.id === stored.id ? stored : item))
        : [...existing, stored]

      const updatedUser = await prisma.user.update({
        where: { id: user.id },
        data: { webauthn: serializeCredentials(merged) },
        include: { classes: true },
      })

      return reply.send({ verified: true, user: publicUser(updatedUser) })
    },
  )

  /** 生成登录（断言）选项，公开接口；带 identifier 时可缩小到指定用户的凭据 */
  fastify.get('/authentication-options', async (request, reply) => {
    const parsedQuery = optionsQuerySchema.safeParse(request.query)
    const identifier = parsedQuery.success ? parsedQuery.data.identifier : undefined

    let allowCredentials: { id: string; transports?: string[] }[] = []
    let sub = ''

    if (identifier) {
      const user = await prisma.user.findFirst({
        where: { OR: [{ username: identifier }, { studentId: identifier }] },
      })
      const credentials = user ? parseCredentials(user) : []
      if (user && credentials.length > 0) {
        allowCredentials = credentials.map((credential) => ({
          id: credential.id,
          transports: credential.transports,
        }))
        sub = user.id
      }
    }

    const options = await generateAuthenticationOptions({
      rpID: env.passkeyRpId,
      userVerification: 'preferred',
      ...(allowCredentials.length > 0 ? { allowCredentials } : {}),
    })

    const challengeToken = fastify.jwt.sign(
      { challenge: options.challenge, sub, purpose: 'webauthn-authentication' },
      { expiresIn: '5m' },
    )

    return reply.send({ options, challengeToken })
  })

  /** 校验登录（断言）结果并签发 JWT，公开接口 */
  fastify.post('/authentication-verify', async (request, reply) => {
    const parsed = verifySchema.safeParse(request.body)
    if (!parsed.success) {
      return reply.code(400).send({ error: 'INVALID_BODY', message: '请求参数不正确' })
    }

    let payload: ChallengePayload
    try {
      payload = fastify.jwt.verify<ChallengePayload>(parsed.data.challengeToken)
    } catch {
      return reply.code(400).send(invalidChallenge)
    }

    if (payload.purpose !== 'webauthn-authentication') {
      return reply.code(400).send(invalidChallenge)
    }

    const response = parsed.data.response as AuthenticationResponseJSON
    if (!response.id) {
      return reply.code(400).send({ error: 'INVALID_BODY', message: '请求参数不正确' })
    }

    const found = await findUserByCredentialId(response.id)
    if (!found) {
      return reply
        .code(404)
        .send({ error: 'CREDENTIAL_NOT_FOUND', message: '未找到已登记的通行密钥' })
    }

    // 若选项是按指定用户下发的，则凭据必须属于该用户（防串用）
    if (payload.sub && payload.sub !== found.user.id) {
      return reply.code(400).send({ error: 'VERIFICATION_FAILED', message: '通行密钥验证失败' })
    }

    const { user, credential } = found

    let verification: Awaited<ReturnType<typeof verifyAuthenticationResponse>>
    try {
      verification = await verifyAuthenticationResponse({
        response,
        expectedChallenge: payload.challenge,
        expectedOrigin: env.passkeyOrigin,
        expectedRPID: env.passkeyRpId,
        credential: {
          id: credential.id,
          publicKey: new Uint8Array(Buffer.from(credential.publicKey, 'base64url')),
          counter: credential.counter,
          transports: credential.transports,
        },
      })
    } catch {
      return reply.code(400).send({ error: 'VERIFICATION_FAILED', message: '通行密钥验证失败' })
    }

    if (!verification.verified) {
      return reply.code(400).send({ error: 'VERIFICATION_FAILED', message: '通行密钥验证失败' })
    }

    const credentials = parseCredentials(user).map((item) =>
      item.id === credential.id
        ? { ...item, counter: verification.authenticationInfo.newCounter }
        : item,
    )

    await prisma.user.update({
      where: { id: user.id },
      data: { webauthn: serializeCredentials(credentials) },
    })

    const token = await reply.jwtSign({ sub: user.id, role: user.role })
    return reply.send({ verified: true, token, user: publicUser(user) })
  })
}
