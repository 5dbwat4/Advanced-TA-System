import type { DevBoard } from '@prisma/client'

import { prisma } from './prisma.js'

/** 开发板上的学生信息 */
export type BoardStudent = {
  userId: string
  name: string
  studentId: string | null
}

/** 解析开发板的合用学生 id JSON，非法时返回空数组（不抛错） */
export function parseBoardUserIds(raw: string | null | undefined): string[] {
  if (typeof raw !== 'string' || raw.length === 0) return []

  try {
    const value = JSON.parse(raw) as unknown
    if (!Array.isArray(value)) return []
    return value.filter((item): item is string => typeof item === 'string' && item.length > 0)
  } catch {
    return []
  }
}

/** 归一化学生 id 输入：去重、丢弃非字符串/空串，保留首次出现顺序 */
export function normalizeUserIds(input: unknown): string[] {
  if (!Array.isArray(input)) return []
  const seen = new Set<string>()
  const result: string[] = []
  for (const item of input) {
    if (typeof item !== 'string' || item.length === 0) continue
    if (seen.has(item)) continue
    seen.add(item)
    result.push(item)
  }
  return result
}

/** 校验学生均属于该班级，返回去重后的 id；存在不属于班级的学生时返回 null */
export async function resolveBoardUserIds(
  classId: string,
  input: unknown,
): Promise<string[] | null> {
  const ids = normalizeUserIds(input)
  if (ids.length === 0) return []

  const rows = await prisma.user.findMany({
    where: { classId, role: 'STUDENT', status: 'ACTIVE', id: { in: ids } },
    select: { id: true },
  })
  if (rows.length !== ids.length) return null
  return ids
}

/** 批量加载开发板涉及的学生（按 userId 索引） */
export async function loadBoardUsers(
  classId: string,
  boards: DevBoard[],
): Promise<Map<string, BoardStudent>> {
  const ids = new Set<string>()
  for (const board of boards) {
    for (const userId of parseBoardUserIds(board.userIds)) ids.add(userId)
  }
  if (ids.size === 0) return new Map()

  const users = await prisma.user.findMany({
    where: { classId, role: 'STUDENT', status: 'ACTIVE', id: { in: [...ids] } },
    select: { id: true, name: true, studentId: true },
  })
  return new Map(
    users.map((user) => [
      user.id,
      { userId: user.id, name: user.name, studentId: user.studentId ?? '' },
    ]),
  )
}

/** 开发板对外结构：userIds JSON 转为数组，并附带仍有效的学生信息 */
export function serializeBoard(board: DevBoard, students: Map<string, BoardStudent>) {
  const resolved = parseBoardUserIds(board.userIds).flatMap((userId) => {
    const student = students.get(userId)
    return student ? [student] : []
  })

  return {
    id: board.id,
    classId: board.classId,
    dbId: board.dbId,
    boardId: board.boardId,
    phone: board.phone,
    borrowed: board.borrowed,
    userIds: resolved.map((student) => student.userId),
    students: resolved,
    createdAt: board.createdAt,
    updatedAt: board.updatedAt,
  }
}
