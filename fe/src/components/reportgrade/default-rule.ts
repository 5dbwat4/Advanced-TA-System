import { createStore, get, set } from 'idb-keyval'

import type { CriterionItem } from '@/components/criteria/types'

/** 本地默认评分标准：本设备持久化保存，供所有未批改报告统一套用 */
export type LocalDefaultRule = { key: string; items: CriterionItem[] }

/** 单独的 object store，避免与报告附件缓存（清空缓存时）互相影响 */
const store = createStore('tasaas', 'report-defaults')
const KEY = 'default-criteria'

/** 读取本设备持久化的默认评分标准（无 / 损坏时返回 null） */
export async function loadLocalDefaultRule(): Promise<LocalDefaultRule | null> {
  try {
    const value = await get<LocalDefaultRule>(KEY, store)
    if (!value || typeof value.key !== 'string' || !Array.isArray(value.items)) return null
    return value
  } catch {
    return null
  }
}

/** 持久化默认评分标准（失败不影响内存态） */
export async function saveLocalDefaultRule(rule: LocalDefaultRule): Promise<void> {
  try {
    await set(KEY, rule, store)
  } catch {
    // IndexedDB 不可用 — 仅保留内存态
  }
}
