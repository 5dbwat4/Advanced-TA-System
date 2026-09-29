<script setup lang="ts">
/**
 * console 布局 —— 逐行移植自 `fe/src/components/layout/AppShell.tsx`（327 行）
 *
 * ────────────────────────────────────────────────────────────────────────
 * 一、迁移动作对照（逐处）
 * ────────────────────────────────────────────────────────────────────────
 * 旧 React                          | 新 Vue / Nuxt UI
 * ----------------------------------|------------------------------------------
 * react-router 的 `NavLink` +        | `NuxtLink` + `useRoute().path`，
 * `useLocation().pathname` +         | 激活态**统一**走 `nav.ts` 的
 * NavLink 自带的 `end` / active 类   | `isNavItemActive(item, path)`（不用
 *                                   | NuxtLink 自带的 router-link-active 类，
 *                                   | 保证侧栏 / 底部导航 / 「更多」页三处
 *                                   | 判定完全一致）
 * `<Outlet />`                      | `<slot />`
 * `useAuth()` (Context)             | `useAuthStore()`（Pinia）
 * `useAppStore(sel => sel.x)`       | `useAppStore()` + computed（Pinia 直接
 *                                   | 解构 state 会丢响应式，所以不解构）
 * `useCurrentClass()` /             | 同名 composable（内部读两个 store）
 * `useHasXzzdPermission()`          |
 * `Dropdown` + `Dropdown.Popover` + | `UDropdownMenu` + `items`（checkbox 项，
 * `Dropdown.Menu selectionMode=`     | 勾选标记由组件自带的 ItemIndicator 渲染；
 * `single` + `Dropdown.Item` +      | MCP 已核实 `UDropdownMenu` **没有**
 * `Dropdown.ItemIndicator`          | `modelValue`，只能靠 item 的
 *                                   | `onSelect` / `onUpdateChecked` 回调）
 * `Tooltip delay={0} showArrow      | `AppTooltip`（默认 delay 0 + arrow）
 *  placement="right"`               |
 * `nav.navigate('/login', {replace})` | `navigateTo('/login', { replace: true })`
 *
 * ────────────────────────────────────────────────────────────────────────
 * 二、动效（§4.4-A / B）
 * ────────────────────────────────────────────────────────────────────────
 * 1) `layoutId="nav-active"`（侧栏激活背景块）+ spring → `layout-id="nav-active"`
 * 2) `layoutId="nav-dot"`（侧栏激活小圆点）          → `layout-id="nav-dot"`
 * 3) `layoutId="mobile-nav-pill"`（移动端底部指示条）→ `layout-id="mobile-nav-pill"`
 * 三者各自都在**同一棵子树**里同时只存在一个实例（v-if），motion-v 官方的
 * `<motion.div v-if="isSelected" layoutId="underline" />` tab 下划线就是这个模式，
 * 因此**不需要**额外套 `<LayoutGroup>`（跨 DOM 分支共享才需要）。
 * 4) 按钮按压反馈由 `main.css` 末尾的全局 `:active { scale: .97 }` 兜底提供。
 */
import type { DropdownMenuItem } from '@nuxt/ui'
import { motion } from 'motion-v'

import ChevronDown from '~icons/lucide/chevron-down'
import Cpu from '~icons/lucide/cpu'
import Ellipsis from '~icons/lucide/ellipsis'
import LogOut from '~icons/lucide/log-out'
import PanelLeftClose from '~icons/lucide/panel-left-close'
import PanelLeftOpen from '~icons/lucide/panel-left-open'
import School from '~icons/lucide/school'

import { MOBILE_NAV_ITEMS, MORE_PATH, NAV_ITEMS, isMoreSection, isNavItemActive } from '~/lib/nav'
import { cn } from '~/lib/utils'
import { getZjuamCredential } from '~/lib/zjuam'

const route = useRoute()
const toast = useToasts()

const auth = useAuthStore()
const appStore = useAppStore()

// Pinia：state 不能直接解构（会丢响应性），统一走 computed
const user = computed(() => auth.user)
const classes = computed(() => auth.user?.classes ?? [])
const sidebarCollapsed = computed(() => appStore.sidebarCollapsed)

