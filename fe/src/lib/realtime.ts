import { io, type Socket } from 'socket.io-client'

import { getToken } from '@/lib/api'

export type ScoreChangeEvent =
  | {
      action: 'upsert'
      classId: string
      score: {
        userId: string
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
  | { action: 'delete'; classId: string; userId: string; type: number; indId: string }

let socket: Socket | null = null
let socketToken: string | null = null

export function connectScoreSocket(): Socket {
  const token = getToken()
  if (socket && socketToken !== token) disconnectScoreSocket()
  if (socket) return socket
  socketToken = token
  socket = io({
    auth: token ? { token } : {},
    transports: ['websocket', 'polling'],
  })
  return socket
}

export function disconnectScoreSocket(): void {
  if (!socket) return
  socket.disconnect()
  socket = null
  socketToken = null
}

/** 订阅当前选中班级的成绩广播（不再默认按用户所有班级进房） */
export function subscribeScores(socket: Socket, classId: string): void {
  socket.emit('scores:subscribe', { classId })
}
