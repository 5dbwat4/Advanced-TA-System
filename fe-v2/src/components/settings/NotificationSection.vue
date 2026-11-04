<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'

import Card from '@/components/ui/Card.vue'
import { useAuthStore } from '@/lib/auth'
import {
  browserNotificationsSupported,
  disableBackgroundGradeNotifications,
  enableBackgroundGradeNotifications,
  gradeNotificationsPermission,
  setGradeNotifyEnabled,
  useBackgroundGradeNotifyEnabled,
  useGradeNotifyEnabled,
} from '@/lib/grade-notifications'
import { toast } from '@/lib/toast'
import { UAlert, UButton, UIcon, USwitch } from '@/ui'

const props = withDefaults(
  defineProps<{
    index?: number
  }>(),
  {
    index: 0,
  },
)

const auth = useAuthStore()
const userId = computed(() => auth.user?.id ?? null)
const enabled = useGradeNotifyEnabled(userId)
const backgroundEnabled = useBackgroundGradeNotifyEnabled(userId)
const supported = browserNotificationsSupported()
const permission = ref<NotificationPermission | 'unsupported'>(gradeNotificationsPermission())
const backgroundBusy = ref(false)

function syncPermission() {
  permission.value = gradeNotificationsPermission()
}

onMounted(() => {
  syncPermission()
  window.addEventListener('focus', syncPermission)
  document.addEventListener('visibilitychange', syncPermission)
})

onUnmounted(() => {
  window.removeEventListener('focus', syncPermission)
  document.removeEventListener('visibilitychange', syncPermission)
})

async function ensurePermission(): Promise<boolean> {
  if (!supported) {
    toast.error('当前浏览器不支持系统通知')
    return false
  }

  let result = Notification.permission
  if (result === 'default') {
    try {
      result = await Notification.requestPermission()
    } catch {
      result = 'denied'
    }
    permission.value = result
  }
  if (result !== 'granted') {
    toast.error(
      result === 'denied'
        ? '浏览器已禁止通知，请在站点设置中允许后重试'
        : '未获得浏览器通知权限',
    )
    return false
  }

  permission.value = 'granted'
  return true
}

async function toggle(next: boolean) {
  const id = userId.value
  if (!id) return

  if (!next) {
    setGradeNotifyEnabled(id, false)
    toast.success('已关闭成绩更新提醒')
    return
  }

  if (!(await ensurePermission())) return

  setGradeNotifyEnabled(id, true)
  toast.success('已开启成绩更新提醒')
}

async function toggleBackground(next: boolean) {
  const id = userId.value
  if (!id) return

  backgroundBusy.value = true
  try {
    if (!next) {
      await disableBackgroundGradeNotifications(id)
      toast.success('已关闭后台成绩推送')
      return
    }

    if (!(await ensurePermission())) return

    const result = await enableBackgroundGradeNotifications(id)
    if (!result.ok) {
      toast.error(result.message)
      return
    }
    toast.success('已开启后台成绩推送')
  } finally {
    backgroundBusy.value = false
  }
}

function requestPermission() {
  void ensurePermission()
}
</script>

<template>
  <Card :index="props.index" class="flex flex-col gap-5">
    <div class="flex items-center gap-2 text-sm font-bold">
      <UIcon name="i-lucide-bell" class="h-4 w-4 shrink-0 text-brand-600 dark:text-brand-300" />
      Notifications
    </div>

    <div class="flex items-center justify-between gap-4 rounded-xl border border-line px-4 py-3">
      <div class="min-w-0">
        <div class="text-xs font-semibold text-fg-muted">在成绩更新时提醒我</div>
        <div class="text-[11px] text-fg-subtle">打开本站时检测成绩变化</div>
      </div>
      <USwitch
        :model-value="enabled"
        :disabled="!userId || !supported"
        @update:model-value="(value: boolean) => void toggle(value)"
      />
    </div>

    <div class="flex items-center justify-between gap-4 rounded-xl border border-line px-4 py-3">
      <div class="min-w-0">
        <div class="text-xs font-semibold text-fg-muted">
          即使关闭页面也推送成绩更新
        </div>
        <div class="text-[11px] text-fg-subtle">
          使用 Web Push；需要浏览器通知权限，部分浏览器要求安装为应用
        </div>
      </div>
      <USwitch
        :model-value="backgroundEnabled"
        :disabled="!userId || !supported || backgroundBusy"
        @update:model-value="(value: boolean) => void toggleBackground(value)"
      />
    </div>

    <UAlert
      variant="subtle"
      v-if="!supported"
      color="warning"
      description="当前浏览器不支持系统通知。"
    />
    <UAlert
      variant="subtle"
      v-else-if="permission === 'denied'"
      color="warning"
      description="浏览器已禁止本站通知，请在地址栏的站点设置中允许后重试。"
    />
    <div v-else-if="permission !== 'granted'">
      <UButton size="sm" color="neutral" variant="soft" @click="requestPermission">
        <UIcon name="i-lucide-bell-ring" class="h-4 w-4 shrink-0" />
        请求通知权限
      </UButton>
    </div>
  </Card>
</template>