const currentClass = useCurrentClass()
const hasXzzd = useHasXzzdPermission()

/** AppShell.tsx:106 —— 激活背景块的 spring，参数逐字照搬 */
const NAV_ACTIVE_TRANSITION = { type: 'spring', stiffness: 400, damping: 32 }

// ── 第一个 useEffect：没有班级 → 清空当前班级；当前班级不在列表里 → 选第一个 ──
watchEffect(() => {
  if (classes.value.length === 0) {
    appStore.setCurrentClassId(null)
  } else if (!classes.value.some((item) => item.id === currentClass.value?.id)) {
    appStore.setCurrentClassId(classes.value[0].id)
  }
})

// ── 第二个 useEffect：同步本地 zjuam 凭据标记 + 有凭据/密码时拉教务课程 ──
// 旧版 deps = [syncLocalCredential, loadZjuamCourses, hasZjuamPassword]，
// 前两个是 zustand 的稳定引用，真正的触发源只有 hasZjuamPassword。
// 这里把「本地凭据标记」也放进依赖（它由 syncLocalCredential 自己写回，值不变时
// 不会重复触发），并用 immediate 保证挂载即跑一次；loadZjuamCourses 内部对
// loading / ready 状态去重，重复触发不会重复请求，课程切换更不会误触发。
watch(
  [() => auth.user?.hasZjuamPassword, () => appStore.hasLocalCredential],
  ([hasZjuamPassword, hasLocalCredential]) => {
    appStore.syncLocalCredential()
    if (hasLocalCredential || Boolean(getZjuamCredential()) || hasZjuamPassword) {
      void appStore.loadZjuamCourses()
    }
  },
  { immediate: true },
)

/** 「更多」分区高亮（底部导航最后一项） */
const moreActive = computed(() => isMoreSection(route.path))

/** 桌面侧栏条目 + 激活态（判定统一走 nav.ts） */
const navItems = computed(() => NAV_ITEMS.map((item) => ({ item, active: isNavItemActive(item, route.path) })))
/** 移动端底部导航条目 + 激活态 */
const mobileNavItems = computed(() =>
  MOBILE_NAV_ITEMS.map((item) => ({ item, active: isNavItemActive(item, route.path) })),
)

function setCurrentClassId(id: string | null) {
  appStore.setCurrentClassId(id)
}

/**
 * 班级切换下拉（← Dropdown + Dropdown.Menu selectionMode="single"）。
 * MCP 核实结论：
 *   - `UDropdownMenu` **没有** modelValue / `update:modelValue`，没有受控单选模式；
 *   - checkbox 形态的 item 走 `DropdownMenu.CheckboxItem`，`checked` 受控于
 *     `item.checked`，回调用 `onUpdateChecked(checked)` 与 `onSelect(e)`；
 *   - 勾选标记（`DropdownMenu.ItemIndicator`）由组件自带，位置在**行尾**
 *     （HeroUI 在行首，属可接受的轻微差异）。
 * 勾选态始终由 store 派生 → 单选语义天然成立；两个回调都指向同一个
 * setCurrentClassId，重复触发无副作用。不 preventDefault，选中后菜单收起。
 */
const classItems = computed<DropdownMenuItem[]>(() =>
  classes.value.map((item) => ({
    label: item.name,
    type: 'checkbox' as const,
    checked: currentClass.value?.id === item.id,
    onSelect: () => setCurrentClassId(item.id),
    onUpdateChecked: (checked: boolean) => {
      if (checked) setCurrentClassId(item.id)
    },
  })),
)

function handleLogout() {
  auth.logout()
  toast.success('已退出登录')
  void navigateTo('/login', { replace: true })
}
</script>

