import { randomUUID } from 'node:crypto'

import type { FastifyInstance } from 'fastify'
import { Server, type Socket } from 'socket.io'

import {
  saveQueueOrder,
  withLatestQueueMutation,
} from './checkoff-queue.js'
import { prisma } from './prisma.js'
import { isStaff } from './roles.js'
import type { ScoreDto } from './score.js'
import { randomSecret, verifyTotp } from './totp.js'

/** 成绩变更事件（按班级广播） */
export type ScoreChangeEvent =
  | {
      action: 'upsert'
      classId: string
      score: ScoreDto
    }
  | { action: 'delete'; classId: string; userId: string; type: number; indId: string }

/** 验收开始事件（按班级验收房间广播，仅打开验收页的用户收到） */
export type CheckoffStartedEvent = {
  classId: string
  userName: string
  studentName: string
  at: number
}

let io: Server | null = null
let log: FastifyInstance['log'] | null = null

function logQueueFailure(message: string, error: unknown, context: Record<string, unknown>) {
  log?.warn({ err: error, ...context }, message)
}

/** 班级房间名 */
export function roomName(classId: string): string {
  return `class:${classId}`
}

/** 验收房间名（仅当前打开验收页的用户加入） */
function watchRoom(classId: string): string {
  return `checkoff-watch:${classId}`
}

/** 验收排队房间名（助教与学生均可加入） */
function checkoffQueueRoom(classId: string): string {
  return `checkoff-queue:${classId}`
}

export type CheckoffActiveStudent = {
  studentId: string
  studentName: string
}

/** 验收在场信息；students 保留同一用户在多个群面 tab 中的全部学生 */
export type CheckoffPeer = {
  userId: string
  name: string
  avatar: number | null
  /** 兼容旧客户端：保留一个学生；完整列表见 students */
  studentName: string | null
  studentId: string | null
  students: CheckoffActiveStudent[]
  at: number
}

type CheckoffPresence = Omit<CheckoffPeer, 'students'> & {
  presenceId: string
  /** 该学生的「正在验收」是否由本次开始自动写入队列 */
  markedCalled: boolean
  /** 取消本次「正在验收」时恢复的队列状态 */
  restoreStatus: 'waiting' | 'notified' | null
}

/** classId → (socketId:presenceId → 在场信息) */
const checkoffPresences = new Map<string, Map<string, CheckoffPresence>>()

function presenceKey(socketId: string, presenceId: string): string {
  return `${socketId}:${presenceId}`
}

/** 在场列表按用户聚合，不再让后上报的 tab 覆盖先前 tab */
function checkoffPeers(classId: string): CheckoffPeer[] {
  const room = checkoffPresences.get(classId)
  if (!room) return []
  const byUser = new Map<string, CheckoffPeer>()
  for (const entry of room.values()) {
    const student =
      entry.studentId && entry.studentName
        ? { studentId: entry.studentId, studentName: entry.studentName }
        : null
    const current = byUser.get(entry.userId)
    if (!current) {
      byUser.set(entry.userId, {
        userId: entry.userId,
        name: entry.name,
        avatar: entry.avatar,
        studentName: entry.studentName,
        studentId: entry.studentId,
        students: student ? [student] : [],
        at: entry.at,
      })
      continue
    }
    if (student && !current.students.some((item) => item.studentId === student.studentId)) {
      current.students.push(student)
    }
    if (entry.at > current.at) {
      current.studentName = entry.studentName
      current.studentId = entry.studentId
      current.at = entry.at
    }
  }
  const peers = [...byUser.values()]
  for (const peer of peers) {
    const legacy =
      peer.students.find((student) => student.studentId === peer.studentId) ??
      peer.students[0] ??
      null
    peer.studentId = legacy?.studentId ?? null
    peer.studentName = legacy?.studentName ?? null
  }
  return peers.sort((a, b) => a.name.localeCompare(b.name, 'zh-Hans-CN'))
}

/** 向验收房间广播在场列表 */
function broadcastCheckoffPresence(classId: string): void {
  io?.to(watchRoom(classId)).emit('checkoff:presence', { classId, peers: checkoffPeers(classId) })
}

function otherPresenceActive(
  classId: string,
  studentId: string,
  exceptKey: string,
): boolean {
  const room = checkoffPresences.get(classId)
  if (!room) return false
  for (const [key, peer] of room) {
    if (key !== exceptKey && peer.studentId === studentId) return true
  }
  return false
}

