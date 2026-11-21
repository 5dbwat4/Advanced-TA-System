import { apiFetch } from '@/lib/api/client'
import type { Experiment, Score, Student } from '@/lib/api/types'

export type ClassTables = { students: Student[]; experiments: Experiment[]; scores: Score[] }

export async function fetchClassTables(classId?: string): Promise<ClassTables> {
  const [studentRes, experimentRes, scoreRes] = await Promise.all([
    apiFetch<{ students: Student[] }>(classId ? `/api/students?classId=${encodeURIComponent(classId)}` : '/api/students'),
    apiFetch<{ experiments: Experiment[] }>('/api/experiments'),
    apiFetch<{ scores: Score[] }>(classId ? `/api/scores?classId=${encodeURIComponent(classId)}` : '/api/scores'),
  ])
  return { students: studentRes.students, experiments: experimentRes.experiments, scores: scoreRes.scores }
}

export function saveScore(body: {
  userId: string
  type: number
  indId: string
  score: number
}): Promise<{ score: Score }> {
  return apiFetch<{ score: Score }>('/api/scores', {
    method: 'PUT',
    body: JSON.stringify(body),
  })
}

export function listStudents(classId: string): Promise<{ students: Student[] }> {
  return apiFetch<{ students: Student[] }>(`/api/students?classId=${encodeURIComponent(classId)}`)
}
