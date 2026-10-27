import { createStore, get, set } from 'idb-keyval'

import type { CriterionItem } from '@/components/criteria/types'

/** 本地默认评分标准：本设备按实验持久化，供该实验下所有未批改报告统一套用 */
export type LocalDefaultRule = { key: string; items: CriterionItem[] }

/** experimentId → 默认评分标准 */
type RuleMap = Record<string, LocalDefaultRule>

/** 单独的 object store，避免与报告附件缓存（清空缓存时）互相影响 */
const store = createStore('tasaas', 'report-defaults')
const KEY = 'default-criteria-by-experiment'

function isValidRule(value: unknown): value is LocalDefaultRule {
  return (
    !!value &&
    typeof value === 'object' &&
    typeof (value as LocalDefaultRule).key === 'string' &&
    Array.isArray((value as LocalDefaultRule).items)
  )
}

/** 读取本设备为指定实验持久化的默认评分标准（无 / 损坏时返回 null） */
export async function loadLocalDefaultRule(experimentId: string): Promise<LocalDefaultRule | null> {
  try {
    const map = await get<RuleMap>(KEY, store)
    const value = map?.[experimentId]
    return isValidRule(value) ? value : null
  } catch {
    return null
  }
}

/** 持久化指定实验的默认评分标准（失败不影响内存态） */
export async function saveLocalDefaultRule(
  experimentId: string,
  rule: LocalDefaultRule,
): Promise<void> {
  try {
    const map = (await get<RuleMap>(KEY, store)) ?? {}
    map[experimentId] = rule
    await set(KEY, map, store)
  } catch {
    // IndexedDB 不可用 — 仅保留内存态
  }
}
