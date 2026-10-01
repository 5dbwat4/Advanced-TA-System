import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'

import { ApiError, apiFetch, getToken, setToken, type User, type UserPreferences } from '@/lib/api'
import { getErrorMessage } from '@/lib/error'
import { saveLastUser } from '@/lib/last-user'

type AuthContextValue = {
  user: User | null
  loading: boolean
  bootstrapError: string | null
  retryBootstrap: () => void
  login: (endpoint: string, body: Record<string, unknown>) => Promise<User>
  completeSetup: (body: { username: string; password?: string }) => Promise<User>
  refresh: () => Promise<void>
  updateSettings: (
    body:
      | { action: 'set_password'; newPassword: string }
      | { action: 'set_username'; username: string }
      | { action: 'remove_passkey'; passkeyId: string },
  ) => Promise<User>
  updatePreferences: (prefs: UserPreferences) => Promise<User>
  logout: () => void
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(() => Boolean(getToken()))
  const [bootstrapError, setBootstrapError] = useState<string | null>(null)

  const bootstrap = useCallback(() => {
    setBootstrapError(null)
    setLoading(true)
    let cancelled = false
    apiFetch<{ user: User }>('/api/auth/me')
      .then((res) => {
        if (!cancelled) setUser(res.user)
      })
      .catch((error: unknown) => {
        if (cancelled) return
        if (error instanceof ApiError && (error.status === 401 || error.status === 403)) {
          setToken(null)
          setUser(null)
        } else {
          setBootstrapError(getErrorMessage(error, '登录状态检查失败'))
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!getToken()) return
    return bootstrap()
  }, [bootstrap])

  const retryBootstrap = useCallback(() => {
    void bootstrap()
  }, [bootstrap])

  const value = useMemo<AuthContextValue>(() => {
    return {
      user,
      loading,
      bootstrapError,
      retryBootstrap,
      login: async (endpoint, body) => {
        const res = await apiFetch<{ token: string; user: User }>(endpoint, {
          method: 'POST',
          body: JSON.stringify(body),
        })
        setToken(res.token)
        setUser(res.user)
        setBootstrapError(null)
        saveLastUser(res.user)
        return res.user
      },
      completeSetup: async (body) => {
        const res = await apiFetch<{ user: User }>('/api/auth/setup', {
          method: 'POST',
          body: JSON.stringify(body),
        })
        setUser(res.user)
        saveLastUser(res.user)
        return res.user
      },
      refresh: async () => {
        const res = await apiFetch<{ user: User }>('/api/auth/me')
        setUser(res.user)
        saveLastUser(res.user)
      },
      updateSettings: async (body) => {
        const res = await apiFetch<{ user: User }>('/api/settings', {
          method: 'PATCH',
          body: JSON.stringify(body),
        })
        setUser(res.user)
        saveLastUser(res.user)
        return res.user
      },
      updatePreferences: async (prefs) => {
        const res = await apiFetch<{ user: User }>('/api/settings/preferences', {
          method: 'PUT',
          body: JSON.stringify(prefs),
        })
        setUser(res.user)
        return res.user
      },
      logout: () => {
        void apiFetch('/api/auth/logout', { method: 'POST' }).catch(() => undefined)
        setToken(null)
        setUser(null)
      },
    }
  }, [user, loading, bootstrapError, retryBootstrap])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth must be used within an AuthProvider')
  return context
}
