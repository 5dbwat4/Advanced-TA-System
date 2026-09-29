<script setup lang="ts">
/**
 * 「更多」页 —— 逐行移植自 `fe/src/pages/More.tsx`（66 行）
 *
 * ────────────────────────────────────────────────────────────────────────
 * 迁移动作对照
 * ────────────────────────────────────────────────────────────────────────
 * 1) `ListBox selectionMode="none" onAction={(key) => navigate(String(key))}`
 *    → `UListbox` + 每个 item 的 `onSelect`（MCP 核实：`UDropdownMenu`/`UListbox`
 *      的 item 都支持 `onSelect?: (e: Event) => void`，鼠标点击与键盘 Enter
 *      都会触发，与 HeroUI `onAction` 语义一致）。保留键盘上下键漫游焦点。
 * 2) `ListBox.Item` 的 `className` 写进 item 的 `class` 字段：UListbox 的 item
 *    会把 `[props.ui?.item, item.ui?.item, item.class]` 交给 tailwind-variants 的
 *    `cnMerge`（内含 tailwind-merge），所以旧版的 `px-3 py-3 / gap-3 /
 *    items-center` 能覆盖 Nuxt 默认的 `p-1.5 / gap-1.5 / items-start`。
 * 3) `item.icon` 是 Vue 组件（不是 Iconify 字符串），所以整块内容用 `#item`
 *    作用域插槽渲染（`#item` 只替换 item 内部内容，item 自身的 class 仍然生效）。
 * 4) `:highlight-on-hover="false"`：Nuxt 默认 hover 时会加一层
 *    `before:bg-elevated/50` 叠色，旧版没有这层，只保留 `hover:bg-sunken/60`；
 *    键盘导航时的高亮仍在（`data-highlighted`），属于净收益。
 * 5) 旧版页面**没有**额外入口（没有「使用指南/条款」）、也没有底部退出登录按钮，
 *    这里严格按源文件实现，不自行添加。
 */
import type { ListboxItem } from '@nuxt/ui'

import ChevronRight from '~icons/lucide/chevron-right'

import { NAV_ITEMS, isNavItemActive, type IconComponent } from '~/lib/nav'
import { cn } from '~/lib/utils'

definePageMeta({ layout: 'console' })

const route = useRoute()

/** items 里额外挂了 nav 的原始条目（图标组件 + 激活态），ListboxItem 没有这两个字段 */
type MoreItem = ListboxItem & { active: boolean; iconComponent: IconComponent }

const items = computed<MoreItem[]>(() =>
  NAV_ITEMS.map((item) => {
    const active = isNavItemActive(item, route.path)
    return {
      label: item.label,
      description: item.description,
      value: item.to,
      active,
      iconComponent: item.icon,
      // 旧版 ListBox.Item 的 className，逐字搬运
      class: cn(
        'flex cursor-pointer items-center gap-3 rounded-xl px-3 py-3 transition-colors',
        active ? 'bg-brand-500/10 ring-1 ring-brand-500/25' : 'hover:bg-sunken/60',
      ),
      // 旧版 onAction={(key) => navigate(String(key))}
      onSelect: () => navigateTo(item.to),
    }
  }),
)
</script>

<template>
  <div class="mx-auto max-w-2xl">
    <PageHeader title="更多" />

    <!--
      Card 内部固定带 `p-5`，旧版是用 cn(className) 把内边距覆盖成 p-2 sm:p-3 的；
      Card.vue 目前直接把父级 class 合并进来（不走 tailwind-merge），所以这里用
      Tailwind v4 的 important 修饰符（写在末尾）保证内边距与旧版一致。
      TODO（Phase B 复核）：让 Card.vue 内部改用 cn() 合并 class，届时去掉这里的 `!`
    -->
    <Card :index="0" class="!p-2 sm:!p-3">
      <UListbox :items="items" aria-label="全部功能" class="w-full" :highlight-on-hover="false">
        <template #item="{ item }">
          <span
            :class="cn(
              'flex h-10 w-10 shrink-0 items-center justify-center rounded-xl',
              item.active
                ? 'bg-gradient-to-br from-brand-500 to-brand-700 text-white shadow-lg shadow-brand-500/25'
                : 'bg-gradient-to-br from-brand-500/15 to-amber-500/10 text-brand-600 dark:text-brand-300',
            )"
          >
            <component :is="item.iconComponent" :width="18" :height="18" class="shrink-0" />
          </span>
          <span class="flex min-w-0 flex-1 flex-col">
            <span
              :class="cn(
                'text-sm font-semibold',
                item.active ? 'text-brand-600 dark:text-brand-300' : 'text-fg',
              )"
            >
              {{ item.label }}
            </span>
            <span class="truncate text-xs text-fg-subtle">{{ item.description }}</span>
          </span>
          <ChevronRight :width="16" :height="16" class="ms-auto shrink-0 text-fg-subtle" />
        </template>
      </UListbox>
    </Card>
  </div>
</template>
