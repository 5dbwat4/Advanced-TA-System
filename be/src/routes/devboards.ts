import { Prisma, type DevBoard } from '@prisma/client'
import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from 'fastify'
import { z } from 'zod'

import { myClassIds, requireStaff } from '../lib/class-access'
import {
  loadBoardStudents,
  resolveBoardStudentIds,
  serializeBoard,
} from '../lib/devboards'
import { prisma } from '../lib/prisma'

const listQuerySchema = z.object({
  classId: z.string().trim().min(1),
})

const studentIdsSchema = z.array(z.string().trim().min(1)).max(50)

const createBodySchema = z.object({
  classId: z.string().trim().min(1),
  dbId: z.string().trim().min(1).max(64),
  boardId: z.string().trim().max(64).nullable().optional(),
  phone: z.string().trim().max(32).nullable().optional(),
  stuIds: studentIdsSchema.optional(),
})

const updateBodySchema = z.object({
  dbId: z.string().trim().min(1).max(64).optional(),
  boardId: z.string().trim().max(64).nullable().optional(),
  phone: z.string().trim().max(32).nullable().optional(),
  stuIds: studentIdsSchema.optional(),
})

const borrowBodySchema = z.object({
  stuIds: studentIdsSchema.min(1),
  phone: z.string().trim().max(32).nullable().optional(),
})

const boardParamsSchema = z.object({
  id: z.string().min(1),
})

const importRowSchema = z.object({
  dbId: z.string().trim().min(1).max(64),
  boardId: z.string().trim().max(64).nullable().optional(),
  phone: z.string().trim().max(32).nullable().optional(),
  borrowed: z.boolean().optional(),
  studentNos: z.array(z.string().trim().min(1)).max(50).optional(),
})

const importBodySchema = z.object({
  classId: z.string().trim().min(1),
  rows: z.array(importRowSchema).min(1).max(500),
})

function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002'
}

