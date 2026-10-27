<script setup lang="ts">
import { computed, onUnmounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import Card from '@/components/ui/Card.vue'
import Spinner from '@/components/ui/Spinner.vue'
import { getInviteInfo, type InviteInfo, type InvitableRole } from '@/lib/api'
import { getErrorMessage } from '@/lib/error'
import { savePendingInvite } from '@/lib/onboarding'
import { useAppStore } from '@/lib/store'
import { UAlert, UButton, UIcon } from '@/ui'

const ROLE_LABELS: Record<InvitableRole, string> = {
  TA: '助教',
  TEACHER: '教师',
  VIEWER: '观察者',
}

const route = useRoute()
const router = useRouter()
const app = useAppStore()

const token = computed(() => (typeof route.query.token === 'string' ? route.query.token : ''))
const info = ref<InviteInfo | null>(null)
const error = ref<string | null>(null)
const loading = ref(true)

let cancelled = false

async function load() {
  if (!token.value) {
    error.value = '邀请链接无效'
    loading.value = false
    return
  }

  loading.value = true
  error.value = null
  info.value = null

  try {
    const data = await getInviteInfo(token.value)
    if (!cancelled) info.value = data
  } catch (err) {
    if (!cancelled) error.value = getErrorMessage(err, '邀请链接无效或已过期')
  } finally {
    if (!cancelled) loading.value = false
  }
}

watch(
  token,
  () => {
    cancelled = false
    void load()
  },
  { immediate: true },
)

onUnmounted(() => {
  cancelled = true
})

function formatTime(value: string): string {
  return new Date(value).toLocaleString()
}

function goSetup() {
  if (!info.value) return
  savePendingInvite({
    token: token.value,
    inviterName: info.value.inviterName,
    className: info.value.className,
    role: info.value.role,
    expiresAt: info.value.expiresAt,
  })
  app.setOnboardingInfo(info.value)
  app.setOnboarding(true)
  void router.push('/setup')
}
</script>

<template>
  <div class="mx-auto max-w-xl">
    <Card class="flex flex-col gap-5">
      <div class="flex items-center gap-3">
        <span
          class="flex h-11 w-11 items-center justify-center rounded-2xl bg-brand-500/10 text-brand-600 dark:text-brand-300"
        >
          <UIcon name="i-lucide-mail-check" class="size-5 shrink-0" />
        </span>
        <div>
          <h1 class="text-lg font-bold tracking-tight">课程邀请</h1>
          <p class="text-xs text-fg-subtle">接受后会在邀请人的课程中获得对应身份</p>
        </div>
      </div>

      <div v-if="loading" class="flex items-center justify-center py-10">
        <Spinner />
      </div>

      <UAlert
        v-else-if="error"
        color="error"
        :title="error"
        icon="i-lucide-circle-alert"
      />

      <template v-else-if="info">
        <div class="grid gap-3 sm:grid-cols-2">
          <div class="rounded-xl border border-line bg-sunken px-4 py-3">
            <div class="text-[10px] font-semibold uppercase tracking-widest text-fg-subtle">课程</div>
            <div class="mt-1 text-sm font-semibold">{{ info.className ?? '未命名课程' }}</div>
          </div>
          <div class="rounded-xl border border-line bg-sunken px-4 py-3">
            <div class="text-[10px] font-semibold uppercase tracking-widest text-fg-subtle">身份</div>
            <div class="mt-1 text-sm font-semibold">{{ ROLE_LABELS[info.role] }}</div>
          </div>
          <div class="rounded-xl border border-line bg-sunken px-4 py-3">
            <div class="text-[10px] font-semibold uppercase tracking-widest text-fg-subtle">邀请人</div>
            <div class="mt-1 text-sm font-semibold">{{ info.inviterName }}</div>
          </div>
          <div class="rounded-xl border border-line bg-sunken px-4 py-3">
            <div class="text-[10px] font-semibold uppercase tracking-widest text-fg-subtle">
              有效期至
            </div>
            <div class="mt-1 text-sm font-semibold">{{ formatTime(info.expiresAt) }}</div>
          </div>
        </div>

        <UButton block @click="goSetup">接受邀请并创建账号</UButton>
      </template>
    </Card>
  </div>
</template>
