<script setup lang="ts">
/**
 * EmptyState —— 逐字移植自 `fe/src/components/ui/Card.tsx` 的 `EmptyState`
 * （旧版与 Card 同文件，现已拆成独立 SFC；类名与结构 1:1）
 *
 * 无 Nuxt UI 底层组件：旧版本来就是手写的 div 结构，没有对应的 HeroUI 组件，
 * 也没有值得引入的 Nuxt UI 组件（MIGRATION.md §4.1 的映射表里没列它）。
 *
 * prop：
 *   icon —— `~icons/lucide/*` 组件（类型取自 app/lib/nav.ts 的 IconComponent）
 *   title / hint —— 文案
 */
import type { IconComponent } from '~/lib/nav'

defineProps<{
  icon: IconComponent
  title: string
  hint?: string
}>()
</script>

<template>
  <div class="rounded-2xl border border-dashed border-line p-12 text-center">
    <div class="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-sunken text-fg-subtle">
      <component :is="icon" :width="20" :height="20" class="shrink-0" />
    </div>
    <div class="mt-3 text-sm font-semibold text-fg">{{ title }}</div>
    <div v-if="hint" class="mt-1 text-xs text-fg-subtle">{{ hint }}</div>
  </div>
</template>
