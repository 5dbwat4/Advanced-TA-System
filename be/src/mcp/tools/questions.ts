import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'

import { removeQuestionsFromBanks } from '../../lib/banks'
import { prisma } from '../../lib/prisma'
import { jsonResult, runTool } from '../helpers'
import type { McpPrincipal } from '../principal'

const questionSelect = {
  id: true,
  question: true,
  answer: true,
  provider: true,
  createdAt: true,
  updatedAt: true,
} as const

export function registerQuestionTools(server: McpServer, principal: McpPrincipal): void {
  server.registerTool(
    'search_questions',
    {
      title: '搜索题目',
      description: '按关键词搜索题目（含题干与答案），支持分页。',
      inputSchema: {
        q: z.string().trim().optional().describe('关键词，匹配题干'),
        limit: z.number().int().min(1).max(100).optional().describe('返回条数，默认 20'),
        offset: z.number().int().min(0).optional().describe('偏移量，默认 0'),
      },
    },
    (args) =>
      runTool(principal, 'search_questions', 'questions:read', async () => {
        const take = args.limit ?? 20
        const skip = args.offset ?? 0
        const where = args.q ? { question: { contains: args.q } } : undefined
        const [questions, total] = await Promise.all([
          prisma.question.findMany({
            where,
            select: questionSelect,
            orderBy: { createdAt: 'desc' },
            take,
            skip,
          }),
          prisma.question.count({ where }),
        ])
        return jsonResult({ total, questions })
      }),
  )

  server.registerTool(
    'get_question',
    {
      title: '获取题目',
      description: '按 id 获取单道题目（含答案）。',
      inputSchema: { id: z.string().min(1).describe('题目 id') },
    },
    (args) =>
      runTool(principal, 'get_question', 'questions:read', async () => {
        const question = await prisma.question.findUnique({
          where: { id: args.id },
          select: questionSelect,
        })
        if (!question) throw new Error('题目不存在')
        return jsonResult({ question })
      }),
  )

  server.registerTool(
    'create_question',
    {
      title: '新建题目',
      description: '新建一道题目，出题人为当前用户。',
      inputSchema: {
        question: z.string().trim().min(1).max(20000).describe('题干（Markdown）'),
        answer: z.string().trim().min(1).max(20000).describe('答案（Markdown）'),
      },
    },
    (args) =>
      runTool(principal, 'create_question', 'questions:write', async () => {
        const question = await prisma.question.create({
          data: { question: args.question, answer: args.answer, provider: principal.userId },
          select: questionSelect,
        })
        return jsonResult({ question })
      }),
  )

  server.registerTool(
    'update_question',
    {
      title: '更新题目',
      description: '更新题目内容（仅出题人可改；其他用户请先用 duplicate_question）。',
      inputSchema: {
        id: z.string().min(1).describe('题目 id'),
        question: z.string().trim().min(1).max(20000).optional().describe('新题干'),
        answer: z.string().trim().min(1).max(20000).optional().describe('新答案'),
      },
    },
    (args) =>
      runTool(principal, 'update_question', 'questions:write', async () => {
        const existing = await prisma.question.findUnique({ where: { id: args.id } })
        if (!existing) throw new Error('题目不存在')
        if (existing.provider !== principal.userId) {
          throw new Error('仅出题人可编辑，可先复制一份再修改')
        }
        const question = await prisma.question.update({
          where: { id: args.id },
          data: { question: args.question, answer: args.answer },
          select: questionSelect,
        })
        return jsonResult({ question })
      }),
  )

  server.registerTool(
    'duplicate_question',
    {
      title: '复制题目',
      description: '复制一道题目，出题人为当前用户。',
      inputSchema: { id: z.string().min(1).describe('题目 id') },
    },
    (args) =>
      runTool(principal, 'duplicate_question', 'questions:write', async () => {
        const existing = await prisma.question.findUnique({ where: { id: args.id } })
        if (!existing) throw new Error('题目不存在')
        const question = await prisma.question.create({
          data: {
            question: existing.question,
            answer: existing.answer,
            provider: principal.userId,
          },
          select: questionSelect,
        })
        return jsonResult({ question })
      }),
  )

  server.registerTool(
    'delete_question',
    {
      title: '删除题目',
      description: '删除题目（仅出题人），并清理所有题目集中的引用。',
      inputSchema: { id: z.string().min(1).describe('题目 id') },
    },
    (args) =>
      runTool(principal, 'delete_question', 'questions:write', async () => {
        const existing = await prisma.question.findUnique({ where: { id: args.id } })
        if (!existing) throw new Error('题目不存在')
        if (existing.provider !== principal.userId) {
          throw new Error('仅出题人可删除，可先复制一份再修改')
        }
        await prisma.question.delete({ where: { id: args.id } })
        await removeQuestionsFromBanks([args.id])
        return jsonResult({ ok: true })
      }),
  )
}
