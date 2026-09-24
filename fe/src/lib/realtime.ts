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
