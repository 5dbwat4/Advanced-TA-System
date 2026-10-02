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
  score: z.string(),
  /** 范围上限，空串表示固定分值 */
  scoreMax: z.string(),
  defaultSelected: z.boolean(),
})

const criterionSectionSchema = z.object({
  id: z.string().min(1),
  type: z.literal('section'),
  title: z.string(),
  /** 小节初始分：小节内所有加减操作基于它进行 */
  init: z.string(),
  /** 分数上限：小节内加分累计到上限为止，空串表示不限 */
  cap: z.string(),
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

    let payload: unknown = null
    try {
      payload = JSON.parse(record.payload)
    } catch {
      payload = null
    }
    return reply.send({ payload, createdAt: record.createdAt })
  })
}
