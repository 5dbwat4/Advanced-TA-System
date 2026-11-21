import type { CustomCards } from '@/lib/custom-cards'

export type Role = 'TA' | 'TEACHER' | 'VIEWER' | 'STUDENT'

/** 可通过「添加用户 / 邀请链接」授予的角色；学生由课程名单产生 */
export type InvitableRole = 'TA' | 'TEACHER' | 'VIEWER'

export type MarkdownStyleId = 'github' | 'prose'

export type UserPreferences = {
  device: 'single' | 'multi'
  draw: 'random' | 'fixed'
  markdownStyle: MarkdownStyleId
  drawCount: number
  customCards: CustomCards
}

export type ClassInfo = {
  id: string
  name: string
  type: '2026-sys1' | '2026-sys2' | '2026-sys3'
  xzzdClassId?: string | null
  lastRosterSyncAt?: string | null
}

export type RosterEntry = { studentId: string; name: string }

export type RosterDiff = {
  added: RosterEntry[]
  removed: RosterEntry[]
  unchangedCount: number
}

export type Student = {
  userId: string
  name: string
  studentId: string
  classId: string | null
  status: string
  klass: ClassInfo | null
}

export type Ta = {
  id: string
  name: string
  role: Role
  studentId: string
  username: string | null
  classId: string | null
  classes: ClassInfo[]
  activated: boolean
  hasPassword: boolean
  zjuamAccount: string | null
  createdAt: string
}

export type Score = {
  userId: string
  type: number
  indId: string
  labId: string | null
  score: number
  graderId: string | null
  graderName: string | null
  createdAt: string
  updatedAt: string
}

export type Passkey = {
  id: string
  createdAt: string | null
  deviceType: string
}

export type User = {
  id: string
  name: string
  role: Role
  avatar: number | null
  studentId: string | null
  username: string | null
  classId: string | null
  classes: ClassInfo[]
  status: string
  hasWebauthn: boolean
  hasPassword: boolean
  passkeys: Passkey[]
  zjuamAccount: string | null
  hasZjuamPassword: boolean
  preferences: UserPreferences | null
  /** 观察者账号：nav 是否展示「重点关注对象列表」 */
  viewerFocusNavVisible: boolean
}

export type Experiment = {
  id: string
  mark: string
  title: string
  classId: string
  questionBankId: string | null
  xzzdBindIdCheckout: string | null
  xzzdBindIdReport: string | null
  publishTime: string | null
  checkoffDeadline: string | null
  reportDeadline: string | null
  lastXzzdDownSyncAt: string | null
  lastXzzdUpSyncAt: string | null
  klass: { id: string; name: string; xzzdClassId: string | null }
  questionBank: { id: string; name: string } | null
  createdAt: string
  updatedAt: string
}

export type QuestionUser = {
  id: string
  username: string | null
  name: string
  avatar?: number | null
}

export type Course = {
  id: number
  name: string
  courseCode: string | null
  displayName: string | null
  isInstructor: boolean
}

export type TagSummary = {
  id: string
  name: string
}

export type Tag = TagSummary & {
  questionCount: number
  bankCount: number
  createdAt: string
  updatedAt: string
}

export type Question = {
  id: string
  question: string
  answer: string
  provider: string
  tags: TagSummary[]
  createdAt: string
  updatedAt: string
  user: QuestionUser
}

export type QuestionBank = {
  id: string
  name: string
  owner: QuestionUser
  tags: TagSummary[]
  questions: string[]
  experimentCount: number
  createdAt: string
  updatedAt: string
}

export type CheckoffExperiment = {
  id: string
  mark: string
  title: string
  classId: string
  questionCount: number
}

export type CheckoffStudent = {
  userId: string
  name: string
  studentId: string
  avatar: number | null
}
