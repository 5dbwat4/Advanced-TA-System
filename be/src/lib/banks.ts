import { prisma } from './prisma'

/** 解析题库的题目 id 列表 JSON，非法时返回空数组（不抛错） */
export function parseBankQuestions(raw: string | null | undefined): string[] {
  if (typeof raw !== 'string' || raw.length === 0) {
    return []
  }

  try {
    const value = JSON.parse(raw) as unknown
    if (!Array.isArray(value)) return []
    return value.filter((item): item is string => typeof item === 'string' && item.length > 0)
  } catch {
    return []
  }
}

/** 归一化题目 id 输入：去重、丢弃非字符串/空串，保留首次出现顺序 */
export function normalizeQuestionIds(input: unknown): string[] {
  if (!Array.isArray(input)) return []
  const seen = new Set<string>()
  const result: string[] = []
  for (const item of input) {
    if (typeof item !== 'string' || item.length === 0) continue
    if (seen.has(item)) continue
    seen.add(item)
    result.push(item)
  }
  return result
}

/** 过滤出仍然存在的题目 id（保持原顺序） */
export async function filterExistingQuestionIds(ids: string[]): Promise<string[]> {
  if (ids.length === 0) return []
  const rows = await prisma.question.findMany({
    where: { id: { in: ids } },
    select: { id: true },
  })
  const existing = new Set(rows.map((row) => row.id))
  return ids.filter((id) => existing.has(id))
}

/** 从所有题库中移除指定题目 id（删除题目后清理 JSON 悬挂引用） */
export async function removeQuestionsFromBanks(questionIds: string[]): Promise<void> {
  if (questionIds.length === 0) return
  const remove = new Set(questionIds)

  const banks = await prisma.questionBank.findMany({ select: { id: true, questions: true } })
  const updates = banks
    .map((bank) => ({ bank, ids: parseBankQuestions(bank.questions) }))
    .filter(({ ids }) => ids.some((id) => remove.has(id)))
    .map(({ bank, ids }) =>
      prisma.questionBank.update({
        where: { id: bank.id },
        data: { questions: JSON.stringify(ids.filter((id) => !remove.has(id))) },
      }),
    )

  if (updates.length > 0) {
    await prisma.$transaction(updates)
  }
}
