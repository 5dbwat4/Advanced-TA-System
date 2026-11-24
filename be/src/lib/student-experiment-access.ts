import type { FastifyReply, FastifyRequest } from 'fastify'

import { myClassIds } from './class-access.js'
import { prisma } from './prisma.js'

export async function resolveStudentExperiment(
  request: FastifyRequest,
  reply: FastifyReply,
  userId: string,
  experimentId: string,
) {
  const [student, experiment] = await Promise.all([
    prisma.user.findFirst({
      where: { id: userId, role: 'STUDENT', status: 'ACTIVE' },
      select: { id: true, classId: true },
    }),
    prisma.experiment.findUnique({
      where: { id: experimentId },
      select: { id: true, classId: true, mark: true },
    }),
  ])
  if (!student) {
    reply.code(404).send({ error: 'STUDENT_NOT_FOUND', message: '学生不存在' })
    return null
  }
  if (!experiment) {
    reply.code(404).send({ error: 'EXPERIMENT_NOT_FOUND', message: '实验不存在' })
    return null
  }
  if (!student.classId || student.classId !== experiment.classId) {
    reply.code(400).send({ error: 'CLASS_MISMATCH', message: '实验与学生不属于同一班级' })
    return null
  }

  const classIds = await myClassIds(request)
  if (!classIds.includes(student.classId)) {
    reply.code(403).send({ error: 'FORBIDDEN', message: '无权访问该班级的学生数据' })
    return null
  }
  return { student, experiment }
}
