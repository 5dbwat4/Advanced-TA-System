import { useEffect, useRef } from 'react'

import type { Score } from '@/lib/api'
import { connectScoreSocket } from '@/lib/realtime'

/** 实验房间内的在场信息（谁正在批改哪个学生） */
export type ReportPeer = {
  userId: string
  name: string
  /** 正在批改的学生（User.id），未选中为 null */
  studentId: string | null
}

/** 他人保存 / 删除报告成绩事件（「同步」时会再从数据库 GET 最新内容） */
export type ReportScoreEvent = {
  userId: string
  /** null 表示删除 */
  score: Score | null
  byUserId: string
  byName: string
}

type ReportRoomOptions = {
  experimentId: string | undefined
  /** 当前正在批改的学生（User.id），未选中 / 未匹配为 null */
  studentId: string | null
  onPresence: (peers: ReportPeer[]) => void
  onScore: (event: ReportScoreEvent) => void
}

/**
 * 报告批改房间：加入按实验划分的房间，上报「正在批改谁」，
 * 接收在场列表与他人保存成绩事件。复用成绩 socket 单例。
 */
export function useReportRoom({
  experimentId,
  studentId,
  onPresence,
  onScore,
}: ReportRoomOptions): void {
  const presenceRef = useRef(onPresence)
  const scoreRef = useRef(onScore)
  const studentIdRef = useRef(studentId)
  presenceRef.current = onPresence
  scoreRef.current = onScore
  studentIdRef.current = studentId

  useEffect(() => {
    if (!experimentId) return
    const socket = connectScoreSocket()

    const applyPresence = (peers: ReportPeer[]) => presenceRef.current(peers)
    const onPresenceEvent = (payload: { peers?: ReportPeer[] }) =>
      applyPresence(payload?.peers ?? [])
    const onScoreEvent = (event: ReportScoreEvent) => scoreRef.current(event)

    const join = () => {
      socket.emit(
        'report:join',
        { experimentId },
        (res: { peers?: ReportPeer[]; error?: string }) => {
          if (res?.peers) applyPresence(res.peers)
          socket.emit('report:focus', { experimentId, studentId: studentIdRef.current })
        },
      )
    }

    socket.on('report:presence', onPresenceEvent)
    socket.on('report:score', onScoreEvent)
    socket.on('connect', join)
    if (socket.connected) join()

    return () => {
      socket.off('report:presence', onPresenceEvent)
      socket.off('report:score', onScoreEvent)
      socket.off('connect', join)
      socket.emit('report:leave', { experimentId })
      applyPresence([])
    }
  }, [experimentId])

  useEffect(() => {
    if (!experimentId) return
    connectScoreSocket().emit('report:focus', { experimentId, studentId })
  }, [experimentId, studentId])
}
