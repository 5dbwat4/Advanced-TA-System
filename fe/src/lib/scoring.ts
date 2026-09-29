import type { ClassSettings } from './api'
import { SCORE_TYPES } from './scores'

/** 评分占比：功能测试 / 验收问答 / 报告的相对权重（非负整数） */
export type ScoreRatio = [number, number, number]

/** 默认占比：功能测试 : 验收问答 : 报告 = 2 : 5 : 0（报告不计入） */
export const DEFAULT_SCORE_RATIO: ScoreRatio = [2, 5, 0]

const RATIO_LENGTH = SCORE_TYPES.length

/** 规范化任意输入为三个非负整数；非法输入回退到默认占比 */
export function sanitizeScoreRatio(value: unknown): ScoreRatio {
  if (Array.isArray(value) && value.length === RATIO_LENGTH) {
    return value.map((item) => {
      const n = Math.floor(Number(item))
      return Number.isFinite(n) && n > 0 ? n : 0
    }) as ScoreRatio
  }
  return [...DEFAULT_SCORE_RATIO] as ScoreRatio
}

/** 归一化后的百分比（合计 100；全为 0 时返回全 0） */
export function ratioPercentages(ratio: number[]): number[] {
  const sum = ratio.reduce((acc, item) => acc + (item > 0 ? item : 0), 0)
  if (sum <= 0) return ratio.map(() => 0)
  return ratio.map((item) => (item > 0 ? (item / sum) * 100 : 0))
}

/**
 * 按占比加权计算总分：忽略权重为 0 的项目；权重 > 0 但缺少成绩时返回 null；
 * 所有项目权重均为 0 时同样返回 null。
 */
export function weightedTotal(scores: (number | null)[], ratio: number[]): number | null {
  let weightSum = 0
  let acc = 0
  for (let index = 0; index < ratio.length; index += 1) {
    const weight = ratio[index] ?? 0
    if (weight <= 0) continue
    const score = scores[index]
    if (score == null) return null
    weightSum += weight
    acc += weight * score
  }
  if (weightSum <= 0) return null
  return Math.round((acc / weightSum) * 10) / 10
}

/** 解析某实验最终生效的评分占比（统一模式取课程占比，否则取该实验占比） */
export function resolveScoreRatio(settings: ClassSettings | null, experimentId: string): ScoreRatio {
  if (!settings) return [...DEFAULT_SCORE_RATIO] as ScoreRatio
  const raw = settings.scoreRatioUnified
    ? settings.scoreRatio
    : (settings.experimentScoreRatios?.[experimentId] ?? settings.scoreRatio)
  return sanitizeScoreRatio(raw)
}
