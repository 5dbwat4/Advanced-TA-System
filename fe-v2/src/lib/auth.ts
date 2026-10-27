import { defineStore } from 'pinia'
import { ref } from 'vue'

import {
  ApiError,
  apiFetch,
  getToken,
  isClassSelection,
  isLoginSelection,
  selectZjuamClass,
  setToken,
  type LoginResult,
  type User,
  type UserPreferences,
} from '@/lib/api'
import { getErrorMessage } from '@/lib/error'
import { saveLastUser } from '@/lib/last-user'
import { setSentryUser } from '@/lib/sentry'

export const useAuthStore = defineStore('auth', () => {
  const user = ref<User | null>(null)
  const loading = ref(Boolean(getToken()))
  const bootstrapError = ref<string | null>(null)
  const started = ref(false)
  let bootstrapPromise: Promise<void> | null = null

  function commitUser(next: User | null) {
    user.value = next
    if (next) saveLastUser(next)
    setSentryUser(next)
  }

  async function bootstrap(): Promise<void> {
    if (bootstrapPromise) return bootstrapPromise
    started.value = true
    bootstrapError.value = null
    if (!getToken()) {
      loading.value = false
      return
    }
    loading.value = true
    bootstrapPromise = apiFetch<{ user: User }>('/api/auth/me')
      .then((res) => {
        commitUser(res.user)
      })
      .catch((error: unknown) => {
        if (error instanceof ApiError && (error.status === 401 || error.status === 403)) {
          setToken(null)
          commitUser(null)
        } else {
          bootstrapError.value = getErrorMessage(error, '登录状态检查失败')
        }
      })
      .finally(() => {
        loading.value = false
        bootstrapPromise = null
      })
    return bootstrapPromise
  }

  async function ensureReady(): Promise<void> {
    if (!started.value) return bootstrap()
    if (bootstrapPromise) return bootstrapPromise
  }

  function retryBootstrap() {
    void bootstrap()
  }

  async function login(endpoint: string, body: Record<string, unknown>): Promise<LoginResult> {
    const res = await apiFetch<LoginResult>(endpoint, {
      method: 'POST',
      body: JSON.stringify(body),
    })
    if (isLoginSelection(res) || isClassSelection(res)) return res
    setToken(res.token)
    commitUser(res.user)
    bootstrapError.value = null
    return res
  }

  async function selectAccount(selectionToken: string, userId: string): Promise<User> {
    const res = await apiFetch<{ token: string; user: User }>('/api/auth/select', {
      method: 'POST',
      body: JSON.stringify({ selectionToken, userId }),
    })
    setToken(res.token)
    commitUser(res.user)
    bootstrapError.value = null
    return res.user
  }

  async function selectClass(
    selectionToken: string,
    optionKey: string,
    type?: '2026-sys1' | '2026-sys2' | '2026-sys3',
  ): Promise<User> {
    const res = await selectZjuamClass(selectionToken, optionKey, type)
    setToken(res.token)
    commitUser(res.user)
    bootstrapError.value = null
    return res.user
  }

  async function exchangeStudentPreview(token: string): Promise<User> {
    const res = await apiFetch<{ token: string; user: User }>('/api/auth/student/exchange', {
      method: 'POST',
      body: JSON.stringify({ token }),
    })
    setToken(res.token)
    commitUser(res.user)
    bootstrapError.value = null
    return res.user
  }

  function adoptSession(session: { token: string; user: User }) {
    setToken(session.token)
    commitUser(session.user)
    bootstrapError.value = null
  }

  async function completeSetup(body: {
    username: string
    name?: string
    studentId?: string
    password?: string
  }): Promise<User> {
    const res = await apiFetch<{ user: User }>('/api/auth/setup', {
      method: 'POST',
      body: JSON.stringify(body),
    })
    commitUser(res.user)
    return res.user
  }

  async function refresh(): Promise<void> {
    const res = await apiFetch<{ user: User }>('/api/auth/me')
    commitUser(res.user)
  }

  async function updateSettings(
    body:
      | { action: 'set_password'; newPassword: string }
      | { action: 'set_username'; username: string }
      | { action: 'set_avatar'; avatar: number | null }
      | { action: 'remove_passkey'; passkeyId: string },
  ): Promise<User> {
    const res = await apiFetch<{ user: User }>('/api/settings', {
      method: 'PATCH',
      body: JSON.stringify(body),
    })
    commitUser(res.user)
    return res.user
  }

  async function updatePreferences(prefs: UserPreferences): Promise<User> {
    const res = await apiFetch<{ user: User }>('/api/settings/preferences', {
      method: 'PUT',
      body: JSON.stringify(prefs),
    })
    commitUser(res.user)
    return res.user
  }

  function logout() {
    void apiFetch('/api/auth/logout', { method: 'POST' }).catch(() => undefined)
    setToken(null)
    commitUser(null)
  }

  return {
    user,
    loading,
    bootstrapError,
    started,
    bootstrap,
    ensureReady,
    retryBootstrap,
    login,
    selectAccount,
    selectClass,
    exchangeStudentPreview,
    adoptSession,
    completeSetup,
    refresh,
    updateSettings,
    updatePreferences,
    logout,
  }
})
