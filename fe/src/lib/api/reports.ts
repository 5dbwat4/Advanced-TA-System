import { deserializeItems, serializeItems } from '@/components/criteria/serialize'
import type { CriterionItem } from '@/components/criteria/types'
import { apiFetch } from '@/lib/api/client'
import type { Score } from './types'

export type CriteriaPayloadInput = { version: 1; items: CriterionItem[] }
export type CriteriaVisibility = 'private' | 'public'
export type CriteriaMetadataInput = {
  name: string
  classId: string
  visibility: CriteriaVisibility
}

function serializeCriteria(payload: CriteriaPayloadInput, metadata: CriteriaMetadataInput) {
  return {
    ...metadata,
    payload: { version: 1, items: serializeItems(payload.items) },
  }
}

export function saveCriteria(
  payload: CriteriaPayloadInput,
  metadata: CriteriaMetadataInput,
): Promise<{ key: string; createdAt: string }> {
  return apiFetch<{ key: string; createdAt: string }>('/api/criteria', {
    method: 'POST',
    body: JSON.stringify(serializeCriteria(payload, metadata)),
  })
}

export async function fetchCriteria(key: string): Promise<{
  name: string
  classId: string | null
  className: string | null
  visibility: CriteriaVisibility
  canManage: boolean
  payload: { items: CriterionItem[] } | null
  createdAt: string
  usageCount: number
}> {
  const res = await apiFetch<{
    name: string
    classId: string | null
    className: string | null
    visibility: CriteriaVisibility
    canManage: boolean
    payload: unknown
    createdAt: string
    usageCount: number
  }>(`/api/criteria/${key}`)
  const raw = res.payload as { items?: unknown } | null
  return {
    name: res.name,
    classId: res.classId,
    className: res.className,
    visibility: res.visibility,
    canManage: res.canManage,
    payload: raw ? { items: deserializeItems(raw.items) } : null,
    createdAt: res.createdAt,
    usageCount: res.usageCount,
  }
}

export type CriteriaSummary = {
  key: string
  name: string
  classId: string | null
  className: string | null
  visibility: CriteriaVisibility
  canManage: boolean
  createdAt: string
  updatedAt: string
  cardCount: number
  /** 引用该评分标准的批阅记录数 */
  usageCount: number
}

/** 所有 public 标准，以及当前课程 staff 可见的 private 标准 */
export function fetchCriteriaList(): Promise<{ criteria: CriteriaSummary[] }> {
  return apiFetch<{ criteria: CriteriaSummary[] }>('/api/criteria')
}

/** 原地更新评分标准（保留同一分享码，引用它的批阅自动沿用） */
export function updateCriteria(
  key: string,
  payload: CriteriaPayloadInput,
  metadata: CriteriaMetadataInput,
): Promise<{ key: string; updatedAt: string }> {
  return apiFetch<{ key: string; updatedAt: string }>(`/api/criteria/${key}`, {
    method: 'PUT',
    body: JSON.stringify(serializeCriteria(payload, metadata)),
  })
}

/** 删除评分标准（仅未被任何批阅引用时可用） */
export function deleteCriteria(key: string): Promise<{ ok: boolean }> {
  return apiFetch<{ ok: boolean }>(`/api/criteria/${key}`, { method: 'DELETE' })
}

/** 影响预览：引用某评分标准的批阅（含身份与批阅内容） */
export type CriteriaImpactReview = {
  userId: string
  name: string
  studentId: string
  experimentId: string
  experimentMark: string
  experimentTitle: string
  /** 解析后的批阅内容 */
  content: unknown
}

/** 拉取影响预览数据（不落库）：旧 items + 全部引用该标准的批阅 */
export async function fetchCriteriaImpact(
  key: string,
  payload: CriteriaPayloadInput,
): Promise<{ oldItems: CriterionItem[]; reviews: CriteriaImpactReview[] }> {
  const res = await apiFetch<{ oldItems: unknown; reviews: CriteriaImpactReview[] }>(
    `/api/criteria/${key}/impact`,
    {
      method: 'POST',
      body: JSON.stringify({ payload: { version: 1, items: serializeItems(payload.items) } }),
    },
  )
  return { oldItems: deserializeItems(res.oldItems), reviews: res.reviews }
}

export type ReportReview = {
  userId: string
  experimentId: string
  ruleId: string
  ruleContent: unknown
  remarkById: string | null
  remarkByName: string | null
  updatedAt: string
}

export async function fetchReportReview(
  userId: string,
  experimentId: string,
): Promise<ReportReview | null> {
  const res = await apiFetch<{ review: ReportReview | null }>(
    `/api/report-reviews?userId=${encodeURIComponent(userId)}&experimentId=${encodeURIComponent(experimentId)}`,
  )
  return res.review
}

export function saveReportReview(body: {
  userId: string
  experimentId: string
  ruleId: string
  ruleContent: unknown
  score?: number
}): Promise<{ review: ReportReview; score?: Score }> {
  return apiFetch<{ review: ReportReview; score?: Score }>('/api/report-reviews', {
    method: 'PUT',
    body: JSON.stringify(body),
  })
}

/** 附言类型：0=验收，1=实验报告 */
export const REMARK_TYPE_CHECKOFF = 0
export const REMARK_TYPE_REPORT = 1

export type Remark = {
  userId: string
  experimentId: string
  type: number
  text: string
  updatedById: string | null
  updatedByName: string | null
  updatedAt: string
}

export async function fetchRemark(
  userId: string,
  experimentId: string,
  type: number,
): Promise<Remark | null> {
  const res = await apiFetch<{ remark: Remark | null }>(
    `/api/remarks?userId=${encodeURIComponent(userId)}&experimentId=${encodeURIComponent(experimentId)}&type=${type}`,
  )
  return res.remark
}

/** 某实验下所有学生的附言（含全部类型），供「查看评语」页批量展示 */
export async function fetchExperimentRemarks(experimentId: string): Promise<Remark[]> {
  const res = await apiFetch<{ remarks: Remark[] }>(
    `/api/remarks/experiment/${encodeURIComponent(experimentId)}`,
  )
  return res.remarks
}

export function saveRemark(body: {
  userId: string
  experimentId: string
  type: number
  text: string
}): Promise<{ remark: Remark }> {
  return apiFetch<{ remark: Remark }>('/api/remarks', {
    method: 'PUT',
    body: JSON.stringify(body),
  })
}
