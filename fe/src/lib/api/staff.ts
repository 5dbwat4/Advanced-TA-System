import { apiFetch } from '@/lib/api/client'
import type { InvitableRole, Ta, User } from '@/lib/api/types'

export type StaffMember = {
  id: string
  name: string
  role: InvitableRole
  studentId: string
  username: string | null
  avatar: number | null
}

/** 课程 Staff 名单（教师 / 助教 / 观察者） */
export async function listClassStaff(classId: string): Promise<StaffMember[]> {
  const res = await apiFetch<{ members: StaffMember[] }>(
    `/api/staff/members?classId=${encodeURIComponent(classId)}`,
  )
  return res.members
}

export async function listTas(): Promise<Ta[]> {
  const res = await apiFetch<{ tas: Ta[] }>('/api/staff/tas')
  return res.tas
}

export async function addTa(studentId: string): Promise<Ta> {
  const res = await apiFetch<{ ta: Ta }>('/api/staff/tas', {
    method: 'POST',
    body: JSON.stringify({ studentId }),
  })
  return res.ta
}

/** 为本课程添加指定角色的用户，返回一次性初始密码 */
export async function addClassUser(
  studentId: string,
  role: InvitableRole,
): Promise<{ user: Ta; password: string }> {
  return apiFetch<{ user: Ta; password: string }>('/api/staff/users/class', {
    method: 'POST',
    body: JSON.stringify({ studentId, role }),
  })
}

/** 生成课程邀请链接 JWT */
export function createInviteLink(
  role: InvitableRole,
): Promise<{ token: string; role: InvitableRole; expiresAt: string }> {
  return apiFetch<{ token: string; role: InvitableRole; expiresAt: string }>('/api/invites', {
    method: 'POST',
    body: JSON.stringify({ role }),
  })
}

export type InviteInfo = {
  role: InvitableRole
  expiresAt: string
  inviterName: string
  className: string | null
}

/** 查看邀请信息（公开） */
export function getInviteInfo(token: string): Promise<InviteInfo> {
  return apiFetch<InviteInfo>(`/api/invites/info?token=${encodeURIComponent(token)}`)
}

/** 接受邀请并创建 / 复用班级账号 */
export type AcceptInviteInput = {
  token: string
  studentId?: string
  username: string
  name: string
  password?: string
}

/** 接受邀请并创建班级账号 */
export function acceptInvite(input: AcceptInviteInput): Promise<{ token: string; user: User }> {
  return apiFetch<{ token: string; user: User }>('/api/invites/accept', {
    method: 'POST',
    body: JSON.stringify(input),
  })
}
