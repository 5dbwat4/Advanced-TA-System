/**
 * scores —— 逐字移植自 `fe/src/lib/scores.ts`（11 行）
 *
 * 评分类型常量与打分记录 key 拼接，只有常量和纯函数，**逻辑与源文件逐字一致，
 * 无任何行为差异**（导出名 / 常量值 / 函数签名均未改动）。
 */

export const SCORE_MAX = 100

export const SCORE_TYPES = [
  { value: 0, label: '功能测试' },
  { value: 1, label: '验收问答' },
  { value: 2, label: '报告' },
] as const

export function scoreKey(stuId: string, type: number, indId: string): string {
  return `${stuId}:${type}:${indId}`
}
