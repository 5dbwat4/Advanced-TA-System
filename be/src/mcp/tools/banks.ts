import type { Prisma } from '@prisma/client'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'

import { filterExistingQuestionIds, normalizeQuestionIds, parseBankQuestions } from '../../lib/banks'
import { prisma } from '../../lib/prisma'
import { jsonResult, runTool } from '../helpers'
import type { McpPrincipal } from '../principal'

const bankInclude = {
  owner: { select: { id: true, username: true, name: true } },
  _count: { select: { experiments: true } },
} satisfies Prisma.QuestionBankInclude

type BankWithInclude = Prisma.QuestionBankGetPayload<{ include: typeof bankInclude }>

/** 题目集对外结构：questions 由 JSON 字符串转为数组 */
function serializeBank(bank: BankWithInclude) {
  return {
    id: bank.id,
    name: bank.name,
    owner: bank.owner,
    questions: parseBankQuestions(bank.questions),
    experimentCount: bank._count.experiments,
    createdAt: bank.createdAt,
    updatedAt: bank.updatedAt,
  }
}

async function loadQuestionsInOrder(ids: string[]) {
  if (ids.length === 0) return []
  const rows = await prisma.question.findMany({
    where: { id: { in: ids } },
    select: {
      id: true,
      question: true,
      answer: true,
      provider: true,
      user: { select: { id: true, username: true, name: true } },
    },
  })
  const byId = new Map(rows.map((row) => [row.id, row]))
  return ids.flatMap((id) => {
    const row = byId.get(id)
    return row ? [row] : []
  })
}

