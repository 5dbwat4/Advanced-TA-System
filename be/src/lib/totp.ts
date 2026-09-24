import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'

function base32Encode(buffer: Buffer): string {
  let bits = 0
  let value = 0
  let output = ''
  for (const byte of buffer) {
    value = (value << 8) | byte
    bits += 8
    while (bits >= 5) {
      output += ALPHABET[(value >>> (bits - 5)) & 31]
      bits -= 5
    }
  }
  if (bits > 0) output += ALPHABET[(value << (5 - bits)) & 31]
  return output
}

function base32Decode(input: string): Buffer {
  const clean = input.toUpperCase().replace(/=+$/, '')
  let bits = 0
  let value = 0
  const bytes: number[] = []
  for (const char of clean) {
    const index = ALPHABET.indexOf(char)
    if (index === -1) continue
    value = (value << 5) | index
    bits += 5
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 0xff)
      bits -= 8
    }
  }
  return Buffer.from(bytes)
}

/** 生成 20 字节随机密钥（base32 编码） */
export function randomSecret(): string {
  return base32Encode(randomBytes(20))
}

/** RFC 6238：按时间步长推导 6 位动态口令（默认 SHA-1） */
export function totp(secret: string, period: number, at: number = Date.now()): string {
  const counter = Math.floor(at / 1000 / period)
  const message = Buffer.alloc(8)
  message.writeBigUInt64BE(BigInt(counter))

  const hmac = createHmac('sha1', base32Decode(secret)).update(message).digest()
  const offset = hmac[hmac.length - 1] & 0x0f
  const binary =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff)

  return String(binary % 1_000_000).padStart(6, '0')
}

/** 校验动态口令：默认接受当前窗口与上一窗口，容忍边界处的时间偏差 */
export function verifyTotp(secret: string, code: string, period: number, window = 1): boolean {
  if (!/^\d{6}$/.test(code)) return false
  const now = Date.now()
  const provided = Buffer.from(code)
  for (let i = -window; i <= 0; i++) {
    const expected = Buffer.from(totp(secret, period, now + i * period * 1000))
    if (expected.length === provided.length && timingSafeEqual(expected, provided)) return true
  }
  return false
}
