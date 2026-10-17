import { Spinner } from '@heroui/react'
import { Navigate, Outlet } from 'react-router-dom'

import { useAuth } from '@/lib/auth'
import { studentHomePath } from '@/lib/student-route'

/** 仅助教 / 教师可进入后台；学生回到学生主页 */
export function RequireStaff() {
  const { user, loading } = useAuth()

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Spinner size="lg" />
      </div>
    )
  }

  if (!user) return <Navigate to="/login" replace />
  if (user.role === 'STUDENT') return <Navigate to={studentHomePath(user)} replace />

  return <Outlet />
}
