export const SCORE_MAX = 100

export const SCORE_TYPES = [
  { value: 0, label: '功能测试' },
  { value: 1, label: '验收问答' },
  { value: 2, label: '报告' },
] as const

export function scoreKey(stuId: string, type: number, indId: string): string {
  return `${stuId}:${type}:${indId}`
}
