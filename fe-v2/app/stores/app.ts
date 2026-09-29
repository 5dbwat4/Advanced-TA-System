import { apiFetch, type Course } from '~/lib/api'
import { getZjuamCredential } from '~/lib/zjuam'

/** zjuam 课程列表的加载状态机 */
export type ZjuamStatus = 'idle' | 'loading' | 'ready' | 'error'

/** 与旧版 zustand persist 相同的 localStorage key，方便老用户无缝沿用 */
const STORAGE_KEY = 'tasaas.app'

/** 真正需要落到 localStorage 的那一小片状态 */
export type PersistedAppState = {
  currentClassId: string | null
  sidebarCollapsed: boolean
}

/** 兼容 zustand persist 写出的 `{ state: {...}, version: 0 }` 结构 */
function readPersistedState(): PersistedAppState {
  const fallback: PersistedAppState = { currentClassId: null, sidebarCollapsed: false }
  if (typeof localStorage === 'undefined') return fallback
  const raw = localStorage.getItem(STORAGE_KEY)
  if (!raw) return fallback
  try {
    const parsed = JSON.parse(raw) as { state?: Partial<PersistedAppState> | null } | null
    const slice = parsed?.state
    if (!slice) return fallback
    return {
      currentClassId: typeof slice.currentClassId === 'string' ? slice.currentClassId : null,
      sidebarCollapsed: slice.sidebarCollapsed === true,
    }
  } catch {
    return fallback
  }
}

/** 供插件调用的持久化写入；序列化结构与 zustand persist 保持一致 */
export function persistAppState(state: PersistedAppState): void {
  if (typeof localStorage === 'undefined') return
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ state, version: 0 }))
  } catch {
    // 隐私模式 / 配额满：持久化失败不应影响使用
  }
}

export const useAppStore = defineStore('app', {
  state: () => ({
    // 从 localStorage 恢复，结构与旧版一致
    ...readPersistedState(),
    hasLocalCredential: Boolean(getZjuamCredential()),
    zjuamCourses: null as Course[] | null,
    zjuamStatus: 'idle' as ZjuamStatus,
    zjuamError: null as string | null,
  }),

  actions: {
    setCurrentClassId(id: string | null) {
      this.currentClassId = id
    },

    toggleSidebar() {
      this.sidebarCollapsed = !this.sidebarCollapsed
    },

    /** 手动录入过浙大教务账号后调用，同步「是否可自动拉取」的标记 */
    syncLocalCredential() {
      this.hasLocalCredential = Boolean(getZjuamCredential())
    },

    /**
     * 拉取浙大教务课程列表。
     * loading / ready 状态下重复调用会被去重，`force` 可强制重新拉取。
     */
    async loadZjuamCourses(opts: { force?: boolean } = {}) {
      if (!opts.force && (this.zjuamStatus === 'loading' || this.zjuamStatus === 'ready')) return
      this.zjuamStatus = 'loading'
      this.zjuamError = null
      try {
        const local = getZjuamCredential()
        const body = local ? { account: local.account, password: local.password } : {}
        const data = await apiFetch<{ courses: Course[] }>('/api/auth/zjuam/courses', {
          method: 'POST',
          body: JSON.stringify(body),
        })
        this.zjuamCourses = data.courses
        this.zjuamStatus = 'ready'
      } catch (error) {
        this.zjuamStatus = 'error'
        this.zjuamError = error instanceof Error ? error.message : '获取课程失败'
      }
    },

    resetZjuam() {
      this.zjuamCourses = null
      this.zjuamStatus = 'idle'
      this.zjuamError = null
    },
  },
})
