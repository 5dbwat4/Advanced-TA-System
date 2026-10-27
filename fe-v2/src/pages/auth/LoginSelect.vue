<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'

import Logo from '@/components/ui/Logo.vue'
import type { LoginCandidate } from '@/lib/api'
import { useAuthStore } from '@/lib/auth'
import { getErrorMessage } from '@/lib/error'
import { homePathFor } from '@/lib/student-route'
import { useAppStore } from '@/lib/store'
import { toast } from '@/lib/toast'
import { UButton, UIcon } from '@/ui'

type SelectState = {
  selectionToken: string
  candidates: LoginCandidate[]
  from?: string
}

const ROLE_LABEL: Record<string, string> = {
  TA: '助教',
  TEACHER: '教师',
  VIEWER: '观察者',
  STUDENT: '学生',
}

const router = useRouter()
const auth = useAuthStore()
const app = useAppStore()

const state = (window.history.state as SelectState | null) ?? null
const ready = Boolean(state?.selectionToken && state.candidates?.length)
if (!ready) void router.replace({ path: '/login', replace: true })

const selectionToken = state?.selectionToken ?? ''
const candidates = state?.candidates ?? []
const from = state?.from

const pendingId = ref<string | null>(null)

function roleIcon(role: LoginCandidate['role']): string {
  if (role === 'STUDENT') return 'i-lucide-graduation-cap'
  if (role === 'VIEWER') return 'i-lucide-eye'
  return 'i-lucide-shield-check'
}

async function choose(candidate: LoginCandidate) {
  pendingId.value = candidate.userId
  try {
    const user = await auth.selectAccount(selectionToken, candidate.userId)
    if (!user.username) {
      app.setOnboardingInfo({
        source: 'login',
        identifier: user.studentId ?? candidate.studentId,
        className: user.classes[0]?.name ?? candidate.className,
        role: user.role,
      })
      app.setOnboarding(true)
    }
    toast.success(`欢迎回来，${user.name}`)
    const dest = from ?? homePathFor(user)
    void router.replace(dest)
  } catch (error) {
    toast.error(getErrorMessage(error, '登录失败，请重新登录'))
    void router.replace('/login')
  } finally {
    pendingId.value = null
  }
}
</script>

<template>
  <div v-if="ready" class="diagonal-bg flex min-h-screen items-center justify-center px-5 py-10">
    <div class="w-full max-w-md">
      <div class="mb-6 flex flex-col items-center gap-3 text-center">
        <Logo :size="40" />
        <div>
          <h1 class="text-lg font-bold tracking-tight">选择要登录的班级</h1>
          <p class="mt-1 text-xs text-fg-subtle">你的账号同时属于多个班级</p>
        </div>
      </div>

      <div class="flex flex-col gap-2">
        <UButton
          v-for="candidate in candidates"
          :key="candidate.userId"
          color="neutral"
          variant="soft"
          block
          class="h-auto justify-start px-4 py-3"
          :disabled="pendingId !== null"
          @click="choose(candidate)"
        >
          <span class="flex w-full items-center gap-3 text-left">
            <span
              class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-500/10 text-brand-600 dark:text-brand-300"
            >
              <UIcon :name="roleIcon(candidate.role)" class="size-[18px] shrink-0" />
            </span>
            <span class="min-w-0 flex-1">
              <span class="block truncate text-sm font-semibold text-fg">
                {{ candidate.name }}
                <span class="ml-2 text-xs font-normal text-fg-subtle">
                  {{ ROLE_LABEL[candidate.role] ?? candidate.role }}
                </span>
              </span>
              <span class="block truncate text-xs text-fg-subtle">
                {{ [candidate.studentId, candidate.className].filter(Boolean).join(' · ') || '未绑定班级' }}
              </span>
            </span>
            <span v-if="pendingId === candidate.userId" class="text-xs text-fg-subtle">登录中…</span>
          </span>
        </UButton>
      </div>

      <UButton
        color="neutral"
        variant="ghost"
        block
        class="mt-4"
        @click="router.replace('/login')"
      >
        返回登录
      </UButton>
    </div>
  </div>
</template>
