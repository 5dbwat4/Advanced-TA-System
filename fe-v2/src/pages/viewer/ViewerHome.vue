<script setup lang="ts">
import { useRouter } from 'vue-router'

import Logo from '@/components/ui/Logo.vue'
import ThemeToggle from '@/components/ui/ThemeToggle.vue'
import { useAuthStore } from '@/lib/auth'
import { UButton, UIcon } from '@/ui'

const auth = useAuthStore()
const router = useRouter()

function openSettings() {
  void router.push('/settings')
}

function handleLogout() {
  auth.logout()
  void router.replace('/login')
}
</script>

<template>
  <div class="diagonal-bg relative flex min-h-screen items-center justify-center px-5 py-10">
    <div class="absolute right-4 top-4">
      <ThemeToggle />
    </div>

    <div
      class="w-full max-w-md rounded-3xl border border-line bg-elevated/80 p-8 text-center backdrop-blur-xl"
    >
      <div class="mb-4 flex justify-center">
        <Logo :size="40" />
      </div>
      <div class="mb-3 flex justify-center">
        <span
          class="flex h-12 w-12 items-center justify-center rounded-full bg-brand-500/10 text-brand-600 dark:text-brand-300"
        >
          <UIcon name="i-lucide-eye" class="size-[22px] shrink-0" />
        </span>
      </div>
      <h1 class="text-lg font-bold tracking-tight">观察者面板</h1>
      <p class="mt-2 text-sm text-fg-muted">
        {{ auth.user?.name ? `你好，${auth.user.name}。` : '' }}
        观察者的独立面板正在建设中。
      </p>
      <p class="mt-1 text-xs text-fg-subtle">
        当前账号暂不能进入助教 / 教师后台，仅可使用账号基础功能。
      </p>

      <div class="mt-6 flex gap-2">
        <UButton color="neutral" variant="soft" block @click="openSettings">
          账号设置
        </UButton>
        <UButton color="neutral" variant="ghost" block @click="handleLogout">
          退出登录
        </UButton>
      </div>
    </div>
  </div>
</template>
