import { apiFetch } from '@/lib/api/client'
import type { Question, QuestionBank, Tag } from '@/lib/api/types'

export function listQuestions(params?: {
  q?: string
  tagId?: string
  ids?: string[]
  limit?: number
  offset?: number
}): Promise<{ questions: Question[]; total: number }> {
  const search = new URLSearchParams()
  if (params?.q) search.set('q', params.q)
  if (params?.tagId) search.set('tagId', params.tagId)
  if (params?.ids && params.ids.length > 0) search.set('ids', params.ids.join(','))
  if (params?.limit != null) search.set('limit', String(params.limit))
  if (params?.offset != null) search.set('offset', String(params.offset))
  const qs = search.toString()
  return apiFetch<{ questions: Question[]; total: number }>(
    `/api/questions${qs ? `?${qs}` : ''}`,
  )
}

export function listTags(): Promise<{ tags: Tag[] }> {
  return apiFetch<{ tags: Tag[] }>('/api/tags')
}

export function getTag(id: string): Promise<{ tag: Tag }> {
  return apiFetch<{ tag: Tag }>(`/api/tags/${id}`)
}

export function createTag(name: string): Promise<{ tag: Tag }> {
  return apiFetch<{ tag: Tag }>('/api/tags', {
    method: 'POST',
    body: JSON.stringify({ name }),
  })
}

export function renameTag(id: string, name: string): Promise<{ tag: Tag }> {
  return apiFetch<{ tag: Tag }>(`/api/tags/${id}`, {
    method: 'PATCH',
    body: JSON.stringify({ name }),
  })
}

export function deleteTag(id: string): Promise<{ ok: true }> {
  return apiFetch<{ ok: true }>(`/api/tags/${id}`, { method: 'DELETE' })
}

export function fetchBankQuestions(bankId: string): Promise<{ questions: Question[] }> {
  return apiFetch<{ questions: Question[] }>(`/api/banks/${bankId}/questions`)
}

export function createQuestion(body: {
  question: string
  answer: string
  tagIds?: string[]
}): Promise<{ question: Question }> {
  return apiFetch<{ question: Question }>('/api/questions', {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

export function updateQuestion(
  id: string,
  body: { question?: string; answer?: string; tagIds?: string[] },
): Promise<{ question: Question }> {
  return apiFetch<{ question: Question }>(`/api/questions/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  })
}

export function duplicateQuestion(id: string): Promise<{ question: Question }> {
  return apiFetch<{ question: Question }>(`/api/questions/${id}/duplicate`, { method: 'POST' })
}

export function deleteQuestion(id: string): Promise<{ ok: true }> {
  return apiFetch<{ ok: true }>(`/api/questions/${id}`, { method: 'DELETE' })
}

export function listBanks(params?: { tagId?: string }): Promise<{ banks: QuestionBank[] }> {
  const search = new URLSearchParams()
  if (params?.tagId) search.set('tagId', params.tagId)
  const qs = search.toString()
  return apiFetch<{ banks: QuestionBank[] }>(`/api/banks${qs ? `?${qs}` : ''}`)
}

export function createBank(name: string, tagIds?: string[]): Promise<{ bank: QuestionBank }> {
  return apiFetch<{ bank: QuestionBank }>('/api/banks', {
    method: 'POST',
    body: JSON.stringify({ name, tagIds }),
  })
}

export function renameBank(
  id: string,
  name: string,
  tagIds?: string[],
): Promise<{ bank: QuestionBank }> {
  return apiFetch<{ bank: QuestionBank }>(`/api/banks/${id}`, {
    method: 'PATCH',
    body: JSON.stringify({ name, tagIds }),
  })
}

export function duplicateBank(id: string): Promise<{ bank: QuestionBank }> {
  return apiFetch<{ bank: QuestionBank }>(`/api/banks/${id}/duplicate`, { method: 'POST' })
}

export function deleteBank(id: string): Promise<{ ok: true }> {
  return apiFetch<{ ok: true }>(`/api/banks/${id}`, { method: 'DELETE' })
}

export function setBankQuestions(
  id: string,
  questionIds: string[],
): Promise<{ bank: QuestionBank }> {
  return apiFetch<{ bank: QuestionBank }>(`/api/banks/${id}/questions`, {
    method: 'PUT',
    body: JSON.stringify({ questionIds }),
  })
}

export function addBankQuestions(
  id: string,
  questionIds: string[],
): Promise<{ bank: QuestionBank }> {
  return apiFetch<{ bank: QuestionBank }>(`/api/banks/${id}/questions`, {
    method: 'POST',
    body: JSON.stringify({ questionIds }),
  })
}

export function removeBankQuestions(
  id: string,
  questionIds: string[],
): Promise<{ bank: QuestionBank }> {
  return apiFetch<{ bank: QuestionBank }>(`/api/banks/${id}/questions`, {
    method: 'DELETE',
    body: JSON.stringify({ questionIds }),
  })
}
