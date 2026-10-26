import type { Role } from '@/lib/api'

export type OnboardingSource = 'invite' | 'zjuam' | 'login'

export type OnboardingContext = {
  source: OnboardingSource
  /** 学工号 / 用户名 / 统一身份认证账号 */
  identifier?: string | null
  inviterName?: string | null
  className?: string | null
  role: Role
}

const KEY_PREFIX = 'tasaas.onboarding.'
const PENDING_INVITE_KEY = 'tasaas.onboarding.pending-invite'

export type PendingInvite = {
  token: string
  inviterName: string
  className: string | null
  role: Role
  expiresAt: string
}

export function savePendingInvite(invite: PendingInvite): void {
  try {
    sessionStorage.setItem(PENDING_INVITE_KEY, JSON.stringify(invite))
  } catch {
    // ignore
  }
}

export function readPendingInvite(): PendingInvite | null {
  try {
    const raw = sessionStorage.getItem(PENDING_INVITE_KEY)
    if (!raw) return null
    const value = JSON.parse(raw) as Partial<PendingInvite> | null
    if (!value || typeof value.token !== 'string' || typeof value.role !== 'string') return null
    return {
      token: value.token,
      inviterName: typeof value.inviterName === 'string' ? value.inviterName : '课程成员',
      className: typeof value.className === 'string' ? value.className : null,
      role: value.role as Role,
      expiresAt: typeof value.expiresAt === 'string' ? value.expiresAt : '',
    }
  } catch {
    return null
  }
}

export function clearPendingInvite(): void {
  try {
    sessionStorage.removeItem(PENDING_INVITE_KEY)
  } catch {
    // ignore
  }
}

export function saveOnboardingContext(userId: string, context: OnboardingContext): void {
  try {
    sessionStorage.setItem(`${KEY_PREFIX}${userId}`, JSON.stringify(context))
  } catch {
    // ignore
  }
}

export function readOnboardingContext(userId: string): OnboardingContext | null {
  try {
    const raw = sessionStorage.getItem(`${KEY_PREFIX}${userId}`)
    if (!raw) return null
    const value = JSON.parse(raw) as Partial<OnboardingContext> | null
    if (!value || typeof value.role !== 'string') return null
    if (value.source !== 'invite' && value.source !== 'zjuam' && value.source !== 'login') {
      return null
    }
    return {
      source: value.source,
      identifier: typeof value.identifier === 'string' ? value.identifier : null,
      inviterName: typeof value.inviterName === 'string' ? value.inviterName : null,
      className: typeof value.className === 'string' ? value.className : null,
      role: value.role as Role,
    }
  } catch {
    return null
  }
}

export function clearOnboardingContext(userId: string): void {
  try {
    sessionStorage.removeItem(`${KEY_PREFIX}${userId}`)
  } catch {
    // ignore
  }
}
