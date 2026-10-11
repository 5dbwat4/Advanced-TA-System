import { randomBytes } from 'node:crypto'
import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'

import { requireStaff } from '../lib/class-access'
import { prisma } from '../lib/prisma'

const criterionCardSchema = z.object({
  id: z.string().min(1),
  type: z.literal('card'),
  mode: z.enum(['add', 'subtract']),
  /** 写在评语中的简短规则（卡片标题位） */
  rule: z.string(),
  /** 详细标准（正文） */
  detail: z.string(),
  /** 分值（范围时为下限） */
  score: z.number(),
  /** 范围上限，null 表示固定分值 */
  scoreMax: z.number().nullable(),
  defaultSelected: z.boolean(),
})

const criterionSectionSchema = z.object({
  id: z.string().min(1),
  type: z.literal('section'),
  title: z.string(),
  /** 小节初始分：小节内所有加减操作基于它进行 */
  init: z.number().nullable(),
  /** 分数上限：小节内加分累计到上限为止，null 表示不限 */
  cap: z.number().nullable(),
  children: z.array(criterionCardSchema),
})

const criteriaPayloadSchema = z.object({
  version: z.literal(1),
  items: z.array(z.union([criterionCardSchema, criterionSectionSchema])),
})

const saveCriteriaSchema = z.object({
  payload: criteriaPayloadSchema,
})

const KEY_PATTERN = /^[0-9a-f]{48}$/

