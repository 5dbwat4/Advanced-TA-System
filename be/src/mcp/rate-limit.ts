/**
 * 极简内存级滑动窗口限流（按 token id）。
 * 单实例部署足够；多实例需换成共享存储。
 */
type Bucket = { count: number; resetAt: number }

const WINDOW_MS = 60_000
const MAX_REQUESTS = 300
const SWEEP_THRESHOLD = 5_000

const buckets = new Map<string, Bucket>()

function sweep(now: number): void {
  if (buckets.size < SWEEP_THRESHOLD) return
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key)
  }
}

/** 记录一次请求，返回是否放行及建议的重试秒数 */
export function checkRateLimit(key: string): { ok: boolean; retryAfterSec: number } {
  const now = Date.now()
  sweep(now)

  const bucket = buckets.get(key)
  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + WINDOW_MS })
    return { ok: true, retryAfterSec: 0 }
  }

  if (bucket.count >= MAX_REQUESTS) {
    return { ok: false, retryAfterSec: Math.ceil((bucket.resetAt - now) / 1000) }
  }

  bucket.count += 1
  return { ok: true, retryAfterSec: 0 }
}
