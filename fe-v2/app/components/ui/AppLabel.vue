<script setup lang="ts">
/**
 * AppLabel —— HeroUI v3 `Label` 的兼容层（3 处 + MIGRATION.md 表格里记的 18 处表单标签）
 *
 * ⚠️ 已用 Nuxt UI MCP 核实：**Nuxt UI v4 没有 `ULabel` 组件**
 *    （`get-component('Label')` → 404；`search-components({ search: 'label' })`
 *    只返回 Badge / FormField / Kbd 之类）。所以本组件直接渲染原生 `<label>`，
 *    好处是 `for` 与 class 透传行为完全可控。
 *
 * 为什么不写默认文字样式：旧版三处调用的语境差别很大——
 *   - `AppShell.tsx:253` 放在 Dropdown.Item 里当**纯文本容器**用（不带任何 class）
 *   - `DateTimePicker.tsx:37` 传了 `class="mb-1.5 block text-xs font-semibold text-fg-muted"`
 *   - `FocusStudents.tsx:769` 是 HeroUI **Autocomplete 内置的浮动标签**
 *     （`<Label>学生</Label>` 直接作为 Autocomplete 的子节点，不是独立标签）
 * 给默认类反而会在这三处打架，所以一律由页面自己写 class。
 *
 * ⚠️ Phase B 迁 `pages/FocusStudents.tsx` 时注意：
 *    `USelectMenu` / `UCommandPalette` 都没有「浮动 label」这个能力，
 *    `<AppLabel>学生</AppLabel>` 这个写法无法 1:1 翻译，
 *    建议改成上方一个普通文字标签 + `placeholder`（属允许的轻微差异）。
 */
const props = defineProps<{
  for?: string
}>()
</script>

<template>
  <label :for="props.for" class="inline-block">
    <slot />
  </label>
</template>
