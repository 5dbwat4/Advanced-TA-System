import { create } from 'zustand'
import { persist } from 'zustand/middleware'

import { apiFetch, type ClassInfo, type Course, type InviteInfo, type Role } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import { getErrorMessage } from '@/lib/error'
import { getZjuamCredential } from '@/lib/zjuam'

export type ZjuamStatus = 'idle' | 'loading' | 'ready' | 'error'

/** 登录后账号信息不完整时的来源 */
export type IncompleteLogin = {
  source: 'zjuam' | 'login'
  /** 学工号 / 用户名 / 统一身份认证账号 */
  identifier: string | null
  className: string | null
  role: Role
}

export type OnboardingInfo = InviteInfo | IncompleteLogin

type AppState = {
  currentClassId: string | null
  sidebarCollapsed: boolean
  hasLocalCredential: boolean
  zjuamCourses: Course[] | null
  zjuamStatus: ZjuamStatus
  zjuamError: string | null
  onboarding: boolean
  onboardingInfo: OnboardingInfo | null
  setCurrentClassId: (id: string | null) => void
  toggleSidebar: () => void
  syncLocalCredential: () => void
  loadZjuamCourses: (opts?: { force?: boolean }) => Promise<void>
  resetZjuam: () => void
  setOnboarding: (onboarding: boolean) => void
  setOnboardingInfo: (info: OnboardingInfo | null) => void
}

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => ({
      currentClassId: null,
      sidebarCollapsed: false,
      hasLocalCredential: Boolean(getZjuamCredential()),
      zjuamCourses: null,
      zjuamStatus: 'idle',
      zjuamError: null,
      onboarding: false,
      onboardingInfo: null,
      setCurrentClassId: (id) => set({ currentClassId: id }),
      toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
      syncLocalCredential: () => set({ hasLocalCredential: Boolean(getZjuamCredential()) }),
      loadZjuamCourses: async ({ force } = {}) => {
        const { zjuamStatus } = get()
        if (!force && (zjuamStatus === 'loading' || zjuamStatus === 'ready')) return
        set({ zjuamStatus: 'loading', zjuamError: null })
        try {
          const local = getZjuamCredential()
          const body = local ? { account: local.account, password: local.password } : {}
          const data = await apiFetch<{ courses: Course[] }>('/api/auth/zjuam/courses', {
            method: 'POST',
            body: JSON.stringify(body),
          })
          set({ zjuamCourses: data.courses, zjuamStatus: 'ready' })
        } catch (error) {
          set({
            zjuamStatus: 'error',
            zjuamError: getErrorMessage(error, '获取课程失败'),
          })
        }
      },
      resetZjuam: () => set({ zjuamCourses: null, zjuamStatus: 'idle', zjuamError: null }),
      setOnboarding: (onboarding) => set({ onboarding }),
      setOnboardingInfo: (onboardingInfo) => set({ onboardingInfo }),
    }),
    {
      name: 'tasaas.app',
      partialize: (s) => ({ currentClassId: s.currentClassId, sidebarCollapsed: s.sidebarCollapsed }),
    },
  ),
)

export function useCurrentClass(): ClassInfo | null {
  const { user } = useAuth()
  const currentClassId = useAppStore((s) => s.currentClassId)
  const classes = user?.classes ?? []
  return classes.find((c) => c.id === currentClassId) ?? classes[0] ?? null
}

export function useHasXzzdPermission(): boolean {
  const { user } = useAuth()
  const currentClass = useCurrentClass()
  const hasLocalCredential = useAppStore((s) => s.hasLocalCredential)
  const zjuamCourses = useAppStore((s) => s.zjuamCourses)
  const hasCredential = hasLocalCredential || Boolean(user?.hasZjuamPassword)
  if (!hasCredential || !currentClass?.xzzdClassId) return false
  return (
    zjuamCourses?.some(
      (course) =>
        String(course.id) === String(currentClass.xzzdClassId) && course.isInstructor === true,
    ) ?? false
  )
}
