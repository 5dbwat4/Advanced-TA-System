/** 常规分数上限（0~100，超出需二次确认） */
export const SCORE_MAX = 100

/** 允许的分数绝对值上限（硬性边界，超出直接拒绝） */
export const SCORE_LIMIT = 1000

export const SCORE_TYPES = [
  { value: 0, label: '功能测试' },
  { value: 1, label: '验收问答' },
  { value: 2, label: '报告' },
] as const

export function scoreKey(stuId: string, type: number, indId: string): string {
  return `${stuId}:${type}:${indId}`
}