/** 助教开始验收时，把队列中的该学生标记为正在验收 */
async function markQueueActive(
  classId: string,
  studentId: string,
  callerName: string,
): Promise<{
  marked: boolean
  previousStatus: 'waiting' | 'notified' | 'called' | 'finished'
}> {
  const { value, session } = await withLatestQueueMutation(classId, async ({ tx, session, entries }) => {
    if (session.closedAt) return { changed: false, result: { marked: false, previousStatus: 'waiting' as const } }
    const target = entries.find((entry) => entry.userId === studentId)
    if (!target) return { changed: false, result: { marked: false, previousStatus: 'waiting' as const } }
    if (target.status === 'finished') {
      return { changed: false, result: { marked: false, previousStatus: 'finished' as const } }
    }

    const previousStatus = target.status
    const wasCalled = previousStatus === 'called'
    const now = new Date().toISOString()
    const startedAt = wasCalled ? (target.startedAt ?? now) : now
    const checkedBy = wasCalled ? (target.checkedBy ?? callerName) : callerName
    const finishedAt = wasCalled ? target.finishedAt : null
    const changed =
      target.status !== 'called' ||
      target.startedAt !== startedAt ||
      target.checkedBy !== checkedBy ||
      target.finishedAt !== finishedAt ||
      target.missedAt !== null
    if (changed) {
      await saveQueueOrder(
        tx,
        entries.map((entry) =>
          entry.userId === studentId
            ? { ...entry, status: 'called' as const, startedAt, checkedBy, finishedAt, missedAt: null }
            : entry,
        ),
      )
    }
    return { changed, result: { marked: !wasCalled, previousStatus } }
  })
  if (value.changed) emitCheckoffQueueUpdate(classId, session.id)
  return value.result
}

/** 本次开始自动标记的「正在验收」结束后恢复原状态 */
async function unmarkQueueActive(
  classId: string,
  studentId: string,
  restoreStatus: 'waiting' | 'notified',
  finished: boolean,
): Promise<void> {
  const { value: changed, session } = await withLatestQueueMutation(
    classId,
    async ({ tx, session, entries }) => {
      if (session.closedAt) return false
      const target = entries.find((entry) => entry.userId === studentId)
      if (!target || target.status !== 'called') return false
      await saveQueueOrder(
        tx,
        entries.map((entry) =>
          entry.userId === studentId
            ? {
                ...entry,
                status: finished ? ('waiting' as const) : restoreStatus,
                startedAt: finished ? entry.startedAt : null,
                checkedBy: finished ? entry.checkedBy : null,
              }
            : entry,
        ),
      )
      return true
    },
  )
  if (changed) emitCheckoffQueueUpdate(classId, session.id)
}

/** socket 离开验收房间：移除该连接的全部普通 / 群面在场项（幂等） */
function removeCheckoffPresence(socket: Socket): void {
  const classId = socket.data.checkoffWatchClassId as string | undefined
  socket.data.checkoffWatchClassId = undefined
  if (typeof classId !== 'string') return
  const room = checkoffPresences.get(classId)
  if (!room) return
  const prefix = `${socket.id}:`
  const removed = [...room].filter(([key]) => key.startsWith(prefix))
  if (removed.length === 0) return
  for (const [key, entry] of removed) {
    room.delete(key)
    if (
      entry.markedCalled &&
      entry.studentId &&
      !otherPresenceActive(classId, entry.studentId, key)
    ) {
      void unmarkQueueActive(
        classId,
        entry.studentId,
        entry.restoreStatus ?? 'waiting',
        false,
      ).catch((error) => {
        logQueueFailure('failed to restore checkoff queue after presence left', error, {
          classId,
          studentId: entry.studentId,
        })
      })
    }
  }
  if (room.size === 0) checkoffPresences.delete(classId)
  broadcastCheckoffPresence(classId)
}

/** 从握手信息中提取 JWT（auth → Authorization → query） */
function extractToken(socket: Socket): string | null {
  const { auth, headers, query } = socket.handshake

  const authToken = auth?.token
  if (typeof authToken === 'string' && authToken.length > 0) {
    return authToken
  }

  const authorization = headers.authorization
  if (typeof authorization === 'string' && authorization.startsWith('Bearer ')) {
    const bearer = authorization.slice('Bearer '.length).trim()
    if (bearer.length > 0) {
      return bearer
    }
  }

  const queryToken = query.token
  if (typeof queryToken === 'string' && queryToken.length > 0) {
    return queryToken
  }

  return null
}