export const criteriaRoutes: FastifyPluginAsync = async (fastify) => {
  /** 列出当前用户创建的全部评分标准 */
  fastify.get('/', { onRequest: [fastify.authenticate] }, async (request, reply) => {
    if (!requireStaff(request, reply)) return reply

    const { sub } = request.user as { sub: string }
    const rows = await prisma.criteria.findMany({
      where: { creatorId: sub },
      orderBy: { createdAt: 'desc' },
      select: { key: true, payload: true, createdAt: true, updatedAt: true },
    })

    const keys = rows.map((row) => row.key)
    const usage = keys.length
      ? await prisma.reportReview.groupBy({
          by: ['ruleId'],
          where: { ruleId: { in: keys } },
          _count: { _all: true },
        })
      : []
    const usageByKey = new Map(usage.map((item) => [item.ruleId, item._count._all]))

    return reply.send({
      criteria: rows.map((row) => {
        const payload = parseJson(row.payload)
        const items =
          payload && typeof payload === 'object'
            ? (payload as { items?: unknown }).items
            : undefined
        return {
          key: row.key,
          createdAt: row.createdAt,
          updatedAt: row.updatedAt,
          cardCount: countCards(items),
          usageCount: usageByKey.get(row.key) ?? 0,
        }
      }),
    })
  })

  /** 保存评分标准，返回 48 位 hex 分享码 */
  fastify.post('/', { onRequest: [fastify.authenticate] }, async (request, reply) => {
    if (!requireStaff(request, reply)) return reply

    const parsed = saveCriteriaSchema.safeParse(request.body)
    if (!parsed.success) {
      return reply.code(400).send({ error: 'INVALID_BODY', message: '请求参数不正确' })
    }

    const { sub } = request.user as { sub: string }
    const key = randomBytes(24).toString('hex')
    const created = await prisma.criteria.create({
      data: { key, payload: JSON.stringify(parsed.data.payload ?? null), creatorId: sub },
      select: { key: true, createdAt: true },
    })
    return reply.send({ key: created.key, createdAt: created.createdAt })
  })

  /** 按分享码读取评分标准 */
  fastify.get('/:key', { onRequest: [fastify.authenticate] }, async (request, reply) => {
    const key = (request.params as { key?: string }).key ?? ''
    if (!KEY_PATTERN.test(key)) {
      return reply.code(400).send({ error: 'INVALID_KEY', message: '分享码格式不正确' })
    }

    const record = await prisma.criteria.findUnique({
      where: { key },
      select: { payload: true, createdAt: true },
    })
    if (!record) {
      return reply.code(404).send({ error: 'CRITERIA_NOT_FOUND', message: '分享码不存在' })
    }

    const usageCount = await prisma.reportReview.count({ where: { ruleId: key } })

    let payload: unknown = null
    try {
      payload = JSON.parse(record.payload)
    } catch {
      payload = null
    }
    return reply.send({ payload, createdAt: record.createdAt, usageCount })
  })

  /** 更新评分标准内容（仅创建者）：原地覆盖同一分享码，引用该分享码的批阅自动沿用 */
  fastify.put('/:key', { onRequest: [fastify.authenticate] }, async (request, reply) => {
    if (!requireStaff(request, reply)) return reply

    const key = (request.params as { key?: string }).key ?? ''
    if (!KEY_PATTERN.test(key)) {
      return reply.code(400).send({ error: 'INVALID_KEY', message: '分享码格式不正确' })
    }

    const parsed = saveCriteriaSchema.safeParse(request.body)
    if (!parsed.success) {
      return reply.code(400).send({ error: 'INVALID_BODY', message: '请求参数不正确' })
    }

    const { sub } = request.user as { sub: string }
    const record = await prisma.criteria.findUnique({
      where: { key },
      select: { creatorId: true },
    })
    if (!record) {
      return reply.code(404).send({ error: 'CRITERIA_NOT_FOUND', message: '分享码不存在' })
    }
    if (record.creatorId !== sub) {
      return reply.code(403).send({ error: 'FORBIDDEN', message: '只能编辑自己创建的评分标准' })
    }

    const updated = await prisma.criteria.update({
      where: { key },
      data: { payload: JSON.stringify(parsed.data.payload ?? null) },
      select: { key: true, updatedAt: true },
    })
    return reply.send({ key: updated.key, updatedAt: updated.updatedAt })
  })

  /**
   * 影响预览（只读不落库）：返回旧 items 与所有引用该分享码的批阅，
   * 供前端比较「当前编辑内容」对已有批阅的影响。
   */
  fastify.post('/:key/impact', { onRequest: [fastify.authenticate] }, async (request, reply) => {
    if (!requireStaff(request, reply)) return reply

    const key = (request.params as { key?: string }).key ?? ''
    if (!KEY_PATTERN.test(key)) {
      return reply.code(400).send({ error: 'INVALID_KEY', message: '分享码格式不正确' })
    }
    if (!saveCriteriaSchema.safeParse(request.body).success) {
      return reply.code(400).send({ error: 'INVALID_BODY', message: '请求参数不正确' })
    }

    const { sub } = request.user as { sub: string }
    const record = await prisma.criteria.findUnique({
      where: { key },
      select: { creatorId: true, payload: true },
    })
    if (!record) {
      return reply.code(404).send({ error: 'CRITERIA_NOT_FOUND', message: '分享码不存在' })
    }
    if (record.creatorId !== sub) {
      return reply.code(403).send({ error: 'FORBIDDEN', message: '只能查看自己创建的评分标准' })
    }

    const oldPayload = parseJson(record.payload)
    const oldItems =
      oldPayload && typeof oldPayload === 'object'
        ? ((oldPayload as { items?: unknown }).items ?? [])
        : []

    const reviews = await prisma.reportReview.findMany({
      where: { ruleId: key },
      include: {
        student: { select: { name: true, studentNo: true } },
        experiment: { select: { mark: true, title: true } },
      },
      orderBy: [{ experimentId: 'asc' }, { stuId: 'asc' }],
    })

    return reply.send({
      oldItems,
      reviews: reviews.map((review) => ({
        stuId: review.stuId,
        name: review.student.name,
        studentNo: review.student.studentNo,
        experimentId: review.experimentId,
        experimentMark: review.experiment.mark,
        experimentTitle: review.experiment.title,
        content: parseJson(review.ruleContent),
      })),
    })
  })

  /** 删除评分标准：仅创建者可删除，且当前无任何批阅引用时才允许 */
  fastify.delete('/:key', { onRequest: [fastify.authenticate] }, async (request, reply) => {
    if (!requireStaff(request, reply)) return reply

    const key = (request.params as { key?: string }).key ?? ''
    if (!KEY_PATTERN.test(key)) {
      return reply.code(400).send({ error: 'INVALID_KEY', message: '分享码格式不正确' })
    }

    const { sub } = request.user as { sub: string }
    const record = await prisma.criteria.findUnique({
      where: { key },
      select: { creatorId: true },
    })
    if (!record) {
      return reply.code(404).send({ error: 'CRITERIA_NOT_FOUND', message: '分享码不存在' })
    }
    if (record.creatorId !== sub) {
      return reply.code(403).send({ error: 'FORBIDDEN', message: '只能删除自己创建的评分标准' })
    }

    const usageCount = await prisma.reportReview.count({ where: { ruleId: key } })
    if (usageCount > 0) {
      return reply
        .code(409)
        .send({ error: 'CRITERIA_IN_USE', message: `该评分标准正被 ${usageCount} 份批阅使用，无法删除` })
    }

    await prisma.criteria.delete({ where: { key } })
    return reply.send({ ok: true })
  })
}

function parseJson(value: string): unknown {
  try {
    return JSON.parse(value)
  } catch {
    return null
  }
}

/** 统计评分标准中的卡片数（顶层卡片 + 小节内卡片） */
function countCards(items: unknown): number {
  if (!Array.isArray(items)) return 0
  let count = 0
  for (const item of items) {
    if (!item || typeof item !== 'object') continue
    if ((item as { type?: unknown }).type === 'section') {
      const children = (item as { children?: unknown }).children
      if (Array.isArray(children)) count += children.length
    } else {
      count += 1
    }
  }
  return count
}
