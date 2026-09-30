import type { FastifyInstance } from 'fastify'

import { env } from '../env'

/** 学生成绩查看链接的 JWT 载荷：学生 uuid + 实验 uuid（不设签发时间与有效期） */
export type StudentViewPayload = {
  stuId: string
  expId: string
}

/** 签发学生查看链接 token（永久有效） */
export function signStudentViewToken(
  fastify: FastifyInstance,
  stuId: string,
  expId: string,
): string {
  return fastify.jwt.sign({ stuId, expId } satisfies StudentViewPayload, { noTimestamp: true })
}

/** 学生查看链接（站点根地址 + 签名 token） */
export function studentViewUrl(fastify: FastifyInstance, stuId: string, expId: string): string {
  const root = env.root.replace(/\/+$/, '')
  return `${root}/student-preview/view?token=${signStudentViewToken(fastify, stuId, expId)}`
}
