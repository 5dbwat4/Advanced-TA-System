<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { RouterLink, RouterView, useRoute, useRouter } from 'vue-router'
import type { DropdownMenuItem } from '@nuxt/ui'

import AvatarImage from '@/components/ui/AvatarImage.vue'
import IconAction from '@/components/ui/IconAction.vue'
import Logo from '@/components/ui/Logo.vue'
import ThemeToggle from '@/components/ui/ThemeToggle.vue'
import { fetchMyAccounts, switchMyAccount, type LoginCandidate } from '@/lib/api'
import { useAuthStore } from '@/lib/auth'
import { getErrorMessage } from '@/lib/error'
import { MOBILE_NAV_ITEMS, MORE_PATH, NAV_ITEMS, isMoreSection, isNavItemActive, type NavItem } from '@/lib/nav'
import { useAppStore, useCurrentClassComputed, useHasXzzdPermission } from '@/lib/store'
import { toast } from '@/lib/toast'
import { cn } from '@/lib/utils'
import { getZjuamCredential } from '@/lib/zjuam'
import { UButton, UDropdownMenu, UIcon, UTooltip } from '@/ui'

const ROLE_LABELS: Record<LoginCandidate['role'], string> = {
  TA: '助教',
  TEACHER: '教师',
  VIEWER: '观察者',
  STUDENT: '学生',
}

const auth = useAuthStore()
const app = useAppStore()
const route = useRoute()
const router = useRouter()

const currentClass = useCurrentClassComputed()
const classes = computed(() => auth.user?.classes ?? [])
const pathname = computed(() => route.path)
const moreActive = computed(() => isMoreSection(pathname.value))
const hasXzzd = computed(() => useHasXzzdPermission())

const accounts = ref<LoginCandidate[]>([])
const switching = ref(false)

const accountOptions = computed<LoginCandidate[]>(() => {
  if (accounts.value.length > 0) return accounts.value
  const user = auth.user
  if (!user) return []
  return [
    {
      userId: user.id,
      name: user.name,
      studentId: user.studentId,
      classId: user.classId,
      className: currentClass.value?.name ?? null,
      role: user.role,
    },
  ]
})

const classMenuItems = computed<DropdownMenuItem[][]>(() => {
  if (accountOptions.value.length === 0) return []
  return [
    accountOptions.value.map((item) => ({
      label: item.className ?? '未绑定班级',
      description: ROLE_LABELS[item.role],
      icon: item.userId === auth.user?.id ? 'i-lucide-check' : undefined,
      onSelect: () => {
        void switchCourse(item)
      },
    })),
  ]
})

const userMenuItems = computed<DropdownMenuItem[][]>(() => {
  const user = auth.user
  const groups: DropdownMenuItem[][] = [
    [
      {
        label: user?.name ?? '未登录',
        description: user?.username ? `@${user.username}` : '—',
        type: 'label',
      },
    ],
  ]

  const actions: DropdownMenuItem[] = [
    {
      label: '设置',
      icon: 'i-lucide-settings-2',
      onSelect: () => {
        void router.push('/console/settings')
      },
    },
  ]

  if (user?.role === 'VIEWER') {
    actions.push({
      label: '观察者首页',
      icon: 'i-lucide-eye',
      onSelect: () => {
        void router.push('/viewer')
      },
    })
  }

  actions.push({
    label: '退出登录',
    icon: 'i-lucide-log-out',
    color: 'error',
    onSelect: handleLogout,
  })

  groups.push(actions)
  return groups
})

watch(
  () => auth.user?.id,
  (_id, _previousId, onCleanup) => {
    let cancelled = false
    onCleanup(() => {
      cancelled = true
    })
    fetchMyAccounts()
      .then((res) => {
        if (!cancelled) accounts.value = res.accounts
      })
      .catch(() => undefined)
  },
  { immediate: true },
)

watch(
  [classes, currentClass],
  () => {
    const list = classes.value
    if (list.length === 0) {
      app.setCurrentClassId(null)
    } else if (!list.some((item) => item.id === currentClass.value?.id)) {
      app.setCurrentClassId(list[0].id)
    }
  },
  { immediate: true },
)

onMounted(() => {
  app.syncLocalCredential()
  if (getZjuamCredential() || auth.user?.hasZjuamPassword) {
    void app.loadZjuamCourses()
  }
})

function isActive(item: NavItem): boolean {
  return isNavItemActive(item, pathname.value)
}