export function registerBankTools(server: McpServer, principal: McpPrincipal): void {
  server.registerTool(
    'list_banks',
    {
      title: '列出题目集',
      description: '列出所有题目集及其题目 id 列表、绑定的实验数量。',
      inputSchema: {},
    },
    () =>
      runTool(principal, 'list_banks', 'banks:read', async () => {
        const banks = await prisma.questionBank.findMany({
          include: bankInclude,
          orderBy: { updatedAt: 'desc' },
        })
        return jsonResult({ banks: banks.map(serializeBank) })
      }),
  )

  server.registerTool(
    'get_bank',
    {
      title: '获取题目集',
      description: '获取题目集详情及按顺序排列的题目（含题干与答案）。',
      inputSchema: { id: z.string().min(1).describe('题目集 id') },
    },
    (args) =>
      runTool(principal, 'get_bank', 'banks:read', async () => {
        const bank = await prisma.questionBank.findUnique({
          where: { id: args.id },
          include: bankInclude,
        })
        if (!bank) throw new Error('题目集不存在')
        const questions = await loadQuestionsInOrder(parseBankQuestions(bank.questions))
        return jsonResult({ bank: serializeBank(bank), questions })
      }),
  )

  server.registerTool(
    'create_bank',
    {
      title: '新建题目集',
      description: '新建一个题目集，管理者为当前用户。',
      inputSchema: { name: z.string().trim().min(1).max(64).describe('题目集名称') },
    },
    (args) =>
      runTool(principal, 'create_bank', 'banks:write', async () => {
        const bank = await prisma.questionBank.create({
          data: { name: args.name, ownerId: principal.userId },
          include: bankInclude,
        })
        return jsonResult({ bank: serializeBank(bank) })
      }),
  )

  server.registerTool(
    'rename_bank',
    {
      title: '重命名题目集',
      description: '重命名题目集（任意 staff 可操作，会影响所有使用它的实验）。',
      inputSchema: {
        id: z.string().min(1).describe('题目集 id'),
        name: z.string().trim().min(1).max(64).describe('新名称'),
      },
    },
    (args) =>
      runTool(principal, 'rename_bank', 'banks:write', async () => {
        const existing = await prisma.questionBank.findUnique({ where: { id: args.id } })
        if (!existing) throw new Error('题目集不存在')
        const bank = await prisma.questionBank.update({
          where: { id: args.id },
          data: { name: args.name },
          include: bankInclude,
        })
        return jsonResult({ bank: serializeBank(bank) })
      }),
  )

  server.registerTool(
    'duplicate_bank',
    {
      title: '复制题目集',
      description: '复制一个题目集，管理者为当前用户。',
      inputSchema: { id: z.string().min(1).describe('题目集 id') },
    },
    (args) =>
      runTool(principal, 'duplicate_bank', 'banks:write', async () => {
        const existing = await prisma.questionBank.findUnique({ where: { id: args.id } })
        if (!existing) throw new Error('题目集不存在')
        const bank = await prisma.questionBank.create({
          data: {
            name: `${existing.name} 副本`,
            ownerId: principal.userId,
            questions: existing.questions,
          },
          include: bankInclude,
        })
        return jsonResult({ bank: serializeBank(bank) })
      }),
  )

  server.registerTool(
    'delete_bank',
    {
      title: '删除题目集',
      description: '删除题目集（绑定它的实验会自动解绑）。',
      inputSchema: { id: z.string().min(1).describe('题目集 id') },
    },
    (args) =>
      runTool(principal, 'delete_bank', 'banks:write', async () => {
        const existing = await prisma.questionBank.findUnique({ where: { id: args.id } })
        if (!existing) throw new Error('题目集不存在')
        await prisma.questionBank.delete({ where: { id: args.id } })
        return jsonResult({ ok: true })
      }),
  )

  server.registerTool(
    'add_bank_questions',
    {
      title: '向题目集追加题目',
      description: '追加题目 id（自动去重，忽略不存在的 id）。',
      inputSchema: {
        bankId: z.string().min(1).describe('题目集 id'),
        questionIds: z.array(z.string().min(1)).min(1).max(2000).describe('题目 id 列表'),
      },
    },
    (args) =>
      runTool(principal, 'add_bank_questions', 'banks:write', async () => {
        const incoming = await filterExistingQuestionIds(normalizeQuestionIds(args.questionIds))
        const bank = await prisma.$transaction(async (tx) => {
          const current = await tx.questionBank.findUnique({ where: { id: args.bankId } })
          if (!current) return null
          const list = parseBankQuestions(current.questions)
          const present = new Set(list)
          for (const id of incoming) {
            if (!present.has(id)) {
              list.push(id)
              present.add(id)
            }
          }
          return tx.questionBank.update({
            where: { id: args.bankId },
            data: { questions: JSON.stringify(list) },
            include: bankInclude,
          })
        })
        if (!bank) throw new Error('题目集不存在')
        return jsonResult({ bank: serializeBank(bank) })
      }),
  )

  server.registerTool(
    'remove_bank_questions',
    {
      title: '从题目集移除题目',
      description: '按题目 id 从题目集中移除。',
      inputSchema: {
        bankId: z.string().min(1).describe('题目集 id'),
        questionIds: z.array(z.string().min(1)).min(1).max(2000).describe('题目 id 列表'),
      },
    },
    (args) =>
      runTool(principal, 'remove_bank_questions', 'banks:write', async () => {
        const removing = new Set(normalizeQuestionIds(args.questionIds))
        const bank = await prisma.$transaction(async (tx) => {
          const current = await tx.questionBank.findUnique({ where: { id: args.bankId } })
          if (!current) return null
          const list = parseBankQuestions(current.questions).filter((id) => !removing.has(id))
          return tx.questionBank.update({
            where: { id: args.bankId },
            data: { questions: JSON.stringify(list) },
            include: bankInclude,
          })
        })
        if (!bank) throw new Error('题目集不存在')
        return jsonResult({ bank: serializeBank(bank) })
      }),
  )

  server.registerTool(
    'set_bank_questions',
    {
      title: '设置题目集题目',
      description: '覆盖 / 重排题目集的题目列表（忽略不存在的 id）。',
      inputSchema: {
        bankId: z.string().min(1).describe('题目集 id'),
        questionIds: z
          .array(z.string().min(1))
          .max(2000)
          .describe('完整的题目 id 列表（含顺序）'),
      },
    },
    (args) =>
      runTool(principal, 'set_bank_questions', 'banks:write', async () => {
        const existing = await prisma.questionBank.findUnique({ where: { id: args.bankId } })
        if (!existing) throw new Error('题目集不存在')
        const list = await filterExistingQuestionIds(normalizeQuestionIds(args.questionIds))
        const bank = await prisma.questionBank.update({
          where: { id: args.bankId },
          data: { questions: JSON.stringify(list) },
          include: bankInclude,
        })
        return jsonResult({ bank: serializeBank(bank) })
      }),
  )
}
