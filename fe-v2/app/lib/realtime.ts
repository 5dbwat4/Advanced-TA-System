/**
 * realtime —— 逐字移植自 `fe/src/lib/realtime.ts`（42 行）
 *
 * 成绩变更的 socket.io 实时通道：连接 / 断开 / 订阅，以及 `ScoreChangeEvent` 事件类型。
 *
 * ────────────────────────────────────────────────────────────────────────
 * 迁移动作对照
 * ────────────────────────────────────────────────────────────────────────
 * 1) 唯一改动是 import 别名：`@/lib/api` → `~/lib/api`（Nuxt 约定）。
 *    `fe-v2/app/lib/api.ts` 的 `getToken(): string | null` 与旧版一致。
 * 2) 其余全部逐字照搬：`ScoreChangeEvent` 联合类型（`upsert` 分支的 9 个 score 字段、
 *    `delete` 分支的 5 个字段）与旧版完全一致；`io({ auth: { token: getToken() ?? '' },
 *    transports: ['websocket', 'polling'] })` 的连接参数、`scores:subscribe` 事件名，
 *    均**零改动**。
 * 3) **模块级单例语义保持不变**：模块作用域的 `let socket: Socket | null = null`
 *    原样保留（Nuxt 自动导入只生成 re-export，不改变模块作用域，因此多次
 *    `connectScoreSocket()` 共享同一个 socket 实例，与 React 版行为一致）。
 *    - `connectScoreSocket()`：`if (socket) return socket` 幂等短路，重复调用复用同一连接。
 *    - `disconnectScoreSocket()`：`if (!socket) return` 幂等守卫，`disconnect()` 后置 `null`，
 *      下次 `connectScoreSocket()` 会重新建连。
 *    - `subscribeScores(socket)`：显式接收 socket 参数（不复用模块单例），
 *      与旧版一致，便于订阅非单例连接。
 * 4) 纯模块级函数，**无 React 依赖，无行为差异**。
 * 5) 依赖 `socket.io-client` 已在 `fe-v2/package.json`（`^4.8.3`，与 `fe` 一致）。
 *
 * ────────────────────────────────────────────────────────────────────────
 * ⚠️ 需注意（Nuxt 与 Vite 的差异，逻辑本身未改）
 * ────────────────────────────────────────────────────────────────────────
 * Nuxt 的 socket 客户端代码会被打进客户端 chunk，但**服务端渲染阶段同样会执行本模块**：
 * 若在 SSR 期调用 `connectScoreSocket()`，`getToken()` 读不到浏览器 token，会以空 token
 * 建立服务端连接。旧版 React SPA 无此问题。调用方（成绩相关页面/组件）应在
 * `onMounted` / `import.meta.client` 保护下连接，与旧版「首屏挂载后才建连」的时序等价。
 */
import { io, type Socket } from 'socket.io-client'

import { getToken } from '~/lib/api'

export type ScoreChangeEvent =
  | {
      action: 'upsert'
      classId: string
      score: {
        stuId: string
        type: number
        indId: string
        labId: string | null
        score: number
        graderId: string | null
        graderName: string | null
        createdAt: string
        updatedAt: string
      }
    }
  | { action: 'delete'; classId: string; stuId: string; type: number; indId: string }

let socket: Socket | null = null

export function connectScoreSocket(): Socket {
  if (socket) return socket
  socket = io({
    auth: { token: getToken() ?? '' },
    transports: ['websocket', 'polling'],
  })
  return socket
}

export function disconnectScoreSocket(): void {
  if (!socket) return
  socket.disconnect()
  socket = null
}

export function subscribeScores(socket: Socket): void {
  socket.emit('scores:subscribe')
}
