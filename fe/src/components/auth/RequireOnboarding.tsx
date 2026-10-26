import { Spinner } from '@heroui/react'
import { Navigate, Outlet } from 'react-router-dom'

import { useAuth } from '@/lib/auth'
import { homePathFor } from '@/lib/student-route'
import { useAppStore } from '@/lib/store'

/** 只有处于 onboarding 状态时才允许进入 /setup */
export function RequireOnboarding() {
  const { user, loading } = useAuth()
  const onboarding = useAppStore((state) => state.onboarding)

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Spinner size="lg" />
      </div>
    )
  }

  if (!onboarding) {
    const target = user && user.username ? homePathFor(user) : '/login'
    return <Navigate to={target} replace />
  }

  return <Outlet />
}
