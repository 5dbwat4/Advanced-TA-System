import { PrismaClient } from '@prisma/client'

// 临时调试代码：无条件记录全部 SQL（含参数），用完删除。
export const prisma = new PrismaClient({
  log: [{ emit: 'event', level: 'query' }],
})

prisma.$on('query', (event) => {
  console.log(
    JSON.stringify({
      level: 'debug',
      time: Date.now(),
      msg: 'db query',
      durationMs: event.duration,
      target: event.target,
      sql: event.query,
      params: event.params,
    }),
  )
})
