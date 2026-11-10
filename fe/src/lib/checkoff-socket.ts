import { useCallback, useEffect, useRef, useState } from 'react'
import { io, type Socket } from 'socket.io-client'

import {
  fetchCheckoffQueue,
  getToken,
  type CheckoffQueueEntry,
  type MarkdownStyleId,
} from '@/lib/api'

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
    (payload: {
      studentName: string
      studentAvatar: number | null
      questionAuthor: string
      questionAuthorAvatar: number | null
      index: number
      total: number
      content: string
    }) => {
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

/**
 * 通知当前班级的验收房间：本助教开始验收某学生。
 * `studentId` / `experimentId` 用于后端把该学生（该实验）的排队记录精确置为「验收中」；
 * 同一学生可能同时排了多个实验，因此需要实验 id 才能定位到唯一记录。两者均可选，兼容旧版后端。
 */
export function notifyCheckoffStarted(payload: {
  classId: string
  studentName: string
  /** 学生 userId：精确匹配排队记录（可选，旧版后端按姓名唯一匹配） */
  studentId?: string
  /** 实验 id：同一学生排了多个实验时用于消歧（可选，旧版后端忽略） */
  experimentId?: string
}): void {
  getCheckoffSocket().emit('checkoff:notify', payload)
}

/**
 * 通知当前班级的验收房间：本助教不再验收（保存成绩 / 返回上一步后清空在场）。
 * `studentId` 可选：传则只把该学生的排队记录恢复为「已叫号 / 排队中」，
 * 不传则恢复本助教在本班全部「验收中」的记录（兼容旧版）。
 */
export function clearCheckoffPresence(classId: string, studentId?: string): void {
  getCheckoffSocket().emit('checkoff:clear', { classId, studentId })
}

/* ------------------------------- queue ------------------------------- */

/**
 * 订阅当前班级的排队快照：首次/断线重连时通过 REST 拉取，
 * 之后由 `checkoff:queue` 事件实时替换；返回 entries/loading/reload。
 * 前提：同一页面已调用 useCheckoffWatch 加入验收房间（Checkoff 页面始终满足）。
 */
export function useCheckoffQueue(classId: string | undefined): {
  entries: CheckoffQueueEntry[]
  loading: boolean
  reload: () => void
} {
  const [entries, setEntries] = useState<CheckoffQueueEntry[]>([])
  const [loading, setLoading] = useState(false)
  // 手动刷新复用订阅 effect 里的拉取函数：不重建 socket 订阅，也不清空已有快照（避免闪烁）
  const loadRef = useRef<(() => void) | null>(null)

  const reload = useCallback(() => loadRef.current?.(), [])

  useEffect(() => {
    if (!classId) {
      loadRef.current = null
      setEntries([])
      setLoading(false)
      return
    }

    const s = getCheckoffSocket()
    let cancelled = false

    const load = () => {
      setLoading(true)
      fetchCheckoffQueue(classId)
        .then((res) => {
          if (!cancelled) setEntries(res.entries)
        })
        .catch(() => {
          // 排队信息是辅助数据，加载失败不打断现场验收流程
          if (!cancelled) setEntries([])
        })
        .finally(() => {
          if (!cancelled) setLoading(false)
        })
    }

    // 只接受当前班级的广播：切换班级后旧房间的残留事件直接忽略
    const onQueue = (payload: { classId?: string; entries?: CheckoffQueueEntry[] }) => {
      if (cancelled || payload?.classId !== classId) return
      setEntries(payload.entries ?? [])
      setLoading(false)
    }
    // 断线重连期间可能错过广播，重连后重新拉一次完整快照
    const onConnect = () => load()

    setEntries([])
    loadRef.current = load
    s.on('checkoff:queue', onQueue)
    s.on('connect', onConnect)
    load()

    return () => {
      cancelled = true
      loadRef.current = null
      s.off('checkoff:queue', onQueue)
      s.off('connect', onConnect)
    }
  }, [classId])

  return { entries, loading, reload }
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