async function switchCourse(account: LoginCandidate) {
  if (account.userId === auth.user?.id) {
    if (account.classId) app.setCurrentClassId(account.classId)
    return
  }

  switching.value = true
  try {
    const result = await switchMyAccount(account.userId)
    auth.adoptSession(result)
    if (result.user.classId) app.setCurrentClassId(result.user.classId)
    if (result.user.role === 'STUDENT') {
      await router.replace('/home')
    } else {
      toast.success(`已切换到 ${account.className ?? '新课程'}`)
    }
  } catch (error) {
    toast.error(getErrorMessage(error, '切换课程失败'))
  } finally {
    switching.value = false
  }
}

function handleLogout() {
  auth.logout()
  toast.success('已退出登录')
  void router.replace('/login')
}
</script>

<template>
  <div class="flex min-h-screen">
    <aside
      :class="
        cn(
          'fixed inset-y-0 left-0 z-40 hidden flex-col border-r border-line bg-elevated/60 backdrop-blur-xl transition-[width] duration-300 md:flex',
          app.sidebarCollapsed ? 'w-16' : 'w-60',
        )
      "
    >
      <div
        :class="
          cn(
            'flex h-16 items-center gap-3',
            app.sidebarCollapsed ? 'justify-center px-0' : 'px-5',
          )
        "
      >
        <Logo :size="36" />
        <div v-if="!app.sidebarCollapsed" class="leading-tight">
          <div class="text-sm font-bold tracking-tight">ATASAAS</div>
          <div class="text-[10px] font-medium tracking-widest text-fg-subtle">
            Yet another TA System
          </div>
        </div>
      </div>

      <nav
        :class="cn('mt-4 flex flex-1 flex-col gap-1', app.sidebarCollapsed ? 'px-2' : 'px-3')"
      >
        <UTooltip
          v-for="item in NAV_ITEMS"
          :key="item.to"
          :text="item.label"
          :disabled="!app.sidebarCollapsed"
          :delay-duration="0"
          :content="{ side: 'right' }"
        >
          <RouterLink
            :to="item.to"
            :aria-current="isActive(item) ? 'page' : undefined"
            :class="
              cn(
                'group relative flex items-center gap-3 rounded-xl py-2.5 text-sm font-medium transition-colors',
                app.sidebarCollapsed ? 'justify-center px-0' : 'px-3',
                isActive(item) ? 'text-fg' : 'text-fg-muted hover:text-fg',
              )
            "
          >
            <span
              v-if="isActive(item)"
              class="absolute inset-0 rounded-xl bg-brand-500/10 ring-1 ring-brand-500/25 dark:bg-brand-400/10"
            />
            <UIcon
              :name="item.icon"
              :class="
                cn(
                  'relative size-[18px] shrink-0 transition-colors',
                  isActive(item)
                    ? 'text-brand-600 dark:text-brand-300'
                    : 'group-hover:text-fg',
                )
              "
            />
            <span v-if="!app.sidebarCollapsed" class="relative">{{ item.label }}</span>
            <span
              v-if="isActive(item) && !app.sidebarCollapsed"
              class="absolute right-3 size-1.5 rounded-full bg-amber-500"
            />
          </RouterLink>
        </UTooltip>
      </nav>

      <div :class="cn('border-t border-line', app.sidebarCollapsed ? 'p-2' : 'p-3')">
        <div v-if="app.sidebarCollapsed" class="flex flex-col items-center gap-1">
          <UDropdownMenu :items="userMenuItems" :content="{ side: 'right', align: 'start' }">
            <button
              type="button"
              aria-label="账号菜单"
              class="cursor-pointer rounded-full outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
            >
              <AvatarImage :id="auth.user?.avatar ?? null" :size="36">
                <template #fallback>{{ auth.user?.username?.slice(0, 1) ?? '·' }}</template>
              </AvatarImage>
            </button>
          </UDropdownMenu>
          <span @click="handleLogout">
            <IconAction label="退出登录" placement="right">
              <UIcon name="i-lucide-log-out" class="size-4 shrink-0 text-fg-muted" />
            </IconAction>
          </span>
        </div>
        <UDropdownMenu
          v-else
          :items="userMenuItems"
          :content="{ side: 'right', align: 'end' }"
        >
          <button
            type="button"
            class="flex w-full cursor-pointer items-center gap-3 rounded-xl px-2 py-2 text-left transition-colors hover:bg-sunken outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
          >
            <AvatarImage :id="auth.user?.avatar ?? null" :size="36">
              <template #fallback>{{ auth.user?.username?.slice(0, 1) ?? '·' }}</template>
            </AvatarImage>
            <div class="min-w-0 flex-1 leading-tight">
              <div class="truncate text-sm font-semibold">{{ auth.user?.name ?? '未登录' }}</div>
              <div class="truncate text-xs text-fg-subtle">
                {{ auth.user?.username ? `@${auth.user.username}` : '—' }}
              </div>
            </div>
            <UIcon name="i-lucide-chevron-down" class="size-4 shrink-0 text-fg-subtle" />
          </button>
        </UDropdownMenu>
      </div>
    </aside>

    <div
      :class="
        cn(
          'flex min-h-screen min-w-0 flex-1 flex-col transition-[padding] duration-300',
          app.sidebarCollapsed ? 'md:pl-16' : 'md:pl-60',
        )
      "
    >
      <header
        class="glass sticky top-0 z-30 flex h-16 items-center justify-between border-b border-line px-4 md:px-8"
      >
        <div class="flex items-center gap-3 md:hidden">
          <Logo :size="32" />
          <span class="text-sm font-bold">ATASAAS</span>
        </div>
        <div class="hidden md:inline-flex">
          <span @click="app.toggleSidebar()">
            <IconAction
              :label="app.sidebarCollapsed ? '展开侧边栏' : '折叠侧边栏'"
              placement="bottom"
            >
              <UIcon
                :name="
                  app.sidebarCollapsed ? 'i-lucide-panel-left-open' : 'i-lucide-panel-left-close'
                "
                class="size-[18px] shrink-0 text-fg-muted"
              />
            </IconAction>
          </span>
        </div>
        <div class="flex items-center gap-1">
          <UIcon
            v-if="hasXzzd"
            name="i-lucide-school"
            class="size-3.5 shrink-0 text-brand-600 dark:text-brand-300"
          />
          <UDropdownMenu
            v-if="accountOptions.length > 0"
            :items="classMenuItems"
            :disabled="switching"
            :content="{ align: 'end' }"
          >
            <UButton
              aria-label="选择班级"
              size="sm"
              color="neutral"
              variant="soft"
              :loading="switching"
              trailing-icon="i-lucide-chevron-down"
              class="max-w-[10rem] md:max-w-[14rem]"
            >
              <span class="truncate">{{ currentClass?.name ?? '选择班级' }}</span>
            </UButton>
          </UDropdownMenu>
          <UButton
            v-else
            aria-label="选择班级"
            size="sm"
            color="neutral"
            variant="soft"
            disabled
          >
            未绑定班级
          </UButton>
          <ThemeToggle />
          <div class="md:hidden">
            <span @click="handleLogout">
              <IconAction label="退出登录">
                <UIcon name="i-lucide-log-out" class="size-4 shrink-0" />
              </IconAction>
            </span>
          </div>
        </div>
      </header>

      <nav
        class="glass fixed inset-x-0 bottom-0 z-40 flex items-stretch justify-around border-t border-line pb-[env(safe-area-inset-bottom)] md:hidden"
      >
        <RouterLink
          v-for="item in MOBILE_NAV_ITEMS"
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
          <span
            v-if="isActive(item)"
            class="absolute -top-px h-0.5 w-10 rounded-full bg-gradient-to-r from-brand-500 to-amber-500"
          />
          <UIcon :name="item.icon" class="size-5 shrink-0" />
          {{ item.label }}
        </RouterLink>
        <RouterLink
          :to="MORE_PATH"
          :aria-current="moreActive ? 'page' : undefined"
          :class="
            cn(
              'relative flex flex-1 flex-col items-center gap-1 py-2.5 text-[10px] font-medium transition-colors',
              moreActive ? 'text-brand-600 dark:text-brand-300' : 'text-fg-subtle',
            )
          "
        >
          <span
            v-if="moreActive"
            class="absolute -top-px h-0.5 w-10 rounded-full bg-gradient-to-r from-brand-500 to-amber-500"
          />
          <UIcon name="i-lucide-ellipsis" class="size-5 shrink-0" />
          更多
        </RouterLink>
      </nav>

      <main class="flex-1 px-4 pb-24 pt-6 md:px-8 md:pb-10">
        <RouterView />
      </main>
    </div>
  </div>
</template>
