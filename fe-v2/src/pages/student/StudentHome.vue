<script setup lang="ts">
import { computed } from 'vue'
import { useRouter } from 'vue-router'

import CreditsSection from '@/components/settings/CreditsSection.vue'
import AvatarImage from '@/components/ui/AvatarImage.vue'
import Logo from '@/components/ui/Logo.vue'
import ThemeToggle from '@/components/ui/ThemeToggle.vue'
import { useAuthStore } from '@/lib/auth'
import { useCurrentClassComputed } from '@/lib/store'
import { toast } from '@/lib/toast'
import { UButton, UIcon } from '@/ui'

const auth = useAuthStore()
const router = useRouter()

const user = computed(() => auth.user)
const klass = useCurrentClassComputed()

function handleLogout() {
  auth.logout()
  toast.success('已退出登录')
  void router.replace('/login')
}
</script>

<template>
  <div v-if="user" class="diagonal-bg min-h-screen">
    <header
      class="glass sticky top-0 z-30 flex h-16 items-center justify-between border-b border-line px-5 md:px-8"
    >
      <div class="flex items-center gap-3">
        <Logo :size="32" />
        <div class="leading-tight">
          <div class="text-sm font-bold tracking-tight">Advanced TA System</div>
          <div class="text-[10px] font-medium tracking-widest text-fg-subtle">学生主页</div>
        </div>
      </div>
      <div class="flex items-center gap-1">
        <ThemeToggle />
        <UButton
          color="neutral"
          variant="ghost"
          size="sm"
          icon="i-lucide-settings"
          @click="router.push('/settings')"
        >
          设置
        </UButton>
        <UButton
          color="neutral"
          variant="ghost"
          size="sm"
          icon="i-lucide-log-out"
          @click="handleLogout"
        >
          退出
        </UButton>
      </div>
    </header>

    <main class="mx-auto flex w-full max-w-2xl flex-col gap-4 px-5 py-8">
      <section class="rounded-3xl border border-line bg-elevated/80 p-6 shadow-2xl backdrop-blur-xl">
        <div class="flex items-center gap-4">
          <AvatarImage :id="user.avatar" :size="64">
            <template #fallback>{{ user.name.slice(0, 1) }}</template>
          </AvatarImage>
          <div class="min-w-0">
            <div class="flex items-center gap-2">
              <span class="truncate text-xl font-bold tracking-tight">{{ user.name }}</span>
              <span
                class="inline-flex items-center gap-1 rounded-full bg-brand-500/10 px-2 py-0.5 text-[10px] font-semibold text-brand-600 dark:text-brand-300"
              >
                <UIcon name="i-lucide-graduation-cap" class="size-3 shrink-0" />
                学生
              </span>
            </div>
            <div class="tabular mt-1 text-sm text-fg-muted">{{ user.studentId ?? '—' }}</div>
            <div class="mt-1 text-xs text-fg-subtle">{{ klass?.name ?? '未绑定班级' }}</div>
          </div>
        </div>
      </section>

      <CreditsSection />
    </main>
  </div>
</template>
