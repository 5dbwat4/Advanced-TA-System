import { checkRateLimit as genericCheckRateLimit } from '../lib/rate-limit'

/** 记录一次请求，返回是否放行及建议的重试秒数（默认窗口 / 上限与原实现一致） */
export function checkRateLimit(key: string): { ok: boolean; retryAfterSec: number } {
  return genericCheckRateLimit(key)
}
