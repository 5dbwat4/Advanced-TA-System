import {
  startRegistration,
  type PublicKeyCredentialCreationOptionsJSON,
  type PublicKeyCredentialRequestOptionsJSON,
} from '@simplewebauthn/browser'

import { apiFetch } from '@/lib/api'

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
