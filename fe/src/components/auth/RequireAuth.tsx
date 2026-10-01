import { Button, Spinner } from '@heroui/react'
import { Navigate, Outlet, useLocation } from 'react-router-dom'

import { useAuth } from '@/lib/auth'

export function RequireAuth() {
  const { user, loading, bootstrapError, retryBootstrap } = useAuth()
  const location = useLocation()

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Spinner size="lg" />
      </div>
    )
  }

  if (!user && bootstrapError) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-line bg-elevated px-8 py-6 text-center">
          <p className="text-sm text-fg-muted">{bootstrapError}</p>
          <Button variant="secondary" size="sm" onPress={retryBootstrap}>
            重试
          </Button>
        </div>
      </div>
    )
  }

  if (!user) {
    return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />
  }

  const needsSetup = !user.username
  const onSetup = location.pathname === '/setup'

  if (needsSetup && !onSetup) return <Navigate to="/setup" replace />
  if (!needsSetup && onSetup) return <Navigate to="/console" replace />

  return <Outlet />
}
