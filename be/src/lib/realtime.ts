import { randomUUID } from 'node:crypto'

import type { FastifyInstance } from 'fastify'
import { Server, type Socket } from 'socket.io'

import { prisma } from './prisma'
import { isStaff } from './roles'
import type { ScoreDto } from './score'
import { randomSecret, verifyTotp } from './totp'

/** 成绩变更事件（按班级广播） */
export type ScoreChangeEvent =
  | {
      action: 'upsert'
      classId: string
      score: ScoreDto
    }
  | { action: 'delete'; classId: string; stuId: string; type: number; indId: string }

/** 验收开始事件（按班级验收房间广播，仅打开验收页的用户收到） */
export type CheckoffStartedEvent = {
  classId: string
  userName: string
  studentName: string
  at: number
}

let io: Server | null = null

/** 班级房间名 */
export function roomName(classId: string): string {
  return `class:${classId}`
}

/** 验收房间名（仅当前打开验收页的用户加入） */
function watchRoom(classId: string): string {
  return `checkoff-watch:${classId}`
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
    include: { classes: true },
  })
  return (me?.classes ?? []).map((c) => c.id)
}

/** 读取验收广播所需的用户信息（姓名 / 角色 / 所属班级） */
async function loadBroadcastContext(
  userId: string,
): Promise<{ name: string; role: string; classIds: string[] } | null> {
  const me = await prisma.user.findUnique({
    where: { id: userId },
    select: { name: true, role: true, classes: { select: { id: true } } },
  })
  if (!me) return null
  return { name: me.name, role: me.role, classIds: me.classes.map((c) => c.id) }
}

export type SlaveCardState =
  | { kind: 'idle'; experimentMark: string; experimentTitle: string }
  | { kind: 'ask_name' }
  | { kind: 'ask_demo' }
  | { kind: 'ask_question'; studentName: string; index: number; total: number; content: string }
  | { kind: 'thank'; studentName?: string }

/** master 的展示偏好，随状态一起透传到 slave */
export type CheckoffMeta = {
  markdownStyle: 'github' | 'prose'
  theme: 'light' | 'dark'
}

const DEFAULT_META: CheckoffMeta = { markdownStyle: 'github', theme: 'light' }

