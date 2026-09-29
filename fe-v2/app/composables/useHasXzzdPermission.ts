/**
 * 是否能看到「重点关注学生」等依赖浙大教务账号的入口。
 *
 * 判定链（与旧版一致）：
 *  1. 本地手动录入过账号，或服务端保存过密码（hasZjuamPassword）
 *  2. 当前班级绑定了 xzzdClassId
 *  3. 教务课程列表里该课程是本人授课（isInstructor）
 */
export function useHasXzzdPermission(): ComputedRef<boolean> {
  const { user } = useAuthStore()
  const currentClass = useCurrentClass()
  const hasLocalCredential = useAppStore((s) => s.hasLocalCredential)
  const zjuamCourses = useAppStore((s) => s.zjuamCourses)

  return computed(() => {
    const hasCredential = hasLocalCredential || Boolean(user?.hasZjuamPassword)
    if (!hasCredential || !currentClass.value?.xzzdClassId) return false

    return (
      zjuamCourses?.some(
        (course) =>
          String(course.id) === String(currentClass.value?.xzzdClassId) &&
          course.isInstructor === true,
      ) ?? false
    )
  })
}