/** 读取指定用户的班级 id 列表 */
async function loadClassIds(userId: string): Promise<string[]> {
  const me = await prisma.user.findUnique({
    where: { id: userId },
    select: { classId: true, status: true },
  })
  return me?.status === 'ACTIVE' && me.classId ? [me.classId] : []
}

/** 读取验收广播所需的用户信息（姓名 / 角色 / 头像 / 所属班级） */
async function loadBroadcastContext(
  userId: string,
): Promise<{ name: string; role: string; avatar: number | null; classIds: string[] } | null> {
  const me = await prisma.user.findUnique({
    where: { id: userId },
    select: { name: true, role: true, avatar: true, classId: true, status: true },
  })
  if (!me || me.status !== 'ACTIVE') return null
  return { name: me.name, role: me.role, avatar: me.avatar, classIds: me.classId ? [me.classId] : [] }
}

export type SlaveCardState =
  | { kind: 'idle'; experimentMark: string; experimentTitle: string }
  | { kind: 'ask_name' }
  | { kind: 'ask_demo' }
  | { kind: 'custom_card'; title: string; content: string }
  | {
      kind: 'ask_question'
      studentName: string
      studentAvatar: number | null
      questionAuthor: string
      questionAuthorAvatar: number | null
      index: number
      total: number
      content: string
    }
  | { kind: 'thank'; studentName?: string }

/** master 的展示偏好，随状态一起透传到 slave */
export type CheckoffPerson = {
  name: string
  avatar: number | null
}

export type CheckoffMeta = {
  markdownStyle: 'github' | 'prose'
  theme: 'light' | 'dark'
  grader: CheckoffPerson
  student: CheckoffPerson | null
}

const DEFAULT_META: CheckoffMeta = {
  markdownStyle: 'github',
  theme: 'light',
  grader: { name: '', avatar: null },
  student: null,
}

function readCheckoffPerson(value: unknown): CheckoffPerson | null {
  if (!value || typeof value !== 'object') return null
  const record = value as { name?: unknown; avatar?: unknown }
  if (typeof record.name !== 'string') return null
  return {
    name: record.name,
    avatar: typeof record.avatar === 'number' ? record.avatar : null,
  }
}

type CheckoffSession = {
  token: string
  /** 同一用户下区分多个并发会话的槽位（群面每个 tab 一个） */
  slot: string
  /** TOTP 密钥（base32），配对码每分钟由其推导 */
  secret: string
  /** 配对码刷新周期（秒） */
  period: number
  masterUserId: string
  state: SlaveCardState
  /** master 的展示偏好（Markdown 样式 / 亮暗模式） */
  meta: CheckoffMeta
  createdAt: number
  updatedAt: number
  /** 该会话内存活的 master socket id */
  masters: Set<string>
  /** 该会话内存活的 slave socket id */
  slaves: Set<string>
}

const SESSION_TTL = 1000 * 60 * 60 * 4
/** 无任何连接时保留一段时间，允许群面页面刷新 / 短暂断线后重新 attach */
const EMPTY_SESSION_GRACE = 1000 * 60 * 2
/** 配对码刷新周期：60 秒 */
const CODE_PERIOD = 60
const checkoffSessions = new Map<string, CheckoffSession>()
/** 每个用户每个槽位至多一个会话：`userId:slot` → token */
const userSessions = new Map<string, string>()

function userSessionKey(userId: string, slot: string): string {
  return `${userId}:${slot}`
}

const DEFAULT_SLOT = 'default'
const MAX_SLOT_LENGTH = 128

/** 读取用户指定槽位的存活会话 */
function sessionForUser(userId: string, slot: string): CheckoffSession | undefined {
  const key = userSessionKey(userId, slot)
  const token = userSessions.get(key)
  if (!token) return undefined
  const session = checkoffSessions.get(token)
  if (!session) {
    userSessions.delete(key)
    return undefined
  }
  return session
}

/** 删除会话：踢出房间并通知 slave */
function purgeSession(session: CheckoffSession): void {
  checkoffSessions.delete(session.token)
  const key = userSessionKey(session.masterUserId, session.slot)
  if (userSessions.get(key) === session.token) {
    userSessions.delete(key)
  }
  const room = checkoffRoom(session.token)
  io?.to(room).emit('slave:closed')
  io?.in(room).socketsLeave(room)
}

function gcCheckoffSessions(): void {
  const now = Date.now()
  for (const session of [...checkoffSessions.values()]) {
    const expired = now - session.updatedAt > SESSION_TTL
    const empty = session.masters.size === 0 && session.slaves.size === 0
    const abandoned = empty && now - session.updatedAt > EMPTY_SESSION_GRACE
    if (expired || abandoned) purgeSession(session)
  }
}

