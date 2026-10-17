export const ROLES = ['TA', 'TEACHER', 'STUDENT'] as const

export type Role = (typeof ROLES)[number]

export function isRole(value: unknown): value is Role {
  return typeof value === 'string' && (ROLES as readonly string[]).includes(value)
}

/** 可参与后台登录的角色 */
export function isStaff(role: string): boolean {
  return role === 'TA' || role === 'TEACHER'
}

/** 学生角色 */
export function isStudent(role: string): boolean {
  return role === 'STUDENT'
}
