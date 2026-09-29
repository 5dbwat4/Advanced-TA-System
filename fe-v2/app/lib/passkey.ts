/**
 * passkey —— 逐字移植自 `fe/src/lib/passkey.ts`（37 行）
 *
 * WebAuthn 通行密钥的注册与登录（断言）选项拉取。
 *
 * ────────────────────────────────────────────────────────────────────────
 * 迁移动作对照
 * ────────────────────────────────────────────────────────────────────────
 * 1) 唯一改动是 import 别名：`@/lib/api` → `~/lib/api`（Nuxt 约定）。
 *    `fe-v2/app/lib/api.ts` 的 `apiFetch<T>(path, init)` 与 `getToken()` 签名与旧版一致。
 * 2) 其余全部逐字照搬：接口路径（`/api/auth/passkey/authentication-options`、
 *    `/registration-options`、`/registration-verify`）、`identifier` 的
 *    `encodeURIComponent` 拼串、`startRegistration({ optionsJSON: options })` 调用形式、
 *    校验请求体 `{ response, challengeToken }`、以及 `catch` 中对
 *    `NotAllowedError` 返回 `false`、其余异常继续抛出的处理，**零改动**。
 * 3) 依赖 `@simplewebauthn/browser` 已在 `fe-v2/package.json`（`^14.0.0`，与 `fe` 一致）。
 * 4) 纯浏览器 API，无框架耦合（无 React hook），**无行为差异**。
 *
 * ────────────────────────────────────────────────────────────────────────
 * ⚠️ 待主 agent 处理（本任务不改其它文件，避免与并行任务冲突）
 * ────────────────────────────────────────────────────────────────────────
 * `fe-v2/app/components/auth/LoginPanel.vue` 与 `fe-v2/app/pages/setup.vue` 目前把
 * `getAuthenticationOptions` **内联实现**了（当时本文件尚不存在）。请在这两个文件里
 * 删除内联实现，改为从 `~/lib/passkey` 导入 `getAuthenticationOptions`
 * （`setup.vue` 的注册流程另需 `registerPasskey`），以保证 1:1 单一实现来源。
 */
import {
  startRegistration,
  type PublicKeyCredentialCreationOptionsJSON,
  type PublicKeyCredentialRequestOptionsJSON,
} from '@simplewebauthn/browser'

import { apiFetch } from '~/lib/api'

/** 获取登录（断言）选项；传入 identifier 时后端会据此下发 allowCredentials（跳过选择器） */
export function getAuthenticationOptions(identifier?: string): Promise<{
  options: PublicKeyCredentialRequestOptionsJSON
  challengeToken: string
}> {
  const query = identifier ? `?identifier=${encodeURIComponent(identifier)}` : ''
  return apiFetch<{
    options: PublicKeyCredentialRequestOptionsJSON
    challengeToken: string
  }>(`/api/auth/passkey/authentication-options${query}`)
}

export async function registerPasskey(): Promise<boolean> {
  try {
    const { options, challengeToken } = await apiFetch<{
      options: PublicKeyCredentialCreationOptionsJSON
      challengeToken: string
    }>('/api/auth/passkey/registration-options')
    const response = await startRegistration({ optionsJSON: options })
    await apiFetch('/api/auth/passkey/registration-verify', {
      method: 'POST',
      body: JSON.stringify({ response, challengeToken }),
    })
    return true
  } catch (error) {
    if ((error as Error).name === 'NotAllowedError') return false
    throw error
  }
}
