import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'

import { prisma } from '../../lib/prisma'
import { jsonResult, runTool } from '../helpers'
import type { McpPrincipal } from '../principal'

export function registerExperimentTools(server: McpServer, principal: McpPrincipal): void {
  server.registerTool(
    'list_experiments',
    {
      title: '列出实验',
      description: '列出你可以访问的班级下的实验（含绑定的题目集 id）。',
      inputSchema: { classId: z.string().min(1).optional().describe('限定班级 id') },
    },
    (args) =>
      runTool(principal, 'list_experiments', 'experiments:read', async () => {
        if (args.classId && !principal.classIds.includes(args.classId)) {
          throw new Error('无权访问该班级')
        }
        const where = args.classId
          ? { classId: args.classId }
          : { classId: { in: principal.classIds } }
        const experiments = await prisma.experiment.findMany({
          where,
          select: {
            id: true,
            mark: true,
            title: true,
            classId: true,
            questionBankId: true,
            publishTime: true,
            checkoffDeadline: true,
            reportDeadline: true,
            createdAt: true,
          },
          orderBy: [{ classId: 'asc' }, { mark: 'asc' }],
        })
        return jsonResult({ experiments })
      }),
  )
}
