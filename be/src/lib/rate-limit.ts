/**
 * 极简内存级滑动窗口限流（按 key，如 token id、IP）。
 * 单实例部署足够；多实例需换成共享存储。
 */
import type { FastifyReply, FastifyRequest } from 'fastify'

type Bucket = { count: number; resetAt: number }

const DEFAULT_WINDOW_MS = 60_000
const DEFAULT_MAX = 300
const SWEEP_THRESHOLD = 5_000

const buckets = new Map<string, Bucket>()

function sweep(now: number): void {
  if (buckets.size < SWEEP_THRESHOLD) return
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key)
  }
}

/** 记录一次请求，返回是否放行及建议的重试秒数 */
export function checkRateLimit(
  key: string,
  opts?: { windowMs?: number; max?: number },
): { ok: boolean; retryAfterSec: number } {
  const windowMs = opts?.windowMs ?? DEFAULT_WINDOW_MS
  const max = opts?.max ?? DEFAULT_MAX
  const now = Date.now()
  sweep(now)

  const bucket = buckets.get(key)
  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs })
    return { ok: true, retryAfterSec: 0 }
  }

  if (bucket.count >= max) {
    return { ok: false, retryAfterSec: Math.ceil((bucket.resetAt - now) / 1000) }
  }

  bucket.count += 1
  return { ok: true, retryAfterSec: 0 }
}

/** 登录类接口限流预设：每 key 每分钟 10 次 */
export const loginRateLimit = (key: string) => checkRateLimit(key, { windowMs: 60_000, max: 10 })

/**
 * checkoff 队列更新限流：仅学生身份生效，5 秒内至多一次；
 * 助教 / 教师等其他角色不限制。
 */
export async function checkoffQueueUpdateLimit(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<FastifyReply | void> {
  const { sub, role } = (request.user ?? {}) as { sub?: string; role?: string }
  if (role !== 'STUDENT' || !sub) return

  const { ok, retryAfterSec } = checkRateLimit(`checkoff-queue:update:${sub}`, {
    windowMs: 5_000,
    max: 1,
  })
  if (!ok) {
    return reply
      .code(429)
      .header('Retry-After', String(retryAfterSec))
      .send({ error: 'RATE_LIMITED', message: '操作过于频繁，请稍后再试' })
  }
}
