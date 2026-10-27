import { onScopeDispose, ref, toValue, watch, type MaybeRefOrGetter, type Ref } from 'vue'
import { io, type Socket } from 'socket.io-client'

import { getToken, type MarkdownStyleId } from '@/lib/api'

/** slave 卡片状态（master 推送 / slave 只读） */
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

/** master 透传到 slave 的展示偏好（Markdown 样式 / 亮暗模式 / 双方信息） */
export type CheckoffPerson = {
  name: string
  avatar: number | null
}

export type CheckoffMeta = {
  markdownStyle: MarkdownStyleId
  theme: 'light' | 'dark'
  grader: CheckoffPerson
  student: CheckoffPerson | null
}

let socket: Socket | null = null

/** 共享的验收 Socket.IO 连接（master 已登录时携带 JWT；slave 无需登录） */
export function getCheckoffSocket(): Socket {
  if (!socket) {
    const token = getToken()
    socket = io({ auth: token ? { token } : {}, transports: ['websocket', 'polling'] })
  }
  return socket
}

/** 订阅验收 Socket 的底层连接状态（socket.io connected / disconnected），与是否已加入会话无关。 */
export function useCheckoffConnection(): Ref<boolean> {
  const online = ref(false)
  const s = getCheckoffSocket()
  const onConnect = () => {
    online.value = true
  }
  const onDisconnect = () => {
    online.value = false
  }

  s.on('connect', onConnect)
  s.on('disconnect', onDisconnect)
  online.value = s.connected

  onScopeDispose(() => {
    s.off('connect', onConnect)
    s.off('disconnect', onDisconnect)
  }, true)

  return online
}

/* ------------------------------ master ------------------------------ */

export type MasterSession = {
  token: string | null
  /** TOTP 密钥（base32），用于本地推导每分钟刷新的配对码 */
  secret: string | null
  /** 配对码刷新周期（秒） */
  period: number
  /** 创建会话时的服务端时间，用于校准时钟偏移 */
  serverTime: number | null
  slaveConnected: boolean
  ready: boolean
}

function emptyMasterSession(): MasterSession {
  return {
    token: null,
    secret: null,
    period: 60,
    serverTime: null,
    slaveConnected: false,
    ready: false,
  }
}

/**
 * master 端：进入多设备模式时创建会话，返回 TOTP 密钥与 token，
 * 并提供 pushState / switchQuestion 向 slave 广播状态。
 */
export function useCheckoffMaster(
  enabled: MaybeRefOrGetter<boolean>,
  masterUserId: MaybeRefOrGetter<string | undefined>,
) {
  const session = ref<MasterSession>(emptyMasterSession())
  let token: string | null = null

  watch(
    () => [toValue(enabled), toValue(masterUserId)] as const,
    ([isEnabled, userId]) => {
      if (!isEnabled || !userId) return
      const s = getCheckoffSocket()

      const onSlaveJoined = () => {
        session.value = { ...session.value, slaveConnected: true }
      }
      s.on('master:slave-joined', onSlaveJoined)

      s.emit(
        'master:create',
        { masterUserId: userId },
        (res: {
          token?: string
          secret?: string
          period?: number
          serverTime?: number
          slaveConnected?: boolean
          error?: string
        }) => {
          if (!res?.token) return
          token = res.token
          session.value = {
            token: res.token,
            secret: res.secret ?? null,
            period: res.period ?? 60,
            serverTime: res.serverTime ?? null,
            slaveConnected: res.slaveConnected ?? false,
            ready: true,
          }
        },
      )

      return () => {
        s.off('master:slave-joined', onSlaveJoined)
        const current = token
        token = null
        if (current) s.emit('master:close', { token: current })
        session.value = emptyMasterSession()
      }
    },
    { immediate: true },
  )

  function pushState(state: SlaveCardState, meta?: CheckoffMeta) {
    const current = token
    if (current) getCheckoffSocket().emit('master:state', { token: current, state, meta })
  }

  function switchQuestion(payload: {
    studentName: string
    studentAvatar: number | null
    questionAuthor: string
    questionAuthorAvatar: number | null
    index: number
    total: number
    content: string
  }) {
    const current = token
    if (current) getCheckoffSocket().emit('switch_question', { token: current, ...payload })
  }

  return { session, pushState, switchQuestion }
}

