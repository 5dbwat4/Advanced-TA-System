<script setup lang="ts">
/**
 * AppChip —— HeroUI v3 `Chip` → Nuxt UI v4 `UBadge` 的兼容层（10 处）
 *
 * ⚠️ 关键结论（经 Nuxt UI MCP `get-component Chip` 核实）：
 *   Nuxt UI 的 **`UChip` 根本不是文字标签**，它是一个 4~12px 的**状态圆点**
 *   （theme: `h-8 min-w-8 rounded-full ring ring-bg bg-primary`，`size` 表示直径），
 *   默认 `absolute` 定位挂在头像/图标角上。跟 HeroUI 的文字 Chip 完全不是一回事。
 *   → 底座改用 **`UBadge`**：它是文字标签，`variant="soft"` 就是 `bg-primary/10 text-primary`，
 *     与 HeroUI `Chip variant="soft"` 的语义与观感都对得上。
 *
 * ────────────────────────────────────────────────────────────────────────
 * prop 映射
 * ────────────────────────────────────────────────────────────────────────
 * 旧 color  | AppChip color | UBadge color
 * -----------|---------------|---------------
 * accent     | primary       | primary  （HeroUI accent ≈ 本站的品牌色；app.config 已把 ui.colors.primary 指向 brand）
 * success    | success       | success
 * danger     | danger        | error    （UBadge 没有 danger，只有 error）
 * warning    | warning       | warning
 * default    | default       | neutral  （lib/experiments.ts 的 status.color 会出现 'default'，Phase B 搬运时不用改）
 * （不写）   | primary       | primary
 *
 * 旧 variant  | UBadge variant
 * ------------|----------------
 * soft        | soft      （全站 3 处全是 soft）
 * solid       | solid
 * outline     | outline
 *
 * 旧 size | 实际类
 * --------|---------------------------------------------------------------
 * sm      | rounded-full px-2 py-0.5 text-[11px] leading-4（默认）
 * md      | rounded-full px-2.5 py-1 text-xs
 * lg      | rounded-full px-3 py-1.5 text-sm
 *
 * 圆角/内距/字号全部覆盖掉 UBadge 的 `rounded-sm px-1.5 py-1 text-[10px]/3`，
 * 让它回到本站 Chip 的观感（对比 AppShell / LoginPanel 里手写的
 * `rounded-full bg-brand-500/10 px-2 py-0.5 text-[10px] font-semibold`）。
 */
import { computed } from 'vue'

type AppChipColor = 'primary' | 'success' | 'danger' | 'warning' | 'neutral' | 'default' | 'accent'
type AppChipVariant = 'soft' | 'solid' | 'outline'
type AppChipSize = 'sm' | 'md' | 'lg'

const props = withDefaults(defineProps<{
  color?: AppChipColor
  variant?: AppChipVariant
  size?: AppChipSize
}>(), {
  color: 'primary',
  variant: 'soft',
  size: 'md',
})

const COLOR_MAP: Record<AppChipColor, 'primary' | 'success' | 'error' | 'warning' | 'neutral'> = {
  primary: 'primary',
  accent: 'primary',
  success: 'success',
  danger: 'error',
  warning: 'warning',
  neutral: 'neutral',
  default: 'neutral',
}

const SIZE_CLASS: Record<AppChipSize, string> = {
  sm: 'rounded-full px-2 py-0.5 text-[11px] leading-4',
  md: 'rounded-full px-2.5 py-1 text-xs',
  lg: 'rounded-full px-3 py-1.5 text-sm',
}

const uiColor = computed(() => COLOR_MAP[props.color])

const uiBase = computed(() => [
  SIZE_CLASS[props.size],
  // UBadge 的 neutral+soft 是 `text-default bg-elevated`（和卡片同色，看不出是标签），
  // 换成本站的灰标签观感
  props.color === 'neutral' || props.color === 'default' ? 'text-fg-muted bg-sunken' : '',
])
</script>

<template>
  <UBadge
    :color="uiColor"
    :variant="variant"
    :size="size"
    :ui="{ base: uiBase }"
  >
    <slot />
  </UBadge>
</template>
