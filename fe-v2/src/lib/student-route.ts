import type { User } from '@/lib/api'

/** 学生登录后的落点：未设置用户名先去统一初始化页 */
export function studentHomePath(user: Pick<User, 'role' | 'username'>): string {
  return user.username ? '/student-console' : '/setup'
}

/** 观察者登录后的落点 */
export function viewerHomePath(): string {
  return '/viewer'
}

/** 按角色选择登录后落点 */
export function homePathFor(user: Pick<User, 'role' | 'username'>): string {
  if (!user.username) return '/setup'
  if (user.role === 'STUDENT') return studentHomePath(user)
  if (user.role === 'VIEWER') return viewerHomePath()
  return '/console'
}
