export const ROLES = ['TA', 'TEACHER'] as const

export type Role = (typeof ROLES)[number]

export function isRole(value: unknown): value is Role {
  return typeof value === 'string' && (ROLES as readonly string[]).includes(value)
}

/** 可参与后台登录的角色 */
export function isStaff(role: string): boolean {
  return role === 'TA' || role === 'TEACHER'
}
