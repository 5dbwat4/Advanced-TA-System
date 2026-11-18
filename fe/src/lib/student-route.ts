import type { User } from '@/lib/api'
import { useAppStore } from '@/lib/store'

/** 学生登录后的落点：未设置用户名先去统一初始化页；调试模式跳过 */
export function studentHomePath(user: Pick<User, 'role' | 'username'>): string {
  return user.username || useAppStore.getState().debugMode ? '/student-console' : '/setup'
}

/** 观察者登录后的落点：只读面板 */
export function viewerHomePath(): string {
  return '/viewer'
}

/** 按角色选择登录后落点；调试模式跳过 /setup */
export function homePathFor(user: Pick<User, 'role' | 'username'>): string {
  if (!user.username && !useAppStore.getState().debugMode) return '/setup'
  if (user.role === 'STUDENT') return studentHomePath(user)
  if (user.role === 'VIEWER') return viewerHomePath()
  return '/console'
}
