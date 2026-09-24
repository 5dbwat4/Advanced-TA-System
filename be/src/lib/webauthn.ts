import type { Class, User } from '@prisma/client'

import { prisma } from './prisma'

/** 单个已登记的通行密钥凭据（存储于 User.webauthn 的 JSON 数组） */
export type StoredCredential = {
  /** base64url 编码的凭据 ID */
  id: string
  /** base64url 编码的 COSE 公钥 */
  publicKey: string
  counter: number
  deviceType: string
  backedUp: boolean
  transports?: string[]
  /** 凭据登记时间（ISO 8601 字符串；旧数据可能缺失） */
  createdAt?: string
}

/** 安全解析 User.webauthn（非法 / 空值一律回退为空数组） */
export function parseCredentials(user: Pick<User, 'webauthn'>): StoredCredential[] {
  if (!user.webauthn) return []
  try {
    const parsed: unknown = JSON.parse(user.webauthn)
    return Array.isArray(parsed) ? (parsed as StoredCredential[]) : []
  } catch {
    return []
  }
}

export function serializeCredentials(credentials: StoredCredential[]): string {
  return JSON.stringify(credentials)
}

/**
 * 按凭据 ID 查找用户及其对应凭据。
 * 助教名单规模很小，直接扫描已登记 webauthn 的用户即可。
 */
export async function findUserByCredentialId(
  credentialId: string,
): Promise<{ user: User & { classes: Class[] }; credential: StoredCredential } | null> {
  const users = await prisma.user.findMany({
    where: { webauthn: { not: null } },
    include: { classes: true },
  })
  for (const user of users) {
    const credential = parseCredentials(user).find((item) => item.id === credentialId)
    if (credential) return { user, credential }
  }
  return null
}
