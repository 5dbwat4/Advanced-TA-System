import { Spinner } from '@heroui/react'
import { Navigate, Outlet } from 'react-router-dom'

import { useAuth } from '@/lib/auth'

/** 仅已解封的学生可进入学生控制台 */
export function RequireStudent() {
  const { user, loading } = useAuth()

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Spinner size="lg" />
      </div>
    )
  }

  if (!user) return <Navigate to="/login" replace />
  if (user.role !== 'STUDENT') return <Navigate to="/console" replace />
  if (!user.username) return <Navigate to="/student/unlock" replace />

  return <Outlet />
}
