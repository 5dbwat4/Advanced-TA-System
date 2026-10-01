import type { DevBoard, Prisma } from '@prisma/client'

import { prisma } from './prisma'

export const boardStudentSelect = {
  stuId: true,
  name: true,
  studentNo: true,
} satisfies Prisma.StudentSelect

export type BoardStudent = Prisma.StudentGetPayload<{ select: typeof boardStudentSelect }>

/** 解析开发板的合用学生 id JSON，非法时返回空数组（不抛错） */
export function parseBoardStudentIds(raw: string | null | undefined): string[] {
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
export function normalizeStudentIds(input: unknown): string[] {
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
export async function resolveBoardStudentIds(
  classId: string,
  input: unknown,
): Promise<string[] | null> {
  const ids = normalizeStudentIds(input)
  if (ids.length === 0) return []

  const rows = await prisma.student.findMany({
    where: { classId, stuId: { in: ids } },
    select: { stuId: true },
  })
  if (rows.length !== ids.length) return null
  return ids
}

/** 批量加载开发板涉及的学生（按 stuId 索引） */
export async function loadBoardStudents(
  classId: string,
  boards: DevBoard[],
): Promise<Map<string, BoardStudent>> {
  const ids = new Set<string>()
  for (const board of boards) {
    for (const stuId of parseBoardStudentIds(board.stuIds)) ids.add(stuId)
  }
  if (ids.size === 0) return new Map()

  const students = await prisma.student.findMany({
    where: { classId, stuId: { in: [...ids] } },
    select: boardStudentSelect,
  })
  return new Map(students.map((student) => [student.stuId, student]))
}

/** 开发板对外结构：stuIds JSON 转为数组，并附带仍有效的学生信息 */
export function serializeBoard(board: DevBoard, students: Map<string, BoardStudent>) {
  const resolved = parseBoardStudentIds(board.stuIds).flatMap((stuId) => {
    const student = students.get(stuId)
    return student ? [student] : []
  })

  return {
    id: board.id,
    classId: board.classId,
    dbId: board.dbId,
    boardId: board.boardId,
    phone: board.phone,
    borrowed: board.borrowed,
    stuIds: resolved.map((student) => student.stuId),
    students: resolved,
    createdAt: board.createdAt,
    updatedAt: board.updatedAt,
  }
}
