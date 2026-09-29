import { apiFetch, getToken, setToken, type User, type UserPreferences } from '~/lib/api'
import { saveLastUser } from '~/lib/last-user'

export type AuthSettingsBody =
  | { action: 'set_password'; newPassword: string }
  | { action: 'set_username'; username: string }
  | { action: 'remove_passkey'; passkeyId: string }

/** in-flight 的 `/api/auth/me`，让并发 / 重复的 restore() 共享同一次请求 */
let inflight: Promise<void> | null = null

export const useAuthStore = defineStore('auth', {
  state: () => ({
    user: null as User | null,
    // 与旧版 AuthContext 一致：本地有 token 就先当作「加载中」
    loading: Boolean(getToken()),
  }),

  getters: {
    isAuthed: (state) => state.user !== null,
    /** 还没设置用户名 → 需要走 /setup（注意：未登录时为 false，别拿它当「已登录」用） */
    needsSetup: (state) => state.user !== null && !state.user.username,
  },

  actions: {
    /** 用 localStorage 里的 token 恢复登录态（幂等：重复调用不会重复请求） */
    restore(): Promise<void> {
      if (!getToken()) {
        this.user = null
        this.loading = false
        return Promise.resolve()
      }
      // 已经有用户 → 不用再拉
      if (this.user) {
        this.loading = false
        return Promise.resolve()
      }
      // 已经有请求在飞 → 复用
      if (inflight) return inflight

      this.loading = true
      inflight = apiFetch<{ user: User }>('/api/auth/me')
        .then((res) => {
          this.user = res.user
        })
        .catch(() => {
          setToken(null)
          this.user = null
        })
        .finally(() => {
          this.loading = false
          inflight = null
        })

      return inflight
    },

    async login(endpoint: string, body: Record<string, unknown>): Promise<User> {
      const res = await apiFetch<{ token: string; user: User }>(endpoint, {
        method: 'POST',
        body: JSON.stringify(body),
      })
      setToken(res.token)
      this.user = res.user
      saveLastUser(res.user)
      return res.user
    },

    async completeSetup(body: { username: string; password?: string }): Promise<User> {
      const res = await apiFetch<{ user: User }>('/api/auth/setup', {
        method: 'POST',
        body: JSON.stringify(body),
      })
      this.user = res.user
      saveLastUser(res.user)
      return res.user
    },

    async refresh(): Promise<void> {
      const res = await apiFetch<{ user: User }>('/api/auth/me')
      this.user = res.user
      saveLastUser(res.user)
    },

    async updateSettings(body: AuthSettingsBody): Promise<User> {
      const res = await apiFetch<{ user: User }>('/api/settings', {
        method: 'PATCH',
        body: JSON.stringify(body),
      })
      this.user = res.user
      saveLastUser(res.user)
      return res.user
    },

    async updatePreferences(prefs: UserPreferences): Promise<User> {
      const res = await apiFetch<{ user: User }>('/api/settings/preferences', {
        method: 'PUT',
        body: JSON.stringify(prefs),
      })
      this.user = res.user
      return res.user
    },

    logout(): void {
      void apiFetch('/api/auth/logout', { method: 'POST' }).catch(() => undefined)
      setToken(null)
      this.user = null
      inflight = null
    },
  },
})
