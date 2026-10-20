import { verify } from 'hcaptcha'

import { env } from '../env.js'

/**
 * 校验 hCaptcha token。
 * 未配置 HCAPTCHA_SECRET 时直接放行（本地开发），避免阻塞登录。
 */
export async function verifyCaptcha(token: string | undefined): Promise<boolean> {
  if (!env.hcaptchaSecret) return true
  if (!token) return false

  try {
    const result = await verify(env.hcaptchaSecret, token)
    return result.success
  } catch {
    return false
  }
}
