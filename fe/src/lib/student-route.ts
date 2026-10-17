import type { User } from '@/lib/api'

/** 学生登录后的落点：未设置用户名先去解封页 */
export function studentHomePath(user: Pick<User, 'role' | 'username'>): string {
  return user.role === 'STUDENT' && !user.username ? '/student/unlock' : '/student-console'
}

/** 按角色选择登录后落点 */
export function homePathFor(user: Pick<User, 'role' | 'username'>): string {
  if (user.role === 'STUDENT') return studentHomePath(user)
  return user.username ? '/console' : '/setup'
}
