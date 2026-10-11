import { io, type Socket } from 'socket.io-client'

import { getToken } from '@/lib/api'

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
  const token = getToken()
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
}

/** 订阅当前选中班级的成绩广播（不再默认按用户所有班级进房） */
export function subscribeScores(socket: Socket, classId: string): void {
  socket.emit('scores:subscribe', { classId })
}
