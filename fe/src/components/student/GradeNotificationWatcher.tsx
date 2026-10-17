import { useEffect } from 'react'

import { fetchStudentOverview } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import {
  GRADE_NOTIFICATIONS_POLL_MS,
  disableBackgroundGradeNotifications,
  getBackgroundNotificationOwner,
  gradeUpdateMessages,
  readGradeSnapshot,
  showGradeNotification,
  syncBackgroundGradeNotifications,
  useBackgroundGradeNotifyEnabled,
  useGradeNotifyEnabled,
  writeGradeSnapshot,
} from '@/lib/grade-notifications'

/**
 * 学生控制台内的成绩更新检查器。
 * 前台提醒设置保存在本浏览器；后台提醒通过 Web Push 由服务端推送。
 */
export function GradeNotificationWatcher() {
  const { user } = useAuth()
  const userId = user?.id ?? null
  const enabled = useGradeNotifyEnabled(userId)
  const backgroundEnabled = useBackgroundGradeNotifyEnabled(userId)

  useEffect(() => {
    if (!backgroundEnabled || !userId) return

    const sync = () => void syncBackgroundGradeNotifications(userId)
    sync()
    window.addEventListener('focus', sync)
    return () => window.removeEventListener('focus', sync)
  }, [backgroundEnabled, userId])

  useEffect(() => {
    if (!userId || backgroundEnabled) return
    const owner = getBackgroundNotificationOwner()
    if (owner && owner !== userId) {
      void disableBackgroundGradeNotifications(owner)
    }
  }, [backgroundEnabled, userId])

  useEffect(() => {
    if (!enabled || !userId) return

    let stopped = false
    let checking = false
    let timer: number | undefined

    const check = async () => {
      if (stopped || checking) return
      checking = true
      try {
        const overview = await fetchStudentOverview()
        if (stopped) return

        const previous = readGradeSnapshot(userId)
        writeGradeSnapshot(userId, overview)
        if (!previous) return

        const messages = gradeUpdateMessages(previous, overview)
        if (messages.length === 0) return

        const body =
          messages.slice(0, 3).join('；') +
          (messages.length > 3 ? `；等 ${messages.length} 项` : '')
        await showGradeNotification('成绩更新', body)
      } catch {
        // 网络波动时保持静默，下一轮继续检查
      } finally {
        checking = false
      }
    }

    void check()
    timer = window.setInterval(() => void check(), GRADE_NOTIFICATIONS_POLL_MS)

    const onVisible = () => {
      if (document.visibilityState === 'visible') void check()
    }
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('focus', check)

    return () => {
      stopped = true
      if (timer != null) window.clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('focus', check)
    }
  }, [enabled, userId])

  return null
}
