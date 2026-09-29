<script setup lang="ts">
/**
 * AppTabs —— HeroUI v3 `Tabs` → Nuxt UI v4 `UTabs` 的兼容层（9 处）
 *
 * ────────────────────────────────────────────────────────────────────────
 * 旧版结构（`@heroui/react@3.2.6`，源码 `dist/components/tabs/tabs.js` +
 * `dist/components/tabs.css` 实际类名）
 *
 *   <Tabs selectedKey onSelectionChange>
 *     <Tabs.ListContainer>            → .tabs__list-container
 *                                    relative bg-default，圆角 calc(var(--radius)*2.5)
 *                                    （内部还包一层 ScrollShadow + 左右滚动箭头）
 *       <Tabs.List aria-label>        → .tabs__list
 *                                    inline-flex p-1；horizontal 时 w-max min-w-full
 *         <Tabs.Tab id>              → .tabs__tab
 *                                    relative flex h-8 w-full items-center justify-center
 *                                    rounded-3xl px-4 text-sm font-medium text-muted
 *                                    [data-selected] → text-segment-foreground
 *           <Tabs.Indicator />        → .tabs__indicator
 *                                    absolute start-0 top-0 size-full rounded-3xl
 *                                    bg-segment shadow-surface，z-index:-1，
 *                                    transition 250ms ease-out-fluid（translate/width/height）
 *       </Tabs.List>
 *     </Tabs.ListContainer>
 *     <Tabs.Panel id className>       → .tabs__panel  w-full p-2，horizontal 时 mt-4
 *   </Tabs>
 *
 * ────────────────────────────────────────────────────────────────────────
 * 新版结构（Nuxt UI `UTabs`，已用 MCP `get-component Tabs` + 读
 * `node_modules/@nuxt/ui/dist/runtime/components/Tabs.vue` 核实）
 *
 *   <UTabs v-model :items :ui>
 *     <template #default>  { item, index }        → 触发器文字（AppTabs 的 #tab）
 *     <template #leading>  { item, index, ui }    → 触发器图标
 *     <template #content>  { item, index, ui }    → 面板内容（AppTabs 的 #panel）
 *   </UTabs>
 *
 * 合并后的结构：UTabs 的 TabsList 同时充当旧版 `.tabs__list-container`，
 * 内部触发器同时充当旧版 `.tabs__list`（`ui.list` 负责底板圆角/底色）。
 * 招牌的胶囊指示器由 `UTabs` 内置的 `<TabsIndicator>` 提供（不是手写 DOM），
 * 位置/尺寸/动画由 reka 计算，我们只用 `ui.indicator` 改外观 —— 这就是
 * 「旧版 `Tabs.Indicator` 招牌视觉」的复现方式。
 *
 * ────────────────────────────────────────────────────────────────────────
 * prop / emit 映射
 *   旧 selectedKey   → v-model（modelValue）    旧 onSelectionChange → @update:modelValue
 *   旧 Tabs.Tab id   → items[].value            旧 <Tabs.Tab>文字     → items[].label
 *   旧 <Tabs.Indicator/>（每个 Tab 里手写一份）→ UTabs 内置，无需页面再写
 *   旧 Tabs.ListContainer/List 包裹             → UTabs 内部，页面不用写
 *   旧 Tabs.Panel id className="pt-4"          → #panel 插槽（pt-4 已并入 ui.content）
 *   旧 Tabs.List aria-label="题库视图"          → ⚠️ 无对应（见下方「已知差异」）
 *
 * ────────────────────────────────────────────────────────────────────────
 * 「迁页面时注意」
 *
 * 1. `selectedKey` → `v-model`：
 *      <!-- 旧 -->
 *      <Tabs selectedKey={tab} onSelectionChange={(key) => setParams(...)}>
 *      <!-- 新 -->
 *      <AppTabs v-model="tab" :items="items" />
 *    旧版 `onSelectionChange` 收到的是 `Key`（此处恒为 string），新版
 *    `update:modelValue` 在 AppTabs 里已统一 `String(...)` 成 string，可直接存。
 *
 * 2. **AppTabs 不碰路由。** `Questions` 页的 tab ↔ URL query 双向同步是
 *    页面侧的事：v-model 绑一个 `ref`，再 `watch` 两个方向
 *    （`watch(tab, v => router.replace({ query: v === 'sets' ? { tab: 'sets' } : {} }))`
 *    + `watch(route.query.tab, v => tab.value = v === 'sets' ? 'sets' : 'questions')`）。
 *
 * 3. `#panel` 插槽拿得到 `item` 与 `active`（契约形状）。注意：`UTabs` 默认
 *    `unmount-on-hide = true`，reka 的 `TabsContent` 未激活时**根本不渲染插槽**，
 *    所以插槽里的 `active` 实际恒为 `true` —— 旧版「懒渲染」的行为是自动满足的，
 *    页面不需要再手写 `v-if`；`active` 保留只是为了契约形状 + 将来若有人传
 *    `:unmount-on-hide="false"` 保留面板状态时可用。
 *
 * 4. 图标直接写 `items[].icon`（见下），**不要**再在 `#tab` 里重复画一遍。
 *
 * ────────────────────────────────────────────────────────────────────────
 * 已知差异（迁页面时可能要手工补）
 *   • 旧版 `Tabs.List` 上的 `className="max-w-xs"`（限宽）没有对应 prop；
 *     新版 `ui.list` 走 `w-max min-w-full`，会随内容撑开。要限宽就在页面外层
 *     套一个 `<div class="max-w-xs"><AppTabs ... /></div>`。
 *   • 旧版 `Tabs.List aria-label="题库视图"` 落不到 UTabs 的 TabsList 上
 *     （attrs 只会落到根 div），可访问性名称会丢；页面可用 `<nav aria-label>`/
 *     `<section>` 包一层补上。
 *   • 旧版 `Tabs.ListContainer` 自带横向滚动 + 两侧箭头（tab 多时才出现）。
 *     UTabs 没有这层，tab 很多时不再横向滚动。
 *   • 旧版激活底色是 `bg-segment`（中性浅灰），本站改为**品牌色**指示器
 *     （任务要求 + `app.config.ts` 已把 `ui.colors.primary` 指向 `brand`）。
 */
