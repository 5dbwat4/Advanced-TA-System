import type { FastifyPluginAsync } from 'fastify'

import { buildStudentReport } from '../lib/student-report.js'
import type { StudentViewPayload } from '../lib/student-view.js'

/**
 * 学生成绩查看（公开页面数据源）：凭链接中的签名 token 查看
 * 指定学生在指定实验下的成绩；token 载荷仅包含 uid / eid。
 */
export const studentPreviewRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get('/view', async (request, reply) => {
    const { token } = request.query as { token?: string }
    if (!token) {
      return reply.code(400).send({ error: 'BAD_REQUEST', message: '缺少访问令牌' })
    }

    let payload: Partial<StudentViewPayload>
    try {
      payload = fastify.jwt.verify<Partial<StudentViewPayload>>(token)
    } catch {
      return reply.code(401).send({ error: 'INVALID_TOKEN', message: '链接无效或已损坏' })
    }

    const { uid, eid } = payload
    if (typeof uid !== 'string' || typeof eid !== 'string') {
      return reply.code(401).send({ error: 'INVALID_TOKEN', message: '链接无效或已损坏' })
    }

    const report = await buildStudentReport(uid, eid)
    if (!report) {
      return reply.code(404).send({ error: 'NOT_FOUND', message: '链接无效或内容不存在' })
    }

    return report
  })
}
