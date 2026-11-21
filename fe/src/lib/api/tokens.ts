import { apiFetch } from '@/lib/api/client'

export type McpScope =
  | 'questions:read'
  | 'questions:write'
  | 'banks:read'
  | 'banks:write'
  | 'experiments:read'

export type PersonalAccessToken = {
  id: string
  name: string
  prefix: string
  scopes: McpScope[]
  expiresAt: string | null
  revokedAt: string | null
  lastUsedAt: string | null
  createdAt: string
}

export function listTokens(): Promise<{ tokens: PersonalAccessToken[] }> {
  return apiFetch<{ tokens: PersonalAccessToken[] }>('/api/tokens')
}

export function createToken(body: {
  name: string
  scopes: McpScope[]
  expiresInDays?: number
}): Promise<{ token: string; tokenRecord: PersonalAccessToken }> {
  return apiFetch<{ token: string; tokenRecord: PersonalAccessToken }>('/api/tokens', {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

export function revokeToken(id: string): Promise<{ ok: true }> {
  return apiFetch<{ ok: true }>(`/api/tokens/${id}`, { method: 'DELETE' })
}

export type McpAuditLog = {
  id: string
  tokenId: string | null
  tool: string
  ok: boolean
  message: string | null
  createdAt: string
}

export function listAuditLogs(limit = 50): Promise<{ logs: McpAuditLog[] }> {
  return apiFetch<{ logs: McpAuditLog[] }>(`/api/tokens/audit?limit=${limit}`)
}
