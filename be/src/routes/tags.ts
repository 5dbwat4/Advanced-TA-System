import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'

import { requireStaff } from '../lib/class-access.js'
import { prisma } from '../lib/prisma.js'
import { serializeTag, tagInclude } from '../lib/tags.js'

const nameSchema = z.object({
  name: z.string().trim().min(1).max(32),
})

export const tagsRoutes: FastifyPluginAsync = async (fastify) => {
  /** 标签列表（含题目 / 题目集绑定数量） */
  fastify.get('/', { onRequest: [fastify.authenticate] }, async () => {
    const tags = await prisma.tag.findMany({
      include: tagInclude,
      orderBy: { name: 'asc' },
    })
    return { tags: tags.map(serializeTag) }
  })

  /** 标签详情 */
  fastify.get('/:id', { onRequest: [fastify.authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const tag = await prisma.tag.findUnique({ where: { id }, include: tagInclude })
    if (!tag) {
      return reply.code(404).send({ error: 'TAG_NOT_FOUND', message: '标签不存在' })
    }
    return { tag: serializeTag(tag) }
  })

  /** 新建标签 */
  fastify.post('/', { onRequest: [fastify.authenticate] }, async (request, reply) => {
    if (!requireStaff(request, reply)) return reply

    const parsed = nameSchema.safeParse(request.body)
    if (!parsed.success) {
      return reply.code(400).send({ error: 'INVALID_BODY', message: '请求参数不正确' })
    }

    const tag = await prisma.tag.create({
      data: { name: parsed.data.name },
      include: tagInclude,
    })

    return reply.code(201).send({ tag: serializeTag(tag) })
  })

  /** 重命名标签 */
  fastify.patch('/:id', { onRequest: [fastify.authenticate] }, async (request, reply) => {
    if (!requireStaff(request, reply)) return reply

    const { id } = request.params as { id: string }
    const parsed = nameSchema.safeParse(request.body)
    if (!parsed.success) {
      return reply.code(400).send({ error: 'INVALID_BODY', message: '请求参数不正确' })
    }

    const existing = await prisma.tag.findUnique({ where: { id } })
    if (!existing) {
      return reply.code(404).send({ error: 'TAG_NOT_FOUND', message: '标签不存在' })
    }

    const tag = await prisma.tag.update({
      where: { id },
      data: { name: parsed.data.name },
      include: tagInclude,
    })

    return reply.send({ tag: serializeTag(tag) })
  })

  /** 删除标签（自动解除题目 / 题目集上的绑定） */
  fastify.delete('/:id', { onRequest: [fastify.authenticate] }, async (request, reply) => {
    if (!requireStaff(request, reply)) return reply

    const { id } = request.params as { id: string }
    const existing = await prisma.tag.findUnique({ where: { id } })
    if (!existing) {
      return reply.code(404).send({ error: 'TAG_NOT_FOUND', message: '标签不存在' })
    }

    await prisma.tag.delete({ where: { id } })

    return reply.send({ ok: true })
  })
}
