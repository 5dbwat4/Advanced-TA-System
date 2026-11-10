import type { Prisma } from '@prisma/client'

import { prisma } from './prisma.js'

/** 标签摘要字段（题目 / 题目集关联加载时使用） */
export const tagSelect = { id: true, name: true } as const

/** 标签查询关联：附带题目 / 题目集数量 */
export const tagInclude = {
  _count: { select: { questions: true, banks: true } },
} satisfies Prisma.TagInclude

export type TagWithCount = Prisma.TagGetPayload<{ include: typeof tagInclude }>

/** 标签对外结构 */
export function serializeTag(tag: TagWithCount) {
  return {
    id: tag.id,
    name: tag.name,
    questionCount: tag._count.questions,
    bankCount: tag._count.banks,
    createdAt: tag.createdAt,
    updatedAt: tag.updatedAt,
  }
}

/** 归一化标签 id 输入：去重、丢弃非字符串/空串，保留首次出现顺序 */
export function normalizeTagIds(input: unknown): string[] {
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

/** 过滤出仍然存在的标签 id（保持原顺序） */
export async function filterExistingTagIds(ids: string[]): Promise<string[]> {
  if (ids.length === 0) return []
  const rows = await prisma.tag.findMany({
    where: { id: { in: ids } },
    select: { id: true },
  })
  const existing = new Set(rows.map((row) => row.id))
  return ids.filter((id) => existing.has(id))
}

/** 生成 Prisma many-to-many 关联写入指令 */
export function tagConnections(ids: string[]): { id: string }[] {
  return ids.map((id) => ({ id }))
}
