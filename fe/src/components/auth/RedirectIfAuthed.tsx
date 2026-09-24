import { Spinner } from '@heroui/react'
import { Navigate, Outlet } from 'react-router-dom'

import { useAuth } from '@/lib/auth'

export function RedirectIfAuthed() {
  const { user, loading } = useAuth()

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Spinner size="lg" />
      </div>
    )
  }

  if (user) return <Navigate to={user.username ? '/console' : '/setup'} replace />

  return <Outlet />
}