<template>
  <div class="flex min-h-screen">
    <!-- Sidebar -->
    <aside
      :class="cn(
        'fixed inset-y-0 left-0 z-40 hidden flex-col border-r border-line bg-elevated/60 backdrop-blur-xl transition-[width] duration-300 md:flex',
        sidebarCollapsed ? 'w-16' : 'w-60',
      )"
    >
      <div
        :class="cn(
          'flex h-16 items-center gap-3',
          sidebarCollapsed ? 'justify-center px-0' : 'px-5',
        )"
      >
        <div class="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-brand-500 to-brand-700 text-white shadow-lg shadow-brand-500/25">
          <Cpu :width="20" :height="20" class="shrink-0" />
        </div>
        <div v-if="!sidebarCollapsed" class="leading-tight">
          <div class="text-sm font-bold tracking-tight">TA 助教台</div>
          <div class="text-[10px] font-medium uppercase tracking-widest text-fg-subtle">
            ZJU · CS-II
          </div>
        </div>
      </div>

      <nav :class="cn('mt-4 flex flex-1 flex-col gap-1', sidebarCollapsed ? 'px-2' : 'px-3')">
        <!-- 折叠态才需要 tooltip：用 AppTooltip 的 disabled 开关代替旧版的两套 JSX -->
        <AppTooltip
          v-for="{ item, active } in navItems"
          :key="item.to"
          placement="right"
          :delay="0"
          :disabled="!sidebarCollapsed"
        >
          <NuxtLink
            :to="item.to"
            :aria-current="active ? 'page' : undefined"
            :class="cn(
              'group relative flex items-center gap-3 rounded-xl py-2.5 text-sm font-medium transition-colors',
              sidebarCollapsed ? 'justify-center px-0' : 'px-3',
              active ? 'text-fg' : 'text-fg-muted hover:text-fg',
            )"
          >
            <motion.span
              v-if="active"
              layout-id="nav-active"
              class="absolute inset-0 rounded-xl bg-brand-500/10 ring-1 ring-brand-500/25 dark:bg-brand-400/10"
              :transition="NAV_ACTIVE_TRANSITION"
            />
            <component
              :is="item.icon"
              :width="18"
              :height="18"
              :class="cn(
                'shrink-0 relative transition-colors',
                active ? 'text-brand-600 dark:text-brand-300' : 'group-hover:text-fg',
              )"
            />
            <span v-if="!sidebarCollapsed" class="relative">{{ item.label }}</span>
            <motion.span
              v-if="active && !sidebarCollapsed"
              layout-id="nav-dot"
              class="absolute right-3 h-1.5 w-1.5 rounded-full bg-amber-500"
            />
          </NuxtLink>
          <template #content>
            {{ item.label }}
          </template>
        </AppTooltip>
      </nav>

      <div :class="cn('border-t border-line', sidebarCollapsed ? 'p-2' : 'p-3')">
        <div v-if="sidebarCollapsed" class="flex flex-col items-center gap-1">
          <AppTooltip placement="right" :delay="0">
            <div class="flex h-9 w-9 items-center justify-center rounded-full bg-amber-500/15 text-sm font-bold text-amber-600 dark:text-amber-400">
              {{ user?.username?.slice(0, 1) ?? '·' }}
            </div>
            <template #content>
              {{ user?.username ?? '未登录' }}
            </template>
          </AppTooltip>
          <AppButton is-icon-only variant="ghost" size="sm" aria-label="退出登录" @press="handleLogout">
            <LogOut :width="16" :height="16" class="shrink-0 text-fg-muted" />
          </AppButton>
        </div>
        <div v-else class="flex items-center gap-3 rounded-xl px-2 py-2">
          <div class="flex h-9 w-9 items-center justify-center rounded-full bg-amber-500/15 text-sm font-bold text-amber-600 dark:text-amber-400">
            {{ user?.username?.slice(0, 1) ?? '·' }}
          </div>
          <div class="min-w-0 flex-1 leading-tight">
            <div class="truncate text-sm font-semibold">{{ user?.username ?? '未登录' }}</div>
            <div class="truncate text-xs tabular text-fg-subtle">
              {{ user?.studentId ?? '—' }}
            </div>
          </div>
          <AppButton is-icon-only variant="ghost" size="sm" aria-label="退出登录" @press="handleLogout">
            <LogOut :width="16" :height="16" class="shrink-0 text-fg-muted" />
          </AppButton>
        </div>
      </div>
    </aside>

    <!-- Main column -->
    <div
      :class="cn(
        'flex min-h-screen min-w-0 flex-1 flex-col transition-[padding] duration-300',
        sidebarCollapsed ? 'md:pl-16' : 'md:pl-60',
      )"
    >
      <header class="glass sticky top-0 z-30 flex h-16 items-center justify-between border-b border-line px-4 md:px-8">
        <div class="flex items-center gap-3 md:hidden">
          <div class="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-brand-500 to-brand-700 text-white">
            <Cpu :width="16" :height="16" class="shrink-0" />
          </div>
          <span class="text-sm font-bold">TA 助教台</span>
        </div>
        <AppButton
          is-icon-only
          variant="ghost"
          size="sm"
          class="hidden md:inline-flex"
          :aria-label="sidebarCollapsed ? '展开侧边栏' : '折叠侧边栏'"
          @press="appStore.toggleSidebar()"
        >
          <PanelLeftOpen v-if="sidebarCollapsed" :width="18" :height="18" class="shrink-0 text-fg-muted" />
          <PanelLeftClose v-else :width="18" :height="18" class="shrink-0 text-fg-muted" />
        </AppButton>
        <div class="flex items-center gap-1">
          <School
            v-if="hasXzzd"
            :width="14"
            :height="14"
            class="shrink-0 text-brand-600 dark:text-brand-300"
          />
          <AppButton v-if="classes.length === 0" aria-label="选择班级" size="sm" variant="secondary" is-disabled>
            未绑定班级
          </AppButton>
          <UDropdownMenu v-else :items="classItems">
            <AppButton aria-label="选择班级" size="sm" variant="secondary" class="max-w-[10rem] md:max-w-[14rem]">
              <span class="truncate">{{ currentClass?.name ?? '选择班级' }}</span>
              <ChevronDown :width="14" :height="14" class="shrink-0 text-fg-subtle" />
            </AppButton>
          </UDropdownMenu>
          <ThemeToggle />
          <AppButton is-icon-only variant="ghost" size="sm" class="md:hidden" aria-label="退出登录" @press="handleLogout">
            <LogOut :width="16" :height="16" class="shrink-0" />
          </AppButton>
        </div>
      </header>

      <!-- Mobile bottom nav -->
      <nav class="glass fixed inset-x-0 bottom-0 z-40 flex items-stretch justify-around border-t border-line pb-[env(safe-area-inset-bottom)] md:hidden">
        <NuxtLink
          v-for="{ item, active } in mobileNavItems"
          :key="item.to"
          :to="item.to"
          :aria-current="active ? 'page' : undefined"
          :class="cn(
            'relative flex flex-1 flex-col items-center gap-1 py-2.5 text-[10px] font-medium transition-colors',
            active ? 'text-brand-600 dark:text-brand-300' : 'text-fg-subtle',
          )"
        >
          <motion.span
            v-if="active"
            layout-id="mobile-nav-pill"
            class="absolute -top-px h-0.5 w-10 rounded-full bg-gradient-to-r from-brand-500 to-amber-500"
          />
          <component :is="item.icon" :width="20" :height="20" class="shrink-0" />
          {{ item.label }}
        </NuxtLink>
        <NuxtLink
          :to="MORE_PATH"
          :aria-current="moreActive ? 'page' : undefined"
          :class="cn(
            'relative flex flex-1 flex-col items-center gap-1 py-2.5 text-[10px] font-medium transition-colors',
            moreActive ? 'text-brand-600 dark:text-brand-300' : 'text-fg-subtle',
          )"
        >
          <motion.span
            v-if="moreActive"
            layout-id="mobile-nav-pill"
            class="absolute -top-px h-0.5 w-10 rounded-full bg-gradient-to-r from-brand-500 to-amber-500"
          />
          <Ellipsis :width="20" :height="20" class="shrink-0" />
          更多
        </NuxtLink>
      </nav>

      <main class="flex-1 px-4 pb-24 pt-6 md:px-8 md:pb-10">
        <slot />
      </main>
    </div>
  </div>
</template>
