import { Spinner } from '@heroui/react'
import { Navigate, Outlet, useLocation } from 'react-router-dom'

import { useAuth } from '@/lib/auth'

export function RequireAuth() {
  const { user, loading } = useAuth()
  const location = useLocation()

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Spinner size="lg" />
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
