import { defineStore } from 'pinia'
import { computed, ref, watch } from 'vue'

import {
  apiFetch,
  type ClassInfo,
  type Course,
  type InviteInfo,
  type Role,
} from '@/lib/api'
import { useAuthStore } from '@/lib/auth'
import { getErrorMessage } from '@/lib/error'
import { getZjuamCredential } from '@/lib/zjuam'

export type ZjuamStatus = 'idle' | 'loading' | 'ready' | 'error'

/** 登录后账号信息不完整时的来源 */
export type IncompleteLogin = {
  source: 'zjuam' | 'login'
  identifier: string | null
  className: string | null
  role: Role
}

export type OnboardingInfo = InviteInfo | IncompleteLogin

const STORAGE_KEY = 'tasaas.app'

function readPersisted(): { currentClassId: string | null; sidebarCollapsed: boolean } {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { currentClassId: null, sidebarCollapsed: false }
    const value = JSON.parse(raw) as { currentClassId?: unknown; sidebarCollapsed?: unknown }
    return {
      currentClassId: typeof value.currentClassId === 'string' ? value.currentClassId : null,
      sidebarCollapsed: value.sidebarCollapsed === true,
    }
  } catch {
    return { currentClassId: null, sidebarCollapsed: false }
  }
}

export const useAppStore = defineStore('app', () => {
  const persisted = readPersisted()
  const currentClassId = ref<string | null>(persisted.currentClassId)
  const sidebarCollapsed = ref(persisted.sidebarCollapsed)
  const hasLocalCredential = ref(Boolean(getZjuamCredential()))
  const zjuamCourses = ref<Course[] | null>(null)
  const zjuamStatus = ref<ZjuamStatus>('idle')
  const zjuamError = ref<string | null>(null)
  const onboarding = ref(false)
  const onboardingInfo = ref<OnboardingInfo | null>(null)

  watch(
    [currentClassId, sidebarCollapsed],
    () => {
      try {
        localStorage.setItem(
          STORAGE_KEY,
          JSON.stringify({
            currentClassId: currentClassId.value,
            sidebarCollapsed: sidebarCollapsed.value,
          }),
        )
      } catch {
        // ignore
      }
    },
    { deep: true },
  )

  function setCurrentClassId(id: string | null) {
    currentClassId.value = id
  }

  function toggleSidebar() {
    sidebarCollapsed.value = !sidebarCollapsed.value
  }

  function syncLocalCredential() {
    hasLocalCredential.value = Boolean(getZjuamCredential())
  }

  async function loadZjuamCourses(opts: { force?: boolean } = {}) {
    if (!opts.force && (zjuamStatus.value === 'loading' || zjuamStatus.value === 'ready')) return
    zjuamStatus.value = 'loading'
    zjuamError.value = null
    try {
      const local = getZjuamCredential()
      const body = local ? { account: local.account, password: local.password } : {}
      const data = await apiFetch<{ courses: Course[] }>('/api/auth/zjuam/courses', {
        method: 'POST',
        body: JSON.stringify(body),
      })
      zjuamCourses.value = data.courses
      zjuamStatus.value = 'ready'
    } catch (error) {
      zjuamStatus.value = 'error'
      zjuamError.value = getErrorMessage(error, '获取课程失败')
    }
  }

  function resetZjuam() {
    zjuamCourses.value = null
    zjuamStatus.value = 'idle'
    zjuamError.value = null
  }

  function setOnboarding(value: boolean) {
    onboarding.value = value
  }

  function setOnboardingInfo(info: OnboardingInfo | null) {
    onboardingInfo.value = info
  }

  return {
    currentClassId,
    sidebarCollapsed,
    hasLocalCredential,
    zjuamCourses,
    zjuamStatus,
    zjuamError,
    onboarding,
    onboardingInfo,
    setCurrentClassId,
    toggleSidebar,
    syncLocalCredential,
    loadZjuamCourses,
    resetZjuam,
    setOnboarding,
    setOnboardingInfo,
  }
})

export function useCurrentClass(): ClassInfo | null {
  const auth = useAuthStore()
  const app = useAppStore()
  const classes = auth.user?.classes ?? []
  return classes.find((c) => c.id === app.currentClassId) ?? classes[0] ?? null
}

export function useHasXzzdPermission(): boolean {
  const auth = useAuthStore()
  const app = useAppStore()
  const currentClass = useCurrentClass()
  const hasCredential = app.hasLocalCredential || Boolean(auth.user?.hasZjuamPassword)
  if (!hasCredential || !currentClass?.xzzdClassId) return false
  return (
    app.zjuamCourses?.some(
      (course) =>
        String(course.id) === String(currentClass.xzzdClassId) && course.isInstructor === true,
    ) ?? false
  )
}

export function useCurrentClassComputed() {
  const auth = useAuthStore()
  const app = useAppStore()
  return computed(() => {
    const classes = auth.user?.classes ?? []
    return classes.find((c) => c.id === app.currentClassId) ?? classes[0] ?? null
  })
}
