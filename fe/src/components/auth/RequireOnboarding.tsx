import { Spinner } from '@heroui/react'
import { Navigate, Outlet } from 'react-router-dom'

import { useAuth } from '@/lib/auth'
import { homePathFor } from '@/lib/student-route'
import { useAppStore } from '@/lib/store'

/** 只有处于 onboarding 状态时才允许进入 /setup */
export function RequireOnboarding() {
  const { user, loading } = useAuth()
  const onboarding = useAppStore((state) => state.onboarding)
  const debugMode = useAppStore((state) => state.debugMode)

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Spinner size="lg" />
      </div>
    )
  }

  if (debugMode && user) {
    return <Navigate to={homePathFor(user)} replace />
  }

  // 已登录但尚未完成初始化的账号必须允许进入 /setup，
  // 否则刷新后 onboarding 状态丢失会在 /login 与 /setup 之间来回跳转。
  if (user) {
    if (user.username) return <Navigate to={homePathFor(user)} replace />
    return <Outlet />
  }

  if (!onboarding) {
    return <Navigate to="/login" replace />
  }

  return <Outlet />
}
