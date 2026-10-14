import { useCallback, useEffect, useRef, useState } from 'react'
import { io, type Socket } from 'socket.io-client'

import { getToken, type MarkdownStyleId } from '@/lib/api'

/** slave 卡片状态（master 推送 / slave 只读） */
export type SlaveCardState =
  | { kind: 'idle'; experimentMark: string; experimentTitle: string }
  | { kind: 'ask_name' }
  | { kind: 'ask_demo' }
  | { kind: 'ask_question'; studentName: string; index: number; total: number; content: string }
  | { kind: 'thank'; studentName?: string }

/** master 透传到 slave 的展示偏好（Markdown 样式 / 亮暗模式） */
export type CheckoffMeta = {
  markdownStyle: MarkdownStyleId
  theme: 'light' | 'dark'
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
export function useCheckoffConnection(): boolean {
  const [online, setOnline] = useState(() => getCheckoffSocket().connected)

  useEffect(() => {
    const s = getCheckoffSocket()
    const onConnect = () => setOnline(true)
    const onDisconnect = () => setOnline(false)
    s.on('connect', onConnect)
    s.on('disconnect', onDisconnect)
    setOnline(s.connected)
    return () => {
      s.off('connect', onConnect)
      s.off('disconnect', onDisconnect)
    }
  }, [])

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

/**
 * master 端：进入多设备模式时创建会话，返回 TOTP 密钥与 token，
 * 并提供 pushState / switchQuestion 向 slave 广播状态。
 */
export function useCheckoffMaster(enabled: boolean, masterUserId: string | undefined) {
  const [session, setSession] = useState<MasterSession>({
    token: null,
    secret: null,
    period: 60,
    serverTime: null,
    slaveConnected: false,
    ready: false,
  })
  const tokenRef = useRef<string | null>(null)

  useEffect(() => {
    if (!enabled || !masterUserId) return
    const s = getCheckoffSocket()

    const onSlaveJoined = () => setSession((prev) => ({ ...prev, slaveConnected: true }))
    s.on('master:slave-joined', onSlaveJoined)

    s.emit(
      'master:create',
      { masterUserId },
      (res: {
        token?: string
        secret?: string
        period?: number
        serverTime?: number
        slaveConnected?: boolean
        error?: string
      }) => {
        if (!res?.token) return
        tokenRef.current = res.token
        setSession({
          token: res.token,
          secret: res.secret ?? null,
          period: res.period ?? 60,
          serverTime: res.serverTime ?? null,
          slaveConnected: res.slaveConnected ?? false,
          ready: true,
        })
      },
    )

    return () => {
      s.off('master:slave-joined', onSlaveJoined)
      const token = tokenRef.current
      tokenRef.current = null
      if (token) s.emit('master:close', { token })
      setSession({
        token: null,
        secret: null,
        period: 60,
        serverTime: null,
        slaveConnected: false,
        ready: false,
      })
    }
  }, [enabled, masterUserId])

  const pushState = useCallback((state: SlaveCardState, meta?: CheckoffMeta) => {
    const token = tokenRef.current
    if (token) getCheckoffSocket().emit('master:state', { token, state, meta })
  }, [])

  const switchQuestion = useCallback(
    (payload: { studentName: string; index: number; total: number; content: string }) => {
      const token = tokenRef.current
      if (token) getCheckoffSocket().emit('switch_question', { token, ...payload })
    },
    [],
  )

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
  /** 当前正在验收的学生姓名；null 表示空闲 */
  studentName: string | null
  at: number
}

/**
 * 验收页房间：加入当前班级的验收房间，接收其他助教进入「展示 demo」时的广播，
 * 并维护本班在场列表（在线 + 各自正在验收的学生）。回调经 ref 调用，effect 仅依赖 classId。
 */
export function useCheckoffWatch(
  classId: string | undefined,
  onStarted: (event: CheckoffStartedEvent) => void,
): CheckoffPeer[] {
  const handlerRef = useRef(onStarted)
  const [peers, setPeers] = useState<CheckoffPeer[]>([])

  useEffect(() => {
    handlerRef.current = onStarted
  }, [onStarted])

  useEffect(() => {
    if (!classId) return
    const s = getCheckoffSocket()

    const join = () =>
      s.emit(
        'checkoff:watch',
        { classId },
        (res?: { peers?: CheckoffPeer[] }) => {
          if (res?.peers) setPeers(res.peers)
        },
      )
    const onEvent = (payload: CheckoffStartedEvent) => handlerRef.current(payload)
    const onPresence = (payload: { classId?: string; peers?: CheckoffPeer[] }) => {
      if (payload?.classId === classId) setPeers(payload.peers ?? [])
    }

    s.on('checkoff:started', onEvent)
    s.on('checkoff:presence', onPresence)
    s.on('connect', join)
    if (s.connected) join()

    return () => {
      s.off('checkoff:started', onEvent)
      s.off('checkoff:presence', onPresence)
      s.off('connect', join)
      s.emit('checkoff:unwatch', { classId })
      setPeers([])
    }
  }, [classId])

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
export function useCheckoffSlave(join: { token?: string; code?: string }) {
  const [state, setState] = useState<SlaveCardState | null>(null)
  const [meta, setMeta] = useState<CheckoffMeta | null>(null)
  const [connected, setConnected] = useState(false)
  const [closed, setClosed] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sessionToken, setSessionToken] = useState<string | null>(null)

  const joinKey = join.token ?? join.code ?? null

  useEffect(() => {
    if (!joinKey) return
    const s = getCheckoffSocket()
    let cancelled = false

    const onState = (payload: { state: SlaveCardState; meta?: CheckoffMeta }) => {
      if (cancelled || !payload?.state) return
      setState(payload.state)
      if (payload.meta) setMeta(payload.meta)
    }
    const onClosed = () => {
      if (!cancelled) setClosed(true)
    }
    const joinNow = () => {
      s.emit(
        'slave:join',
        join.token ? { token: join.token } : { code: join.code },
        (res: { token?: string; state?: SlaveCardState; meta?: CheckoffMeta; error?: string }) => {
          if (cancelled) return
          setConnected(true)
          setError(res?.error ?? null)
          if (res?.token) setSessionToken(res.token)
          if (res?.state) setState(res.state)
          if (res?.meta) setMeta(res.meta)
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
  }, [joinKey, join.token, join.code])

  return { state, meta, connected, closed, error, sessionToken }
}
