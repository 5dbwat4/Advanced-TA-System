import { createHash, randomBytes } from 'node:crypto'

/** MCP / API 令牌可授权范围 */
export const MCP_SCOPES = [
  'questions:read',
  'questions:write',
  'banks:read',
  'banks:write',
  'experiments:read',
] as const

export type McpScope = (typeof MCP_SCOPES)[number]

const TOKEN_PREFIX = 'tasaas'
const TOKEN_PATTERN = /^tasaas_([A-Za-z0-9_-]{8})_([A-Za-z0-9_-]{43})$/

/** sha256(secret) 的十六进制摘要 */
export function hashToken(secret: string): string {
  return createHash('sha256').update(secret).digest('hex')
}

/** 生成新令牌（明文仅返回一次）：形如 tasaas_<prefix>_<secret> */
export function generateToken(): { token: string; prefix: string; tokenHash: string } {
  const prefix = randomBytes(6).toString('base64url').slice(0, 8)
  const secret = randomBytes(32).toString('base64url')
  return {
    token: `${TOKEN_PREFIX}_${prefix}_${secret}`,
    prefix,
    tokenHash: hashToken(secret),
  }
}

/** 解析令牌，格式非法返回 null */
export function parseToken(token: string): { prefix: string; secret: string } | null {
  const match = TOKEN_PATTERN.exec(token)
  if (!match) return null
  return { prefix: match[1], secret: match[2] }
}

/** 解析授权范围 JSON，过滤未知项 */
export function parseScopes(raw: string | null | undefined): string[] {
  if (typeof raw !== 'string' || raw.length === 0) return []
  try {
    const value = JSON.parse(raw) as unknown
    if (!Array.isArray(value)) return []
    const allowed = new Set<string>(MCP_SCOPES)
    return value.filter((item): item is string => typeof item === 'string' && allowed.has(item))
  } catch {
    return []
  }
}