/** socket 离开会话：清空标记；若 master 与 slave 均已离场则删除会话 */
function leaveSession(socket: Socket): void {
  const token = socket.data.checkoffToken as string | undefined
  const role = socket.data.role as string | undefined
  socket.data.checkoffToken = undefined
  socket.data.role = undefined
  if (typeof token !== 'string' || !role) return
  void socket.leave(checkoffRoom(token))
  const session = checkoffSessions.get(token)
  if (!session) return
  if (role === 'master') session.masters.delete(socket.id)
  else if (role === 'slave') session.slaves.delete(socket.id)
  session.updatedAt = Date.now()
  // 不立即删除空会话：给群面刷新 / 断线重连留出 attach 窗口，由 gc 按宽限期清理
}

/** 6 位配对码无法反查会话，遍历活跃会话用 TOTP 校验（顺带清理过期会话） */
function findSessionByCode(code: string): CheckoffSession | undefined {
  const now = Date.now()
  for (const session of [...checkoffSessions.values()]) {
    if (now - session.updatedAt > SESSION_TTL) {
      purgeSession(session)
      continue
    }
    if (verifyTotp(session.secret, code, session.period)) return session
  }
  return undefined
}

function checkoffRoom(token: string): string {
  return `checkoff:${token}`
}

/* --------------------------- 报告批改房间 --------------------------- */

/** 报告批改房间名（按实验） */
function reportRoom(experimentId: string): string {
  return `report:${experimentId}`
}

/** 某连接在实验内「正在批改」的在场信息 */
type ReportPresence = { userId: string; name: string; studentId: string | null }

/** experimentId → (socketId → presence) */
const reportPresences = new Map<string, Map<string, ReportPresence>>()

/** 实验房间内的在场列表 */
function reportPeers(experimentId: string): ReportPresence[] {
  return [...(reportPresences.get(experimentId)?.values() ?? [])]
}

/** 向实验房间广播在场列表 */
function broadcastReportPresence(experimentId: string): void {
  io?.to(reportRoom(experimentId)).emit('report:presence', { peers: reportPeers(experimentId) })
}

/** socket 离开报告房间：移除在场并广播（幂等） */
function removeReportPresence(socket: Socket): void {
  const experimentId = socket.data.reportExperimentId as string | undefined
  socket.data.reportExperimentId = undefined
  socket.data.reportStudentId = undefined
  if (!experimentId) return
  const room = reportPresences.get(experimentId)
  if (!room) return
  room.delete(socket.id)
  if (room.size === 0) reportPresences.delete(experimentId)
  broadcastReportPresence(experimentId)
}

/** 向会话房间广播当前状态与 master 透传的展示偏好 */
function emitSlaveState(session: CheckoffSession): void {
  io?.to(checkoffRoom(session.token)).emit('slave:state', {
    state: session.state,
    meta: session.meta,
  })
}

