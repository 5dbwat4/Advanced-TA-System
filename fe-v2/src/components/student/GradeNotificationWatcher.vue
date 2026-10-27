<script setup lang="ts">
import { computed, watch } from 'vue'

import { fetchStudentOverview } from '@/lib/api'
import { useAuthStore } from '@/lib/auth'
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
import { toast } from '@/lib/toast'

const auth = useAuthStore()
const userId = computed(() => auth.user?.id ?? null)
const enabled = useGradeNotifyEnabled(userId)
const backgroundEnabled = useBackgroundGradeNotifyEnabled(userId)

watch(
  [backgroundEnabled, userId],
  ([background, id], _previous, onCleanup) => {
    if (!background || !id) return

    const sync = () => {
      void syncBackgroundGradeNotifications(id)
    }

    sync()
    window.addEventListener('focus', sync)
    onCleanup(() => window.removeEventListener('focus', sync))
  },
  { immediate: true },
)

watch(
  [backgroundEnabled, userId],
  ([background, id]) => {
    if (!id || background) return

    const owner = getBackgroundNotificationOwner()
    if (owner && owner !== id) {
      void disableBackgroundGradeNotifications(owner)
    }
  },
  { immediate: true },
)

watch(
  [enabled, userId],
  ([notificationsEnabled, id], _previous, onCleanup) => {
    if (!notificationsEnabled || !id) return

    let stopped = false
    let checking = false
    let timer: number | undefined

    const check = async () => {
      if (stopped || checking) return
      checking = true
      try {
        const overview = await fetchStudentOverview()
        if (stopped) return

        const previous = readGradeSnapshot(id)
        writeGradeSnapshot(id, overview)
        if (!previous) return

        const messages = gradeUpdateMessages(previous, overview)
        if (messages.length === 0) return

        const body =
          messages.slice(0, 3).join('；') +
          (messages.length > 3 ? `；等 ${messages.length} 项` : '')
        const shown = await showGradeNotification('成绩更新', body)
        if (!shown) toast.info('成绩更新', body)
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

    onCleanup(() => {
      stopped = true
      if (timer != null) window.clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('focus', check)
    })
  },
  { immediate: true },
)
</script>

<template></template>
