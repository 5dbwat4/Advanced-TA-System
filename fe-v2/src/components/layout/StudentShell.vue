<script setup lang="ts">
import { computed } from 'vue'
import { RouterLink, RouterView, useRoute, useRouter } from 'vue-router'

import AvatarImage from '@/components/ui/AvatarImage.vue'
import IconAction from '@/components/ui/IconAction.vue'
import Logo from '@/components/ui/Logo.vue'
import ThemeToggle from '@/components/ui/ThemeToggle.vue'
import { useAuthStore } from '@/lib/auth'
import { disableBackgroundGradeNotifications } from '@/lib/grade-notifications'
import { toast } from '@/lib/toast'
import { cn } from '@/lib/utils'
import { UIcon } from '@/ui'

type StudentNavItem = {
  to: string
  label: string
  icon: string
  end?: boolean
}

const NAV_ITEMS: StudentNavItem[] = [
  { to: '/student-console', label: '概览', icon: 'i-lucide-layout-dashboard', end: true },
  { to: '/student-console/scores', label: '实验成绩', icon: 'i-lucide-clipboard-list' },
  { to: '/student-console/settings', label: '设置', icon: 'i-lucide-settings' },
]

const auth = useAuthStore()
const route = useRoute()
const router = useRouter()

const user = computed(() => auth.user)
const klass = computed(() => auth.user?.classes[0] ?? null)
const pathname = computed(() => route.path)

function isActive(item: StudentNavItem): boolean {
  return item.end
    ? pathname.value === item.to
    : pathname.value === item.to || pathname.value.startsWith(`${item.to}/`)
}

async function handleLogout() {
  const current = auth.user
  if (current) {
    await disableBackgroundGradeNotifications(current.id).catch(() => undefined)
  }
  auth.logout()
  toast.success('已退出登录')
  await router.replace('/login')
}
</script>

<template>
  <div class="flex min-h-screen">
    <aside
      class="fixed inset-y-0 left-0 z-40 hidden w-60 flex-col border-r border-line bg-elevated/60 backdrop-blur-xl md:flex"
    >
      <div class="flex h-16 items-center gap-3 px-5">
        <Logo :size="36" />
        <div class="leading-tight">
          <div class="text-sm font-bold tracking-tight">ATASAAS</div>
          <div class="text-[10px] font-medium tracking-widest text-fg-subtle">
            Student Console
          </div>
        </div>
      </div>

      <nav class="mt-4 flex flex-1 flex-col gap-1 px-3">
        <RouterLink
          v-for="item in NAV_ITEMS"
          :key="item.to"
          :to="item.to"
          :aria-current="isActive(item) ? 'page' : undefined"
          :class="
            cn(
              'group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors',
              isActive(item)
                ? 'bg-brand-500/10 text-fg ring-1 ring-brand-500/25'
                : 'text-fg-muted hover:text-fg',
            )
          "
        >
          <UIcon
            :name="item.icon"
            class="size-[18px] shrink-0 text-brand-600 transition-colors dark:text-brand-300"
          />
          <span>{{ item.label }}</span>
        </RouterLink>
      </nav>

      <div class="border-t border-line p-3">
        <div class="flex items-center gap-3 rounded-xl px-2 py-2">
          <AvatarImage :id="user?.avatar ?? null" :size="36">
            <template #fallback>{{ user?.name?.slice(0, 1) ?? '·' }}</template>
          </AvatarImage>
          <div class="min-w-0 flex-1 leading-tight">
            <div class="truncate text-sm font-semibold">{{ user?.name ?? '未登录' }}</div>
            <div class="truncate text-xs text-fg-subtle">
              {{ user?.username ? `@${user.username}` : '—' }}
            </div>
          </div>
          <span @click="handleLogout">
            <IconAction label="退出登录">
              <UIcon name="i-lucide-log-out" class="size-4 shrink-0 text-fg-muted" />
            </IconAction>
          </span>
        </div>
      </div>
    </aside>

    <div class="flex min-h-screen min-w-0 flex-1 flex-col md:pl-60">
      <header
        class="glass sticky top-0 z-30 flex h-16 items-center justify-between border-b border-line px-4 md:px-8"
      >
        <div class="flex min-w-0 items-center gap-2">
          <UIcon
            name="i-lucide-book-open"
            class="size-4 shrink-0 text-brand-600 dark:text-brand-300"
          />
          <span class="truncate text-sm font-semibold">{{ klass?.name ?? '未绑定班级' }}</span>
        </div>
        <div class="flex items-center gap-1">
          <ThemeToggle />
          <span @click="handleLogout">
            <IconAction label="退出登录">
              <UIcon name="i-lucide-log-out" class="size-4 shrink-0" />
            </IconAction>
          </span>
        </div>
      </header>

      <main class="flex-1 px-4 pb-24 pt-6 md:px-8 md:pb-10">
        <RouterView v-slot="{ Component }">
          <Transition name="page" mode="out-in">
            <component :is="Component" :key="route.path" />
          </Transition>
        </RouterView>
      </main>
    </div>

    <nav
      class="glass fixed inset-x-0 bottom-0 z-40 flex items-stretch justify-around border-t border-line pb-[env(safe-area-inset-bottom)] md:hidden"
    >
      <RouterLink
        v-for="item in NAV_ITEMS"
        :key="item.to"
        :to="item.to"
        :aria-current="isActive(item) ? 'page' : undefined"
        :class="
          cn(
            'relative flex flex-1 flex-col items-center gap-1 py-2.5 text-[10px] font-medium transition-colors',
            isActive(item) ? 'text-brand-600 dark:text-brand-300' : 'text-fg-subtle',
          )
        "
      >
        <UIcon :name="item.icon" class="size-5 shrink-0" />
        {{ item.label }}
      </RouterLink>
    </nav>
  </div>
</template>
