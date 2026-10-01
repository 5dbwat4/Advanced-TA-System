import type { FastifyReply } from 'fastify'

import { decryptSecret } from './crypto'
import { prisma } from './prisma'
import { ZjuamError } from './zjuam'

/**
 * 解析学在浙大凭据：优先请求体（"密码保存在本地" 模式），否则回退到已保存的凭据。
 * 密文损坏 / 密钥不匹配时按“未保存密码”处理，返回 null。
 */
export async function resolveZjuamCredentials(
  userId: string,
  input: { account?: string; password?: string },
): Promise<{ account: string; password: string } | null> {
  const user = await prisma.user.findUnique({ where: { id: userId } })
  const account = input.account?.trim() || user?.zjuamAccount
  let password = input.password
  if (!password && user?.zjuamPassword) {
    try {
      password = decryptSecret(user.zjuamPassword)
    } catch {
      password = undefined
    }
  }
  if (!account || !password) return null
  return { account, password }
}

/** 将 ZjuamError 映射为 HTTP 响应；其它异常原样抛出 */
export function sendZjuamError(reply: FastifyReply, error: unknown): FastifyReply | never {
  if (error instanceof ZjuamError) {
    if (error.code === 'ZJUAM_AUTH_FAILED') {
      return reply
        .code(401)
        .send({ error: 'ZJUAM_AUTH_FAILED', message: '统一身份认证账号或密码错误' })
    }
    return reply
      .code(502)
      .send({ error: 'ZJUAM_UNAVAILABLE', message: '统一身份认证服务暂时不可用' })
  }
  throw error
}