import type { Component } from 'vue'
import { computed } from 'vue'

/** 契约 items 项：`value` 对应旧版 `<Tabs.Tab id>`，`icon` 对应 tab 里的图标 */
export interface AppTabItem {
  label: string
  value: string
  icon?: Component
  disabled?: boolean
}

const props = defineProps<{
  /** v-model，对应旧版 `selectedKey`（string） */
  modelValue: string
  items: AppTabItem[]
}>()

const emit = defineEmits<{
  'update:modelValue': [value: string]
}>()

/** 当前值兜底成 string，避免页面首帧 modelValue 还没初始化时 UTabs 内部比较失败 */
const current = computed(() => String(props.modelValue ?? ''))

/**
 * UTabs 的 `default-value` 默认为 `'0'`（下标），而我们的触发器值来自
 * `items[].value`。页面忘了传 v-model 时至少要选中第一个，而不是谁都不选。
 */
const fallbackValue = computed(() => String(props.items?.[0]?.value ?? '0'))

/** 判断某一项是否激活（字符串比较，容忍页面传了 number 的 value） */
function isActive(item: AppTabItem) {
  return String(item.value) === current.value
}

/** UTabs 的 `update:modelValue` 载荷是 `string | number`，统一成契约要求的 string */
function onUpdate(value: string | number) {
  emit('update:modelValue', String(value))
}

/**
 * 外观覆盖（对齐旧版 `.tabs__*` 类名）。
 * 走 `:ui` 而非 app.config 全局改，是因为只有 Tabs 需要这套胶囊观感。
 * 类名走 tailwind-merge 与 Nuxt UI 默认值合并，同族后者胜出。
 */
const ui = {
  // 旧 .tabs（horizontal → flex-col）+ .tabs__list-container
  root: 'flex flex-col gap-2',
  list: 'relative flex w-max min-w-full items-center rounded-[calc(var(--radius)*2.5)] bg-default p-1',
  // 旧 .tabs__indicator：胶囊 + 底色 + 阴影 + 250ms 位移/宽度过渡
  // 「品牌色」= Nuxt UI 的 primary（app.config.ts: ui.colors.primary = 'brand'）
  indicator: 'absolute start-0 top-0 size-full rounded-3xl bg-primary shadow-sm transition-[translate,width,height] duration-[250ms] ease-out motion-reduce:transition-none',
  // 旧 .tabs__tab
  trigger: 'relative z-1 inline-flex h-8 w-full items-center justify-center gap-1.5 rounded-3xl px-4 text-sm font-medium text-muted transition-colors data-[state=inactive]:hover:opacity-70 data-[state=active]:text-inverted disabled:cursor-not-allowed disabled:opacity-50',
  leadingIcon: 'size-4 shrink-0',
  label: 'truncate',
  // 旧 .tabs__panel：w-full p-2 + horizontal 的 mt-4
  content: 'w-full pt-4 focus-visible:outline-none',
}
</script>

<template>
  <UTabs
    :items="items"
    :model-value="current"
    :default-value="fallbackValue"
    color="primary"
    variant="pill"
    :ui="ui"
    @update:model-value="onUpdate"
  >
    <!-- 触发器文字：UTabs 的 #default = 旧版 <Tabs.Tab> 的文字部分 -->
    <template #default="{ item }">
      <slot name="tab" :item="item" :active="isActive(item)">
        {{ item.label }}
      </slot>
    </template>

    <!--
      面板内容：UTabs 的 #content = 旧版 <Tabs.Panel>。
      不覆盖 #leading —— UTabs 默认就会读 `item.icon` 渲染 <UIcon>，
      而 UIcon 的 name 同时接受 iconify 字符串和 Vue 组件（Icon.vue 里
      `typeof name === 'string' ? <NuxtIcon> : <component :is="name">`），
      所以旧版的 ~icons/lucide/* 组件和新的 'i-lucide-*' 字符串都能直接用。
    -->
    <template #content="{ item }">
      <slot name="panel" :item="item" :active="isActive(item)" />
    </template>
  </UTabs>
</template>
