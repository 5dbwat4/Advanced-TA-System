import { Spinner } from '@heroui/react'
import { Navigate, Outlet } from 'react-router-dom'

import { useAuth } from '@/lib/auth'
import { homePathFor } from '@/lib/student-route'

/** 仅观察者可进入观察者面板；其余角色回到各自首页 */
export function RequireViewer() {
  const { user, loading } = useAuth()

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Spinner size="lg" />
      </div>
    )
  }

  if (!user) return <Navigate to="/login" replace />
  if (user.role !== 'VIEWER') return <Navigate to={homePathFor(user)} replace />
  if (!user.username) return <Navigate to="/setup" replace />

  return <Outlet />
}
