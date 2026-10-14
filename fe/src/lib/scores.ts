import type { Score } from '@/lib/api'

/** 常规分数上限（0~100，超出需二次确认） */
export const SCORE_MAX = 100

/** 允许的分数绝对值上限（硬性边界，超出直接拒绝） */
export const SCORE_LIMIT = 1000

/** 独立计分项目的分数类型：不属于任何实验，indId 直接存项目名 */
export const SCORE_TYPE_EXTRA = 3

export const SCORE_TYPES = [
  { value: 0, label: '功能测试' },
  { value: 1, label: '验收问答' },
  { value: 2, label: '报告' },
] as const

export function scoreKey(stuId: string, type: number, indId: string): string {
  return `${stuId}:${type}:${indId}`
}

/** 从若干分数里提取「独立计分项目」的项目名（去重并按中文排序） */
export function extraProjectNames(scores: Iterable<Score>): string[] {
  const names = new Set<string>()
  for (const score of scores) {
    if (score.type === SCORE_TYPE_EXTRA) names.add(score.indId)
  }
  return [...names].sort((a, b) => a.localeCompare(b, 'zh-Hans-CN'))
}