/* ---------------------------- watch room ----------------------------- */

/** 他人开始验收的广播事件 */
export type CheckoffStartedEvent = {
  classId: string
  userName: string
  studentName: string
  at: number
}

/** 验收在场信息（打开验收页的人） */
export type CheckoffPeer = {
  userId: string
  name: string
  avatar: number | null
  /** 当前正在验收的学生姓名；null 表示空闲 */
  studentName: string | null
  at: number
}

/**
 * 验收页房间：加入当前班级的验收房间，接收其他助教进入「展示 demo」时的广播，
 * 并维护本班在场列表（在线 + 各自正在验收的学生）。回调经 ref 调用，effect 仅依赖 classId。
 */
export function useCheckoffWatch(
  classId: MaybeRefOrGetter<string | undefined>,
  onStarted: (event: CheckoffStartedEvent) => void,
): Ref<CheckoffPeer[]> {
  const peers = ref<CheckoffPeer[]>([])

  watch(
    () => toValue(classId),
    (id) => {
      if (!id) return
      const s = getCheckoffSocket()

      const join = () =>
        s.emit('checkoff:watch', { classId: id }, (res?: { peers?: CheckoffPeer[] }) => {
          if (res?.peers) peers.value = res.peers
        })
      const onEvent = (payload: CheckoffStartedEvent) => onStarted(payload)
      const onPresence = (payload: { classId?: string; peers?: CheckoffPeer[] }) => {
        if (payload?.classId === id) peers.value = payload.peers ?? []
      }

      s.on('checkoff:started', onEvent)
      s.on('checkoff:presence', onPresence)
      s.on('connect', join)
      if (s.connected) join()

      return () => {
        s.off('checkoff:started', onEvent)
        s.off('checkoff:presence', onPresence)
        s.off('connect', join)
        s.emit('checkoff:unwatch', { classId: id })
        peers.value = []
      }
    },
    { immediate: true },
  )

  return peers
}

/** 通知当前班级的验收房间：本助教开始验收某学生 */
export function notifyCheckoffStarted(payload: { classId: string; studentName: string }): void {
  getCheckoffSocket().emit('checkoff:notify', payload)
}

/** 通知当前班级的验收房间：本助教不再验收（保存成绩 / 返回上一步后清空在场） */
export function clearCheckoffPresence(classId: string): void {
  getCheckoffSocket().emit('checkoff:clear', { classId })
}

/* ------------------------------- slave ------------------------------- */
/** slave 端：按 token 或 6 位 pin 加入；断线重连时自动重新 join 获取当前 state。 */
export function useCheckoffSlave(join: MaybeRefOrGetter<{ token?: string; code?: string }>) {
  const state = ref<SlaveCardState | null>(null)
  const meta = ref<CheckoffMeta | null>(null)
  const connected = ref(false)
  const closed = ref(false)
  const error = ref<string | null>(null)
  const sessionToken = ref<string | null>(null)

  watch(
    () => {
      const value = toValue(join)
      return value.token ?? value.code ?? null
    },
    () => {
      const value = toValue(join)
      if (!value.token && !value.code) return
      const s = getCheckoffSocket()
      let cancelled = false

      const onState = (payload: { state: SlaveCardState; meta?: CheckoffMeta }) => {
        if (cancelled || !payload?.state) return
        state.value = payload.state
        if (payload.meta) meta.value = payload.meta
      }
      const onClosed = () => {
        if (!cancelled) closed.value = true
      }
      const joinNow = () => {
        s.emit(
          'slave:join',
          value.token ? { token: value.token } : { code: value.code },
          (res: { token?: string; state?: SlaveCardState; meta?: CheckoffMeta; error?: string }) => {
            if (cancelled) return
            connected.value = true
            error.value = res?.error ?? null
            if (res?.token) sessionToken.value = res.token
            if (res?.state) state.value = res.state
            if (res?.meta) meta.value = res.meta
          },
        )
      }

      s.on('slave:state', onState)
      s.on('slave:closed', onClosed)
      if (s.connected) joinNow()
      s.on('connect', joinNow)

      return () => {
        cancelled = true
        s.off('slave:state', onState)
        s.off('slave:closed', onClosed)
        s.off('connect', joinNow)
      }
    },
    { immediate: true },
  )

  return { state, meta, connected, closed, error, sessionToken }
}
