import { apiFetch } from '@/lib/api/client'

export type DevBoardStudent = { userId: string; name: string; studentId: string }

export type DevBoard = {
  id: string
  classId: string
  /** DB id（纯记录，班内唯一，卡片标题） */
  dbId: string
  /** id（纯记录，系统内无关联，卡片副标题） */
  boardId: string | null
  phone: string | null
  borrowed: boolean
  /** 当前登记的合用学生 id（已过滤失效学生） */
  userIds: string[]
  students: DevBoardStudent[]
  createdAt: string
  updatedAt: string
}

export type DevBoardInput = {
  dbId: string
  boardId?: string | null
  phone?: string | null
  userIds?: string[]
}

export function listDevBoards(classId: string): Promise<{ devBoards: DevBoard[] }> {
  return apiFetch<{ devBoards: DevBoard[] }>(
    `/api/devboards?classId=${encodeURIComponent(classId)}`,
  )
}

export function createDevBoard(
  classId: string,
  body: DevBoardInput,
): Promise<{ devBoard: DevBoard }> {
  return apiFetch<{ devBoard: DevBoard }>('/api/devboards', {
    method: 'POST',
    body: JSON.stringify({ classId, ...body }),
  })
}

export function updateDevBoard(
  id: string,
  body: Partial<DevBoardInput>,
): Promise<{ devBoard: DevBoard }> {
  return apiFetch<{ devBoard: DevBoard }>(`/api/devboards/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  })
}

export function deleteDevBoard(id: string): Promise<{ ok: true }> {
  return apiFetch<{ ok: true }>(`/api/devboards/${id}`, { method: 'DELETE' })
}

export function borrowDevBoard(
  id: string,
  body: { userIds: string[]; phone?: string | null },
): Promise<{ devBoard: DevBoard }> {
  return apiFetch<{ devBoard: DevBoard }>(`/api/devboards/${id}/borrow`, {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

export function returnDevBoard(id: string): Promise<{ devBoard: DevBoard }> {
  return apiFetch<{ devBoard: DevBoard }>(`/api/devboards/${id}/return`, { method: 'POST' })
}

export type DevBoardImportRow = {
  dbId: string
  boardId?: string | null
  phone?: string | null
  borrowed?: boolean
  studentIds?: string[]
}

export type DevBoardImportResult = {
  created: number
  failed: { row: number; dbId: string; reason: string }[]
}

export function importDevBoards(
  classId: string,
  rows: DevBoardImportRow[],
): Promise<DevBoardImportResult> {
  return apiFetch<DevBoardImportResult>('/api/devboards/import', {
    method: 'POST',
    body: JSON.stringify({ classId, rows }),
  })
}