export const devboardsRoutes: FastifyPluginAsync = async (fastify) => {
  /** 校验班级归属：不属于当前用户时发送 403 并返回 false */
  async function requireClassAccess(
    request: FastifyRequest,
    reply: FastifyReply,
    classId: string,
  ): Promise<boolean> {
    const classIds = await myClassIds(request)
    if (!classIds.includes(classId)) {
      reply.code(403).send({ error: 'FORBIDDEN', message: '无权访问该班级' })
      return false
    }
    return true
  }

  /** 加载开发板并校验归属：不存在 404，不属于当前用户 403 */
  async function resolveOwnedBoard(
    request: FastifyRequest,
    reply: FastifyReply,
    id: string,
  ) {
    const board = await prisma.devBoard.findUnique({ where: { id } })
    if (!board) {
      reply.code(404).send({ error: 'BOARD_NOT_FOUND', message: '开发板不存在' })
      return null
    }
    if (!(await requireClassAccess(request, reply, board.classId))) return null
    return board
  }

  /** 序列化单块开发板（附加学生信息） */
  async function sendBoard(reply: FastifyReply, board: DevBoard, statusCode = 200) {
    const students = await loadBoardStudents(board.classId, [board])
    return reply.code(statusCode).send({ devBoard: serializeBoard(board, students) })
  }

  /** 开发板列表（班级内） */
  fastify.get('/', { onRequest: [fastify.authenticate] }, async (request, reply) => {
    const parsed = listQuerySchema.safeParse(request.query)
    if (!parsed.success) {
      return reply.code(400).send({ error: 'INVALID_QUERY', message: '查询参数不正确' })
    }

    const { classId } = parsed.data
    if (!(await requireClassAccess(request, reply, classId))) return reply

    const boards = await prisma.devBoard.findMany({
      where: { classId },
      orderBy: [{ borrowed: 'desc' }, { dbId: 'asc' }],
    })
    const students = await loadBoardStudents(classId, boards)

    return reply.send({
      devBoards: boards.map((board) => serializeBoard(board, students)),
    })
  })

  /** 新建开发板（助教 / 教师） */
  fastify.post('/', { onRequest: [fastify.authenticate] }, async (request, reply) => {
    if (!requireStaff(request, reply)) return reply

    const parsed = createBodySchema.safeParse(request.body ?? {})
    if (!parsed.success) {
      return reply.code(400).send({ error: 'INVALID_BODY', message: '请求参数不正确' })
    }

    const { classId, dbId, boardId, phone } = parsed.data
    if (!(await requireClassAccess(request, reply, classId))) return reply

    const stuIds = await resolveBoardStudentIds(classId, parsed.data.stuIds ?? [])
    if (stuIds === null) {
      return reply.code(400).send({ error: 'STUDENT_NOT_FOUND', message: '存在不属于该班级的学生' })
    }

    let board
    try {
      board = await prisma.devBoard.create({
        data: {
          classId,
          dbId,
          boardId: boardId ?? null,
          phone: phone ?? null,
          stuIds: JSON.stringify(stuIds),
        },
      })
    } catch (error) {
      if (isUniqueViolation(error)) {
        return reply.code(409).send({ error: 'ALREADY_EXISTS', message: '该 DB id 已存在' })
      }
      throw error
    }

    return sendBoard(reply, board, 201)
  })

  /** 修改开发板信息 */
  fastify.patch('/:id', { onRequest: [fastify.authenticate] }, async (request, reply) => {
    if (!requireStaff(request, reply)) return reply

    const parsedParams = boardParamsSchema.safeParse(request.params)
    if (!parsedParams.success) {
      return reply.code(400).send({ error: 'INVALID_BODY', message: '请求参数不正确' })
    }

    const board = await resolveOwnedBoard(request, reply, parsedParams.data.id)
    if (!board) return reply

    const parsedBody = updateBodySchema.safeParse(request.body ?? {})
    if (!parsedBody.success) {
      return reply.code(400).send({ error: 'INVALID_BODY', message: '请求参数不正确' })
    }

    const data: Prisma.DevBoardUpdateInput = {}
    if (parsedBody.data.dbId !== undefined) data.dbId = parsedBody.data.dbId
    if (parsedBody.data.boardId !== undefined) data.boardId = parsedBody.data.boardId
    if (parsedBody.data.phone !== undefined) data.phone = parsedBody.data.phone
    if (parsedBody.data.stuIds !== undefined) {
      const stuIds = await resolveBoardStudentIds(board.classId, parsedBody.data.stuIds)
      if (stuIds === null) {
        return reply
          .code(400)
          .send({ error: 'STUDENT_NOT_FOUND', message: '存在不属于该班级的学生' })
      }
      data.stuIds = JSON.stringify(stuIds)
    }

    let updated
    try {
      updated = await prisma.devBoard.update({ where: { id: board.id }, data })
    } catch (error) {
      if (isUniqueViolation(error)) {
        return reply.code(409).send({ error: 'ALREADY_EXISTS', message: '该 DB id 已存在' })
      }
      throw error
    }

    return sendBoard(reply, updated)
  })

  /** 删除开发板 */
  fastify.delete('/:id', { onRequest: [fastify.authenticate] }, async (request, reply) => {
    if (!requireStaff(request, reply)) return reply

    const parsedParams = boardParamsSchema.safeParse(request.params)
    if (!parsedParams.success) {
      return reply.code(400).send({ error: 'INVALID_BODY', message: '请求参数不正确' })
    }

    const board = await resolveOwnedBoard(request, reply, parsedParams.data.id)
    if (!board) return reply

    await prisma.devBoard.delete({ where: { id: board.id } })
    return reply.send({ ok: true })
  })

  /** 借出开发板（登记合用学生与联系电话） */
  fastify.post('/:id/borrow', { onRequest: [fastify.authenticate] }, async (request, reply) => {
    if (!requireStaff(request, reply)) return reply

    const parsedParams = boardParamsSchema.safeParse(request.params)
    if (!parsedParams.success) {
      return reply.code(400).send({ error: 'INVALID_BODY', message: '请求参数不正确' })
    }

    const board = await resolveOwnedBoard(request, reply, parsedParams.data.id)
    if (!board) return reply

    const parsedBody = borrowBodySchema.safeParse(request.body ?? {})
    if (!parsedBody.success) {
      return reply.code(400).send({ error: 'INVALID_BODY', message: '请求参数不正确' })
    }

    const stuIds = await resolveBoardStudentIds(board.classId, parsedBody.data.stuIds)
    if (stuIds === null) {
      return reply.code(400).send({ error: 'STUDENT_NOT_FOUND', message: '存在不属于该班级的学生' })
    }

    const updated = await prisma.devBoard.update({
      where: { id: board.id },
      data: {
        borrowed: true,
        stuIds: JSON.stringify(stuIds),
        ...(parsedBody.data.phone !== undefined ? { phone: parsedBody.data.phone } : {}),
      },
    })

    return sendBoard(reply, updated)
  })

  /** 归还开发板（保留登记的合用学生与电话） */
  fastify.post('/:id/return', { onRequest: [fastify.authenticate] }, async (request, reply) => {
    if (!requireStaff(request, reply)) return reply

    const parsedParams = boardParamsSchema.safeParse(request.params)
    if (!parsedParams.success) {
      return reply.code(400).send({ error: 'INVALID_BODY', message: '请求参数不正确' })
    }

    const board = await resolveOwnedBoard(request, reply, parsedParams.data.id)
    if (!board) return reply

    const updated = await prisma.devBoard.update({
      where: { id: board.id },
      data: { borrowed: false },
    })

    return sendBoard(reply, updated)
  })

  /** 批量导入开发板（按学号匹配合用学生；逐行校验，返回失败明细） */
  fastify.post('/import', { onRequest: [fastify.authenticate] }, async (request, reply) => {
    if (!requireStaff(request, reply)) return reply

    const parsed = importBodySchema.safeParse(request.body ?? {})
    if (!parsed.success) {
      return reply.code(400).send({ error: 'INVALID_BODY', message: '请求参数不正确' })
    }

    const { classId, rows } = parsed.data
    if (!(await requireClassAccess(request, reply, classId))) return reply

    const students = await prisma.student.findMany({
      where: { classId },
      select: { stuId: true, studentNo: true },
    })
    const byStudentNo = new Map(students.map((student) => [student.studentNo, student.stuId]))

    const existing = await prisma.devBoard.findMany({
      where: { classId },
      select: { dbId: true },
    })
    const existingDbIds = new Set(existing.map((board) => board.dbId))

    const failed: { row: number; dbId: string; reason: string }[] = []
    let created = 0

    for (let index = 0; index < rows.length; index += 1) {
      const row = rows[index]
      const rowNumber = index + 2
      const studentNos = [...new Set(row.studentNos ?? [])]

      if (existingDbIds.has(row.dbId)) {
        failed.push({ row: rowNumber, dbId: row.dbId, reason: 'DB id 已存在' })
        continue
      }

      const missing = studentNos.filter((studentNo) => !byStudentNo.has(studentNo))
      if (missing.length > 0) {
        failed.push({
          row: rowNumber,
          dbId: row.dbId,
          reason: `学号不存在：${missing.join('、')}`,
        })
        continue
      }

      const borrowed = row.borrowed ?? false
      if (borrowed && studentNos.length === 0) {
        failed.push({ row: rowNumber, dbId: row.dbId, reason: '已借出但未填写合用学生学号' })
        continue
      }

      const stuIds = studentNos
        .map((studentNo) => byStudentNo.get(studentNo))
        .filter((stuId): stuId is string => stuId !== undefined)

      try {
        await prisma.devBoard.create({
          data: {
            classId,
            dbId: row.dbId,
            boardId: row.boardId ?? null,
            phone: row.phone ?? null,
            borrowed,
            stuIds: JSON.stringify(stuIds),
          },
        })
        existingDbIds.add(row.dbId)
        created += 1
      } catch (error) {
        if (isUniqueViolation(error)) {
          failed.push({ row: rowNumber, dbId: row.dbId, reason: 'DB id 已存在' })
        } else {
          failed.push({ row: rowNumber, dbId: row.dbId, reason: '写入失败' })
        }
      }
    }

    return reply.send({ created, failed })
  })
}
