/**
 * checkoff-socket —— 移植自 `fe/src/lib/checkoff-socket.ts`（214 行）
 *
 * 验收（checkoff）场景的共享 Socket.IO 单例 + 三套状态机（master / watch 房间 / slave）。
 * 导出名、类型名、函数名、socket 事件名（`master:create` / `master:state` / `checkoff:watch`
 * / `checkoff:started` / `checkoff:notify` / `checkoff:unwatch` / `slave:join` / `slave:state` /
 * `slave:closed` / `master:slave-joined` / `master:close` / `switch_question` / `connect`）
 * **一律不改**，页面（Phase C 的 `console/checkoff.vue` 及其子组件）按这些名字调用。
 *
 * ────────────────────────────────────────────────────────────────────────
 * 旧 useEffect → 新机制 对照表
 * ────────────────────────────────────────────────────────────────────────
 * | 旧版位置                            | 作用                                                            | 新机制                                                                |
 * | ----------------------------------- | --------------------------------------------------------------- | --------------------------------------------------------------------- |
 * | L53-98 `useCheckoffMaster`          | 依赖 `[enabled, masterUserId]`：建连、监听 `master:slave-joined`、`emit('master:create')`；cleanup 里 `off` + `emit('master:close')` + 重置 session | `watch([enabled, masterUserId], …, { immediate: true })`；清理走 `onWatcherCleanup`，`onScopeDispose` 兜底 |
 * | L136-138 `useCheckoffWatch`         | 依赖 `[onStarted]`：把回调写进 `handlerRef`，让另一个 effect 只依赖 `classId` | `watch(() => onStarted, …, { immediate: true })` 写入 `shallowRef`      |
 * | L140-156 `useCheckoffWatch`         | 依赖 `[classId]`：`emit('checkoff:watch')` 加入房间、监听 `checkoff:started` 与 `connect`；cleanup 里 `off` + `emit('checkoff:unwatch')` | `watch(() => classId, …, { immediate: true })`；清理走 `onWatcherCleanup` + `onScopeDispose` |
 * | L175-211 `useCheckoffSlave`         | 依赖 `[joinKey, join.token, join.code]`：监听 `slave:state` / `slave:closed` / `connect`，ack 里写 5 个 state | `watch([joinKey, join.token, join.code], …, { immediate: true })`；清理走 `onWatcherCleanup` + `onScopeDispose` |
 *
 * 说明：`immediate: true` 对应「组件挂载就跑」的 effect；Vue 的 `watch` 在依赖变化时
 * **先跑上一次的 `onWatcherCleanup` 再跑本次回调**，与 React「cleanup + 重新执行」顺序一致。
 *
 * ────────────────────────────────────────────────────────────────────────
 * 清理点清单
 * ────────────────────────────────────────────────────────────────────────
 * - 定时器：**本文件没有任何定时器**（0 处 `setInterval` / `setTimeout`），无需 `clearInterval`。
 * - socket 监听：共 6 个 `on()`，每个都有配对的 `off()`，全部收在各自那一轮的 `teardown` 闭包里：
 *   master 1 个（`master:slave-joined`）、watch 2 个（`checkoff:started`、`connect`）、
 *   slave 3 个（`slave:state`、`slave:closed`、`connect`）。
 * - 订阅（服务端房间）：`checkoff:unwatch`（watch teardown）、`master:close`（master teardown），
 *   在同两个清理点 emit。
 * - `onWatcherCleanup`（依赖变化 / watcher 停止）与 `onScopeDispose`（组件作用域销毁）调的是
 *   **同一个幂等 teardown**：谁先跑谁把 `teardown` 置 `null`，另一处直接 no-op，不会重复 `off`。
 * - 卸载后不再写状态：三个 composable 各自维护 `cancelled` 标志位（沿用旧版 slave 的写法），
 *   teardown 里置 `true`；事件回调、ack 回调都先判 `cancelled` 再写 ref。
 * - 单例连接本身**不在此文件断开**（与旧版一致：`getCheckoffSocket()` 只建不关，页面共用）。
 *
 * ────────────────────────────────────────────────────────────────────────
 * 与旧版的其它差异（有意为之，便于页面迁移）
 * ────────────────────────────────────────────────────────────────────────
 * 1) 入参放宽为 `MaybeRefOrGetter`：React 版靠组件重渲染拿到新的 prop，Vue 的 `setup` 只执行一次，
 *    所以 `enabled` / `masterUserId` / `classId` / `onStarted` / `join` 都可能是 getter 或 ref。
 *    传普通值也能用（行为等同旧版只跑一次），传 getter 才是等价于「prop 变化重跑 effect」。
 * 2) 三个 `useXxx()` 仍叫 `useXxx`（按契约不改名），返回的 ref 在 `<script setup>` 模板里
 *    自动解包，在 script 段需要 `.value`。
 * 3) master 的 `master:create` ack 增加了 `cancelled` 判断（旧版没有）：旧版若在 cleanup 之后才
 *    收到 ack，会把 token 写回 `tokenRef` 且再也不会发 `master:close`（泄漏一个后端会话）。
 *    这是纯粹的行为修正，不影响正常时序。
 * 4) `useCheckoffSlave` 的 `join` 允许传 `null`/`undefined`（页面拿到配对码之前的状态）。
 * 5) 旧版 `useCallback(fn, [])` → 这里的普通闭包函数：`setup` 只执行一次，引用天然稳定。
 * 6) 依赖：`socket.io-client` 已在 `fe-v2/package.json`（与 `fe` 同一版本）；`@/lib/api` → `~/lib/api`。
 *    本项目 `ssr: false`，三个 composable 只会在客户端 setup 期执行。
 */
