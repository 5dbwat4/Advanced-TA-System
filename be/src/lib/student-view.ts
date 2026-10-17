import type { FastifyInstance } from 'fastify'

import { env } from '../env'

/** 学生成绩查看链接的 JWT 载荷：学号 uid + 实验 eid（不设签发时间与有效期） */
export type StudentViewPayload = {
  uid: string
  eid: string
}

/** 签发学生查看链接 token（永久有效） */
export function signStudentViewToken(
  fastify: FastifyInstance,
  userId: string,
  experimentId: string,
): string {
  return fastify.jwt.sign({ uid: userId, eid: experimentId } satisfies StudentViewPayload, {
    noTimestamp: true,
  })
}

/** 学生查看链接（站点根地址 + 签名 token） */
export function studentViewUrl(
  fastify: FastifyInstance,
  userId: string,
  experimentId: string,
): string {
  const root = env.root.replace(/\/+$/, '')
  return `${root}/student-preview/view?token=${signStudentViewToken(fastify, userId, experimentId)}`
}
