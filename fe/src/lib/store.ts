import { create } from 'zustand'
import { persist } from 'zustand/middleware'

import { apiFetch, type ClassInfo, type Course } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import { getZjuamCredential } from '@/lib/zjuam'

export type ZjuamStatus = 'idle' | 'loading' | 'ready' | 'error'

type AppState = {
  currentClassId: string | null
  sidebarCollapsed: boolean
  hasLocalCredential: boolean
  zjuamCourses: Course[] | null
  zjuamStatus: ZjuamStatus
  zjuamError: string | null
  setCurrentClassId: (id: string | null) => void
  toggleSidebar: () => void
  syncLocalCredential: () => void
  loadZjuamCourses: (opts?: { force?: boolean }) => Promise<void>
  resetZjuam: () => void
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
            zjuamError: error instanceof Error ? error.message : '获取课程失败',
          })
        }
      },
      resetZjuam: () => set({ zjuamCourses: null, zjuamStatus: 'idle', zjuamError: null }),
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