import type { MaybeRefOrGetter } from 'vue'
import { onScopeDispose, onWatcherCleanup, ref, shallowRef, toValue, watch } from 'vue'
import { io, type Socket } from 'socket.io-client'

import { getToken } from '~/lib/api'

/** slave 卡片状态（master 推送 / slave 只读） */
export type SlaveCardState =
  | { kind: 'idle'; experimentMark: string; experimentTitle: string }
  | { kind: 'ask_name' }
  | { kind: 'ask_demo' }
  | { kind: 'ask_question'; studentName: string; index: number; total: number; content: string }
  | { kind: 'thank'; studentName?: string }

let socket: Socket | null = null

/** 共享的验收 Socket.IO 连接（master 已登录时携带 JWT；slave 无需登录） */
export function getCheckoffSocket(): Socket {
  if (!socket) {
    socket = io({ auth: { token: getToken() ?? '' }, transports: ['websocket', 'polling'] })
  }
  return socket
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

/** master:create 的 ack 结构（与旧版内联类型逐字一致） */
type MasterCreateRes = {
  token?: string
  secret?: string
  period?: number
  serverTime?: number
  slaveConnected?: boolean
  error?: string
}

/** session 的初始值（useState / ref 共用同一份字面量） */
function createEmptySession(): MasterSession {
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
 * 返回 `{ session, pushState, switchQuestion }`（`session` 是 `Ref<MasterSession>`）。
 */
export function useCheckoffMaster(
  enabled: MaybeRefOrGetter<boolean>,
  masterUserId: MaybeRefOrGetter<string | undefined>,
) {
  const session = ref<MasterSession>(createEmptySession())
  /** 对应旧版 `tokenRef = useRef<string | null>(null)`：只当可变盒子，不参与渲染 */
  const tokenRef = shallowRef<string | null>(null)
  /** 当前这一轮 watch 的清理函数，null 表示没有在跑 */
  let teardown: (() => void) | null = null
  /** 组件销毁 / 依赖变化后丢弃在路上的事件与 ack（照抄旧版 slave 的写法） */
  let cancelled = false

  // 旧版 L53-98 useEffect，依赖 [enabled, masterUserId]
  watch(
    [() => toValue(enabled), () => toValue(masterUserId)],
    ([enabledValue, userId]) => {
      if (!enabledValue || !userId) return
      const s = getCheckoffSocket()
      cancelled = false

      const onSlaveJoined = () => {
        if (cancelled) return
        session.value = { ...session.value, slaveConnected: true }
      }
      s.on('master:slave-joined', onSlaveJoined)

      s.emit('master:create', { masterUserId: userId }, (res: MasterCreateRes) => {
        // 旧版没有这层判断：cleanup 之后才到的 ack 会把 token 写回且再也不会 master:close
        if (cancelled) return
        if (!res?.token) return
        tokenRef.value = res.token
        session.value = {
          token: res.token,
          secret: res.secret ?? null,
          period: res.period ?? 60,
          serverTime: res.serverTime ?? null,
          slaveConnected: res.slaveConnected ?? false,
          ready: true,
        }
      })

      teardown = () => {
        cancelled = true
        s.off('master:slave-joined', onSlaveJoined)
        const token = tokenRef.value
        tokenRef.value = null
        if (token) s.emit('master:close', { token })
        // 旧版 cleanup 同样重置 session：依赖变化（退出多设备模式）时这是必需的
        session.value = createEmptySession()
      }
      onWatcherCleanup(() => {
        teardown?.()
        teardown = null
      })
    },
    { immediate: true },
  )

  // 组件销毁兜底：与 onWatcherCleanup 复用同一个幂等 teardown
  onScopeDispose(() => {
    teardown?.()
    teardown = null
  })

  const pushState = (state: SlaveCardState) => {
    const token = tokenRef.value
    if (token) getCheckoffSocket().emit('master:state', { token, state })
  }

  const switchQuestion = (payload: {
    studentName: string
    index: number
    total: number
    content: string
  }) => {
    const token = tokenRef.value
    if (token) getCheckoffSocket().emit('switch_question', { token, ...payload })
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

/**
 * 验收页房间：加入当前班级的验收房间，接收其他助教进入「展示 demo」时的广播。
 * 回调经 ref 调用，effect 仅依赖 classId。旧版返回 undefined，这里同样不返回值。
 */
export function useCheckoffWatch(
  classId: MaybeRefOrGetter<string | undefined>,
  onStarted: MaybeRefOrGetter<(event: CheckoffStartedEvent) => void>,
) {
  /** 对应旧版 `handlerRef = useRef(onStarted)`：只给 socket 回调读，不进渲染 */
  const handlerRef = shallowRef<(event: CheckoffStartedEvent) => void>(toValue(onStarted))
  /** 当前这一轮 watch 的清理函数，null 表示没有在跑 */
  let teardown: (() => void) | null = null

  // 旧版 L136-138 useEffect，依赖 [onStarted]：把最新回调同步进 handlerRef
  watch(
    () => toValue(onStarted),
    (handler) => {
      handlerRef.value = handler
    },
    { immediate: true },
  )

  // 旧版 L140-156 useEffect，依赖 [classId]：加入房间 + 监听
  watch(
    () => toValue(classId),
    (id) => {
      if (!id) return
      const s = getCheckoffSocket()

      const join = () => s.emit('checkoff:watch', { classId: id })
      const onEvent = (payload: CheckoffStartedEvent) => handlerRef.value(payload)

      s.on('checkoff:started', onEvent)
      s.on('connect', join)
      if (s.connected) join()

      teardown = () => {
        s.off('checkoff:started', onEvent)
        s.off('connect', join)
        s.emit('checkoff:unwatch', { classId: id })
      }
      onWatcherCleanup(() => {
        teardown?.()
        teardown = null
      })
    },
    { immediate: true },
  )

  onScopeDispose(() => {
    teardown?.()
    teardown = null
  })
}

/** 通知当前班级的验收房间：本助教开始验收某学生 */
export function notifyCheckoffStarted(payload: { classId: string; studentName: string }): void {
  getCheckoffSocket().emit('checkoff:notify', payload)
}

/* ------------------------------- slave ------------------------------- */

/** slave:join 的 ack 结构（与旧版内联类型逐字一致） */
type SlaveJoinRes = { token?: string; state?: SlaveCardState; error?: string }

/** slave 端：按 token 或 6 位 pin 加入；断线重连时自动重新 join 获取当前 state。 */
export function useCheckoffSlave(
  join: MaybeRefOrGetter<{ token?: string; code?: string } | null | undefined>,
) {
  const state = ref<SlaveCardState | null>(null)
  const connected = ref(false)
  const closed = ref(false)
  const error = ref<string | null>(null)
  const sessionToken = ref<string | null>(null)

  /** 读一次入参（页面可能传 getter，也可能在拿到配对码前传 null） */
  const info = () => toValue(join) ?? {}
  /** 对应旧版 `const joinKey = join.token ?? join.code ?? null` */
  const joinKey = () => {
    const current = info()
    return current.token ?? current.code ?? null
  }

  /** 当前这一轮 watch 的清理函数，null 表示没有在跑 */
  let teardown: (() => void) | null = null
  /** 照抄旧版：true 时丢弃在路上的事件与 ack */
  let cancelled = false

  // 旧版 L175-211 useEffect，依赖 [joinKey, join.token, join.code]
  watch(
    [joinKey, () => info().token ?? null, () => info().code ?? null],
    () => {
      if (!joinKey()) return
      const s = getCheckoffSocket()
      // 旧版 effect 闭包捕获的是当次渲染的 join，这里同样在本轮开始时取一次
      const current = info()
      cancelled = false

      const onState = (payload: { state: SlaveCardState }) => {
        if (!cancelled && payload?.state) state.value = payload.state
      }
      const onClosed = () => {
        if (!cancelled) closed.value = true
      }
      const joinNow = () => {
        s.emit(
          'slave:join',
          current.token ? { token: current.token } : { code: current.code },
          (res: SlaveJoinRes) => {
            if (cancelled) return
            connected.value = true
            error.value = res?.error ?? null
            if (res?.token) sessionToken.value = res.token
            if (res?.state) state.value = res.state
          },
        )
      }

      s.on('slave:state', onState)
      s.on('slave:closed', onClosed)
      if (s.connected) joinNow()
      s.on('connect', joinNow)

      teardown = () => {
        cancelled = true
        s.off('slave:state', onState)
        s.off('slave:closed', onClosed)
        s.off('connect', joinNow)
      }
      onWatcherCleanup(() => {
        teardown?.()
        teardown = null
      })
    },
    { immediate: true },
  )

  onScopeDispose(() => {
    teardown?.()
    teardown = null
  })

  return { state, connected, closed, error, sessionToken }
}
