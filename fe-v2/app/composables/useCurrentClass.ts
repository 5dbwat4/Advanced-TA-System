import type { ClassInfo } from '~/lib/api'

/**
 * 当前选中的班级：优先用用户选过的，没有则退回用户所属的第一个班级。
 * 旧版是普通函数、每次渲染重新计算，这里改成 computed 以便在多个组件里共享。
 */
export function useCurrentClass(): ComputedRef<ClassInfo | null> {
  const { user } = useAuthStore()
  const currentClassId = useAppStore((s) => s.currentClassId)

  return computed(() => {
    const classes = user?.classes ?? []
    return classes.find((c) => c.id === currentClassId) ?? classes[0] ?? null
  })
}