type CheckoffSession = {
  token: string
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
/** 配对码刷新周期：60 秒 */
const CODE_PERIOD = 60
const checkoffSessions = new Map<string, CheckoffSession>()
/** 每个用户至多一个会话：userId → token */
const userSessions = new Map<string, string>()

/** 删除会话：踢出房间并通知 slave */
function purgeSession(session: CheckoffSession): void {
  checkoffSessions.delete(session.token)
  if (userSessions.get(session.masterUserId) === session.token) {
    userSessions.delete(session.masterUserId)
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
    if (expired || empty) purgeSession(session)
  }
}

/** 读取用户当前存活的会话 */
function sessionForUser(userId: string): CheckoffSession | undefined {
  const token = userSessions.get(userId)
  if (!token) return undefined
  const session = checkoffSessions.get(token)
  if (!session) {
    userSessions.delete(userId)
    return undefined
  }
  return session
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
  if (session.masters.size === 0 && session.slaves.size === 0) purgeSession(session)
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
type ReportPresence = { userId: string; name: string; stuId: string | null }

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
  socket.data.reportStuId = undefined
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
  const server = new Server(fastify.server, { cors: { origin: true } })

  /** 订阅某个班级的成绩广播（校验班级归属；切换时先退出其它班级房间） */
  async function subscribeClass(socket: Socket, classId: string): Promise<string[]> {
    const userId = socket.data.user?.sub as string | undefined
    if (!userId) return []
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
        socket.data.reportStuId = null
        const room = reportPresences.get(experimentId) ?? new Map<string, ReportPresence>()
        reportPresences.set(experimentId, room)
        room.set(socket.id, { userId: user.sub, name: ctx.name, stuId: null })
        await socket.join(reportRoom(experimentId))
        ack?.({ peers: reportPeers(experimentId) })
        broadcastReportPresence(experimentId)
      },
    )

    socket.on(
      'report:focus',
      ({ experimentId, stuId } = {} as { experimentId?: string; stuId?: string | null }) => {
        if (socket.data.reportExperimentId !== experimentId) return
        const entry = reportPresences.get(experimentId)?.get(socket.id)
        if (!entry) return
        const next = typeof stuId === 'string' && stuId.length > 0 ? stuId : null
        if (entry.stuId === next) return
        entry.stuId = next
        socket.data.reportStuId = next
        broadcastReportPresence(experimentId)
      },
    )

    socket.on('report:leave', ({ experimentId } = {} as { experimentId?: string }) => {
      if (socket.data.reportExperimentId !== experimentId) return
      void socket.leave(reportRoom(experimentId))
      removeReportPresence(socket)
    })

    /* -------- 验收房间（仅打开验收页的用户加入） -------- */
    socket.on('checkoff:watch', async ({ classId } = {} as { classId?: string }) => {
      const user = socket.data.user as { sub?: string } | undefined
      if (!user?.sub || typeof classId !== 'string') return
      const ctx = await loadBroadcastContext(user.sub)
      if (!ctx || !isStaff(ctx.role) || !ctx.classIds.includes(classId)) return
      await socket.join(watchRoom(classId))
    })

    socket.on('checkoff:unwatch', ({ classId } = {} as { classId?: string }) => {
      if (typeof classId !== 'string') return
      void socket.leave(watchRoom(classId))
    })

    socket.on(
      'checkoff:notify',
      async ({ classId, studentName } = {} as { classId?: string; studentName?: string }) => {
        const user = socket.data.user as { sub?: string } | undefined
        if (!user?.sub || typeof classId !== 'string') return
        const name = (studentName ?? '').trim()
        if (!name) return
        const ctx = await loadBroadcastContext(user.sub)
        if (!ctx || !isStaff(ctx.role) || !ctx.classIds.includes(classId)) return
        const payload: CheckoffStartedEvent = {
          classId,
          userName: ctx.name,
          studentName: name,
          at: Date.now(),
        }
        socket.to(watchRoom(classId)).emit('checkoff:started', payload)
      },
    )

    /* -------- master -------- */
    socket.on('master:create', async (_payload: unknown, ack?: (res: unknown) => void) => {
      const user = socket.data.user as { sub?: string } | undefined
      if (!user?.sub) return ack?.({ error: 'UNAUTHORIZED' })
      gcCheckoffSessions()
      // 该用户已有存活会话（如 slave 仍在）时直接加入，避免重复建会话
      let session = sessionForUser(user.sub)
      if (!session) {
        session = {
          token: randomUUID(),
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
        userSessions.set(user.sub, session.token)
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
    })

    socket.on(
      'master:attach',
      async ({ token } = {} as { token?: string }, ack?: (res: unknown) => void) => {
        const user = socket.data.user as { sub?: string } | undefined
        const session = typeof token === 'string' ? checkoffSessions.get(token) : undefined
        if (!user?.sub || !session || session.masterUserId !== user.sub)
          return ack?.({ error: 'FORBIDDEN' })
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
        session.state = state
        session.updatedAt = Date.now()
        emitSlaveState(session)
      },
    )

    socket.on(
      'switch_question',
      (
        { token, studentName, index, total, content } = {} as {
          token?: string
          studentName?: string
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
          index: Number(index) || 0,
          total: Number(total) || 0,
          content: String(content ?? ''),
        }
        session.updatedAt = Date.now()
        emitSlaveState(session)
      },
    )

    socket.on('master:close', ({ token } = {} as { token?: string }) => {
      if (socket.data.role !== 'master' || socket.data.checkoffToken !== token) return
      if (typeof token !== 'string') return
      leaveSession(socket)
    })

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
    })
  })


  io = server
  return server
}

/** 向指定班级广播成绩变更 */
export function emitScoreChange(classId: string, payload: ScoreChangeEvent): void {
  io?.to(roomName(classId)).emit('score:change', payload)
}

/** 报告成绩保存/删除事件（按实验广播：左侧列表刷新 + 同人「同步」提示） */
export type ReportScoreEvent = {
  stuId: string
  /** null 表示删除 */
  score: ScoreDto | null
  byUserId: string
  byName: string
}

/** 向实验房间广播报告成绩事件（「同步」内容由前端按需 GET 拉取） */
export function emitReportScore(
  experimentId: string,
  stuId: string,
  score: ScoreDto | null,
  byUserId: string,
  byName: string,
): void {
  io?.to(reportRoom(experimentId)).emit('report:score', {
    stuId,
    score,
    byUserId,
    byName,
  } satisfies ReportScoreEvent)
}