/** 创建并绑定 Socket.IO 实时服务（模块单例） */
export function createRealtime(fastify: FastifyInstance): Server {
  log = fastify.log
  const server = new Server(fastify.server, { cors: { origin: true } })

  /** 订阅某个班级的成绩广播（校验班级归属；切换时先退出其它班级房间） */
  async function subscribeClass(socket: Socket, classId: string): Promise<string[]> {
    const userId = socket.data.user?.sub as string | undefined
    const role = socket.data.user?.role as string | undefined
    if (!userId || !role || !isStaff(role)) return []
    const classIds = await loadClassIds(userId)
    if (!classIds.includes(classId)) return []
    for (const room of [...socket.rooms]) {
      if (room.startsWith('class:')) await socket.leave(room)
    }
    await socket.join(roomName(classId))
    return [classId]
  }

  server.use((socket, next) => {
    const token = extractToken(socket)
    if (token) {
      try {
        socket.data.user = fastify.jwt.verify<{ sub: string; role: string }>(token)
      } catch {
        // ignore invalid token — unauthenticated (slave) connections are allowed
      }
    }
    next()
  })

  server.on('connection', (socket) => {
    socket.on(
      'scores:subscribe',
      async ({ classId } = {} as { classId?: string }, ack?: (res: unknown) => void) => {
        if (typeof classId !== 'string') return ack?.({ classIds: [] })
        try {
          ack?.({ classIds: await subscribeClass(socket, classId) })
        } catch (error) {
          fastify.log.error(error)
          ack?.({ classIds: [] })
        }
      },
    )

    /* -------- 验收排队房间（班级内助教与学生均可加入） -------- */
    socket.on(
      'checkoff-queue:subscribe',
      async ({ classId } = {} as { classId?: string }, ack?: (res: unknown) => void) => {
        const userId = socket.data.user?.sub as string | undefined
        if (!userId || typeof classId !== 'string') {
          return ack?.({ ok: false, error: 'UNAUTHORIZED' })
        }
        try {
          const classIds = await loadClassIds(userId)
          if (!classIds.includes(classId)) return ack?.({ ok: false, error: 'FORBIDDEN' })
          for (const room of [...socket.rooms]) {
            if (room.startsWith('checkoff-queue:')) await socket.leave(room)
          }
          await socket.join(checkoffQueueRoom(classId))
          socket.data.checkoffQueueClassId = classId
          ack?.({ ok: true })
        } catch (error) {
          fastify.log.error(error)
          ack?.({ ok: false, error: 'INTERNAL' })
        }
      },
    )

    socket.on('checkoff-queue:unsubscribe', ({ classId } = {} as { classId?: string }) => {
      if (typeof classId !== 'string') return
      void socket.leave(checkoffQueueRoom(classId))
      if (socket.data.checkoffQueueClassId === classId) {
        socket.data.checkoffQueueClassId = undefined
      }
    })

    /* -------- 报告批改房间（按实验，仅打开批改页的助教加入） -------- */
    socket.on(
      'report:join',
      async ({ experimentId } = {} as { experimentId?: string }, ack?: (res: unknown) => void) => {
        const user = socket.data.user as { sub?: string } | undefined
        if (!user?.sub || typeof experimentId !== 'string') return ack?.({ error: 'UNAUTHORIZED' })
        const experiment = await prisma.experiment.findUnique({
          where: { id: experimentId },
          select: { classId: true },
        })
        if (!experiment) return ack?.({ error: 'EXPERIMENT_NOT_FOUND' })
        const ctx = await loadBroadcastContext(user.sub)
        if (!ctx || !isStaff(ctx.role) || !ctx.classIds.includes(experiment.classId)) {
          return ack?.({ error: 'FORBIDDEN' })
        }
        if (socket.data.reportExperimentId && socket.data.reportExperimentId !== experimentId) {
          removeReportPresence(socket)
        }
        socket.data.reportExperimentId = experimentId
        socket.data.reportStudentId = null
        const room = reportPresences.get(experimentId) ?? new Map<string, ReportPresence>()
        reportPresences.set(experimentId, room)
        room.set(socket.id, { userId: user.sub, name: ctx.name, studentId: null })
        await socket.join(reportRoom(experimentId))
        ack?.({ peers: reportPeers(experimentId) })
        broadcastReportPresence(experimentId)
      },
    )

    socket.on(
      'report:focus',
      ({ experimentId, studentId } = {} as { experimentId?: string; studentId?: string | null }) => {
        if (socket.data.reportExperimentId !== experimentId) return
        const entry = reportPresences.get(experimentId)?.get(socket.id)
        if (!entry) return
        const next = typeof studentId === 'string' && studentId.length > 0 ? studentId : null
        if (entry.studentId === next) return
        entry.studentId = next
        socket.data.reportStudentId = next
        broadcastReportPresence(experimentId)
      },
    )

    socket.on('report:leave', ({ experimentId } = {} as { experimentId?: string }) => {
      if (socket.data.reportExperimentId !== experimentId) return
      void socket.leave(reportRoom(experimentId))
      removeReportPresence(socket)
    })

    /* -------- 验收房间（仅打开验收页的用户加入） -------- */
    socket.on(
      'checkoff:watch',
      async ({ classId } = {} as { classId?: string }, ack?: (res: unknown) => void) => {
        const user = socket.data.user as { sub?: string } | undefined
        if (!user?.sub || typeof classId !== 'string') return
        const ctx = await loadBroadcastContext(user.sub)
        if (!ctx || !isStaff(ctx.role) || !ctx.classIds.includes(classId)) return
        const previousClassId = socket.data.checkoffWatchClassId as string | undefined
        if (previousClassId && previousClassId !== classId) {
          await socket.leave(watchRoom(previousClassId))
          removeCheckoffPresence(socket)
        }
        await socket.join(watchRoom(classId))
        socket.data.checkoffWatchClassId = classId
        const room = checkoffPresences.get(classId) ?? new Map<string, CheckoffPresence>()
        checkoffPresences.set(classId, room)
        const key = presenceKey(socket.id, 'default')
        const previous = room.get(key)
        room.set(key, previous ?? {
          userId: user.sub,
          name: ctx.name,
          avatar: ctx.avatar,
          studentName: null,
          studentId: null,
          presenceId: 'default',
          markedCalled: false,
          restoreStatus: null,
          at: Date.now(),
        })
        ack?.({ peers: checkoffPeers(classId) })
        broadcastCheckoffPresence(classId)
      },
    )

    socket.on('checkoff:unwatch', ({ classId } = {} as { classId?: string }) => {
      if (typeof classId !== 'string' || socket.data.checkoffWatchClassId !== classId) return
      void socket.leave(watchRoom(classId))
      removeCheckoffPresence(socket)
    })

    socket.on(
      'checkoff:notify',
      async (
        { classId, studentId: rawStudentId, studentName, presenceId: requestedPresenceId } = {} as {
          classId?: string
          studentId?: string
          studentName?: string
          presenceId?: string
        },
      ) => {
        const user = socket.data.user as { sub?: string } | undefined
        if (!user?.sub || typeof classId !== 'string') return
        const name = (studentName ?? '').trim()
        const studentId = (rawStudentId ?? '').trim()
        if (!name || !studentId) return
        const ctx = await loadBroadcastContext(user.sub)
        if (!ctx || !isStaff(ctx.role) || !ctx.classIds.includes(classId)) return
        const presenceId =
          typeof requestedPresenceId === 'string' &&
          requestedPresenceId.length > 0 &&
          requestedPresenceId.length <= 128
            ? requestedPresenceId
            : 'default'
        const key = presenceKey(socket.id, presenceId)
        const payload: CheckoffStartedEvent = {
          classId,
          userName: ctx.name,
          studentName: name,
          at: Date.now(),
        }
        socket.to(watchRoom(classId)).emit('checkoff:started', payload)

        const room = checkoffPresences.get(classId) ?? new Map<string, CheckoffPresence>()
        checkoffPresences.set(classId, room)
        const entry: CheckoffPresence = room.get(key) ?? {
          userId: user.sub,
          name: ctx.name,
          avatar: ctx.avatar,
          studentName: null,
          studentId: null,
          presenceId,
          markedCalled: false,
          restoreStatus: null,
          at: Date.now(),
        }
        room.set(key, entry)
        if (entry.studentId && entry.studentId !== studentId) {
          if (
            entry.markedCalled &&
            !otherPresenceActive(classId, entry.studentId, key)
          ) {
            await unmarkQueueActive(
              classId,
              entry.studentId,
              entry.restoreStatus ?? 'waiting',
              false,
            ).catch((error) => {
              logQueueFailure('failed to restore previous checkoff queue entry', error, {
                classId,
                studentId: entry.studentId,
              })
            })
          }
        }
        const result = await markQueueActive(classId, studentId, ctx.name).catch((error) => {
          logQueueFailure('failed to mark checkoff queue active', error, { classId, studentId })
          return {
            marked: false,
            previousStatus: 'waiting' as const,
          }
        })
        const sameStudent = entry.studentId === studentId
        const restoreStatus =
          result.marked &&
          (result.previousStatus === 'waiting' || result.previousStatus === 'notified')
            ? result.previousStatus
            : null
        entry.studentName = name
        entry.studentId = studentId
        entry.restoreStatus = sameStudent
          ? (entry.restoreStatus ?? restoreStatus)
          : restoreStatus
        entry.markedCalled = sameStudent
          ? entry.markedCalled || result.marked
          : result.marked
        entry.at = Date.now()
        broadcastCheckoffPresence(classId)
      },
    )

    socket.on(
      'checkoff:clear',
      async (
        { classId, finished, presenceId: requestedPresenceId } = {} as {
          classId?: string
          finished?: boolean
          presenceId?: string
        },
      ) => {
        if (typeof classId !== 'string') return
        const presenceId =
          typeof requestedPresenceId === 'string' &&
          requestedPresenceId.length > 0 &&
          requestedPresenceId.length <= 128
            ? requestedPresenceId
            : 'default'
        const key = presenceKey(socket.id, presenceId)
        const entry = checkoffPresences.get(classId)?.get(key)
        if (!entry || entry.studentName === null) return
        const studentId = entry.studentId
        const markedCalled = entry.markedCalled
        const restoreStatus = entry.restoreStatus ?? 'waiting'
        entry.studentName = null
        entry.studentId = null
        entry.markedCalled = false
        entry.restoreStatus = null
        entry.at = Date.now()
        if (
          markedCalled &&
          studentId &&
          !otherPresenceActive(classId, studentId, key)
        ) {
          await unmarkQueueActive(
            classId,
            studentId,
            restoreStatus,
            finished === true,
          ).catch((error) => {
            logQueueFailure('failed to clear checkoff queue entry', error, {
              classId,
              studentId,
            })
          })
        }
        broadcastCheckoffPresence(classId)
      },
    )

    /* -------- master -------- */
    socket.on(
      'master:create',
      async (payload: { key?: unknown } | undefined, ack?: (res: unknown) => void) => {
        const user = socket.data.user as { sub?: string } | undefined
        if (!user?.sub) return ack?.({ error: 'UNAUTHORIZED' })
        const ctx = await loadBroadcastContext(user.sub)
        if (!ctx || !isStaff(ctx.role)) return ack?.({ error: 'FORBIDDEN' })
        const requestedKey = payload?.key
        const slot =
          typeof requestedKey === 'string' &&
          requestedKey.length > 0 &&
          requestedKey.length <= MAX_SLOT_LENGTH
            ? requestedKey
            : DEFAULT_SLOT
        gcCheckoffSessions()
        // 该用户该槽位已有存活会话（如 slave 仍在）时直接加入，避免重复建会话
        let session = sessionForUser(user.sub, slot)
        if (!session) {
          session = {
            token: randomUUID(),
            slot,
            secret: randomSecret(),
            period: CODE_PERIOD,
            masterUserId: user.sub,
            state: { kind: 'idle', experimentMark: '', experimentTitle: '' },
            meta: { ...DEFAULT_META },
            createdAt: Date.now(),
            updatedAt: Date.now(),
            masters: new Set(),
            slaves: new Set(),
          }
          checkoffSessions.set(session.token, session)
          userSessions.set(userSessionKey(user.sub, slot), session.token)
        }
        session.masters.add(socket.id)
        session.updatedAt = Date.now()
        socket.data.role = 'master'
        socket.data.checkoffToken = session.token
        await socket.join(checkoffRoom(session.token))
        ack?.({
          token: session.token,
          secret: session.secret,
          period: session.period,
          serverTime: Date.now(),
          state: session.state,
          meta: session.meta,
          slaveConnected: session.slaves.size > 0,
        })
      },
    )

    socket.on(
      'master:attach',
      async ({ token } = {} as { token?: string }, ack?: (res: unknown) => void) => {
        const user = socket.data.user as { sub?: string } | undefined
        const session = typeof token === 'string' ? checkoffSessions.get(token) : undefined
        if (!user?.sub || !session || session.masterUserId !== user.sub)
          return ack?.({ error: 'FORBIDDEN' })
        const ctx = await loadBroadcastContext(user.sub)
        if (!ctx || !isStaff(ctx.role)) return ack?.({ error: 'FORBIDDEN' })
        session.masters.add(socket.id)
        session.updatedAt = Date.now()
        socket.data.role = 'master'
        socket.data.checkoffToken = session.token
        await socket.join(checkoffRoom(session.token))
        ack?.({
          token: session.token,
          secret: session.secret,
          period: session.period,
          serverTime: Date.now(),
          state: session.state,
          meta: session.meta,
          slaveConnected: session.slaves.size > 0,
        })
      },
    )

    socket.on(
      'master:state',
      ({ token, state, meta } = {} as {
        token?: string
        state?: SlaveCardState
        meta?: Partial<CheckoffMeta>
      }) => {
        if (socket.data.role !== 'master' || socket.data.checkoffToken !== token) return
        const session = typeof token === 'string' ? checkoffSessions.get(token) : undefined
        if (!session || !state) return
        if (meta?.markdownStyle === 'github' || meta?.markdownStyle === 'prose') {
          session.meta.markdownStyle = meta.markdownStyle
        }
        if (meta?.theme === 'light' || meta?.theme === 'dark') {
          session.meta.theme = meta.theme
        }
        if (meta && 'grader' in meta) {
          session.meta.grader = readCheckoffPerson(meta.grader) ?? { name: '', avatar: null }
        }
        if (meta && 'student' in meta) {
          session.meta.student = readCheckoffPerson(meta.student)
        }
        session.state = state
        session.updatedAt = Date.now()
        emitSlaveState(session)
      },
    )

    socket.on(
      'switch_question',
      (
        { token, studentName, studentAvatar, questionAuthor, questionAuthorAvatar, index, total, content } = {} as {
          token?: string
          studentName?: string
          studentAvatar?: number | null
          questionAuthor?: string
          questionAuthorAvatar?: number | null
          index?: number
          total?: number
          content?: string
        },
      ) => {
        if (socket.data.role !== 'master' || socket.data.checkoffToken !== token) return
        const session = typeof token === 'string' ? checkoffSessions.get(token) : undefined
        if (!session) return
        session.state = {
          kind: 'ask_question',
          studentName: String(studentName ?? ''),
          studentAvatar: typeof studentAvatar === 'number' ? studentAvatar : null,
          questionAuthor: String(questionAuthor ?? ''),
          questionAuthorAvatar:
            typeof questionAuthorAvatar === 'number' ? questionAuthorAvatar : null,
          index: Number(index) || 0,
          total: Number(total) || 0,
          content: String(content ?? ''),
        }
        session.updatedAt = Date.now()
        emitSlaveState(session)
      },
    )

    socket.on(
      'master:close',
      (
        { token, destroy } = {} as { token?: string; destroy?: boolean },
        ack?: (res: unknown) => void,
      ) => {
        if (typeof token !== 'string') return ack?.({ error: 'INVALID_TOKEN' })
        const session = checkoffSessions.get(token)
        // 显式销毁（关闭群面 tab）：只要是会话拥有者即可，无需占用 master 连接
        if (destroy) {
          const user = socket.data.user as { sub?: string } | undefined
          if (session && user?.sub === session.masterUserId) purgeSession(session)
          return ack?.({ ok: true })
        }
        if (socket.data.role !== 'master' || socket.data.checkoffToken !== token) {
          return ack?.({ error: 'FORBIDDEN' })
        }
        leaveSession(socket)
        ack?.({ ok: true })
      },
    )

    /* -------- slave -------- */
    socket.on(
      'slave:join',
      async (
        { token, code } = {} as { token?: string; code?: string },
        ack?: (res: unknown) => void,
      ) => {
        gcCheckoffSessions()
        const session =
          typeof token === 'string'
            ? checkoffSessions.get(token)
            : typeof code === 'string'
              ? findSessionByCode(code)
              : undefined
        if (!session) return ack?.({ error: 'SESSION_NOT_FOUND' })
        socket.data.role = 'slave'
        socket.data.checkoffToken = session.token
        session.slaves.add(socket.id)
        session.updatedAt = Date.now()
        await socket.join(checkoffRoom(session.token))
        ack?.({ token: session.token, state: session.state, meta: session.meta })
        server.to(checkoffRoom(session.token)).emit('master:slave-joined')
      },
    )

    socket.on('disconnect', () => {
      leaveSession(socket)
      removeReportPresence(socket)
      removeCheckoffPresence(socket)
    })
  })


  io = server
  return server
}

