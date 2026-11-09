export const ROLES = ['TA', 'TEACHER', 'VIEWER', 'STUDENT'] as const

export type Role = (typeof ROLES)[number]

/** 可通过「添加用户 / 邀请链接」授予的角色；学生账号由课程名单产生 */
export const INVITABLE_ROLES = ['TA', 'TEACHER', 'VIEWER'] as const

export type InvitableRole = (typeof INVITABLE_ROLES)[number]

export function isRole(value: unknown): value is Role {
  return typeof value === 'string' && (ROLES as readonly string[]).includes(value)
}

/** 可参与后台登录的角色 */
export function isStaff(role: string): boolean {
  return role === 'TA' || role === 'TEACHER'
}

/** 观察者角色：只读查看课程数据 */
export function isViewer(role: string): boolean {
  return role === 'VIEWER'
}

/** 学生角色 */
export function isStudent(role: string): boolean {
  return role === 'STUDENT'
}
