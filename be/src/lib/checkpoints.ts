export const CHECKPOINT_RULES = [{ key: 'lab0-zero', label: 'Lab 0 置为0分' }] as const

/** 课程级规则 key → 位标志（未知 / 空为 0） */
export function checkpointRuleBit(key: unknown): number {
  if (typeof key !== 'string') return 0
  const index = CHECKPOINT_RULES.findIndex((rule) => rule.key === key)
  return index < 0 ? 0 : 1 << index
}

/** 位标志 → 规则名称列表 */
export function checkpointRuleLabels(bits: number): string[] {
  return CHECKPOINT_RULES.filter((_, index) => (bits & (1 << index)) !== 0).map(
    (rule) => rule.label,
  )
}
