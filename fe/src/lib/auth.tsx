import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'

import { apiFetch, getToken, setToken, type User, type UserPreferences } from '@/lib/api'
import { saveLastUser } from '@/lib/last-user'

type AuthContextValue = {
  user: User | null
  loading: boolean
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

  useEffect(() => {
    if (!getToken()) return
    let cancelled = false
    apiFetch<{ user: User }>('/api/auth/me')
      .then((res) => {
        if (!cancelled) setUser(res.user)
      })
      .catch(() => {
        if (!cancelled) setToken(null)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  const value = useMemo<AuthContextValue>(() => {
    return {
      user,
      loading,
      login: async (endpoint, body) => {
        const res = await apiFetch<{ token: string; user: User }>(endpoint, {
          method: 'POST',
          body: JSON.stringify(body),
        })
        setToken(res.token)
        setUser(res.user)
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
  }, [user, loading])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth must be used within an AuthProvider')
  return context
}