/** 验收排队更新事件 */
export type CheckoffQueueUpdateEvent = {
  classId: string
  sessionId: string
  at: number
}

/** 向指定班级广播验收排队更新 */
export function emitCheckoffQueueUpdate(classId: string, sessionId: string): void {
  io?.to(checkoffQueueRoom(classId)).emit('checkoff-queue:update', {
    classId,
    sessionId,
    at: Date.now(),
  } satisfies CheckoffQueueUpdateEvent)
}

export type CheckoffNotifiedCanceledEvent = {
  classId: string
  sessionId: string
  userId: string
  name: string
  at: number
}

/** 学生自行后挪/退出导致预叫号结束时通知课程 */
export function emitCheckoffNotifiedCanceled(
  classId: string,
  sessionId: string,
  userId: string,
  name: string,
): void {
  io?.to(checkoffQueueRoom(classId)).emit('checkoff-queue:notified-canceled', {
    classId,
    sessionId,
    userId,
    name,
    at: Date.now(),
  } satisfies CheckoffNotifiedCanceledEvent)
}

/** 向指定班级广播成绩变更 */
export function emitScoreChange(classId: string, payload: ScoreChangeEvent): void {
  io?.to(roomName(classId)).emit('score:change', payload)
}

/** 报告成绩保存/删除事件（按实验广播：左侧列表刷新 + 同人「同步」提示） */
export type ReportScoreEvent = {
  userId: string
  /** null 表示删除 */
  score: ScoreDto | null
  byUserId: string
  byName: string
}

/** 向实验房间广播报告成绩事件（「同步」内容由前端按需 GET 拉取） */
export function emitReportScore(
  experimentId: string,
  userId: string,
  score: ScoreDto | null,
  byUserId: string,
  byName: string,
): void {
  io?.to(reportRoom(experimentId)).emit('report:score', {
    userId,
    score,
    byUserId,
    byName,
  } satisfies ReportScoreEvent)
}
