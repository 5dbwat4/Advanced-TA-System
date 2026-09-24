import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto'

import { env } from '../env'

/** 由 credentialKey 派生 32 字节 AES-256 密钥 */
const key = createHash('sha256').update(env.credentialKey).digest()

/** AES-256-GCM 加密，返回 iv.tag.cipher（各段均为 base64url） */
export function encryptSecret(plain: string): string {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  const encrypted = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return [iv.toString('base64url'), tag.toString('base64url'), encrypted.toString('base64url')].join('.')
}

/** AES-256-GCM 解密，密文格式非法或校验失败时抛错 */
export function decryptSecret(payload: string): string {
  const parts = payload.split('.')
  if (parts.length !== 3) throw new Error('Invalid encrypted payload')

  const [ivPart, tagPart, dataPart] = parts
  const iv = Buffer.from(ivPart, 'base64url')
  const tag = Buffer.from(tagPart, 'base64url')
  const data = Buffer.from(dataPart, 'base64url')
  if (iv.length !== 12 || tag.length !== 16) throw new Error('Invalid encrypted payload')

  const decipher = createDecipheriv('aes-256-gcm', key, iv)
  decipher.setAuthTag(tag)
  return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8')
}
