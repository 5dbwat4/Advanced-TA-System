<script setup lang="ts">
/**
 * AppTooltip —— HeroUI v3 `Tooltip` → Nuxt UI v4 `UTooltip` 的兼容层（20 处）
 *
 * ────────────────────────────────────────────────────────────────────────
 * 一、prop 映射（取值均经 Nuxt UI MCP `get-component Tooltip` 核实）
 * ────────────────────────────────────────────────────────────────────────
 * 旧 prop      | AppTooltip | UTooltip
 * -------------|------------|---------------------------------------------------------
 * delay        | delay      | :delay-duration（注意**不是** `delay`；UTooltip 默认 700，
 *              |            |  HeroUI v3 的 Tooltip 无延迟。全站 13 处 delay 多为 0，
 *              |            |  AppTooltip 默认也取 0）
 * showArrow    | arrow      | :arrow（UTooltip 默认 false；AppTooltip 默认 true，
 *              |            |  因为旧版 8 处都显式写了 showArrow）
 * placement    | placement  | :content="{ side }"（reka 的 side：top/bottom/left/right；
 *              |            |  默认 side='bottom'、sideOffset=8、collisionPadding=8）
 * closeDelay   | closeDelay | UTooltip **没有** closeDelay（关掉是即时的）。
 *              |            |  旧版只有 2 处用到：ExperimentTimeline(100ms，气泡里可交互)
 *              |            |  与 Scores(0ms)。closeDelay > 0 时本组件接管 `open`：
 *              |            |  收到「要关」的信号后延迟 closeDelay 毫秒才真的关，
 *              |            |  给出鼠标移回气泡的缓冲。closeDelay 为 0/undefined 时
 *              |            |  完全走 Nuxt UI 自己的状态机（零风险路径）。
 * className    | contentClass | :ui="{ content }"（旧版 className 作用在 Tooltip.Content 上，
 *              |            |  如 ExperimentTimeline 的 `max-w-[16rem] p-3`）
 * text         | text       | :text（可选简写；实际全站都用 #content 插槽）
 * disabled     | disabled   | 直通
 *
 * ────────────────────────────────────────────────────────────────────────
 * 二、插槽
 * ────────────────────────────────────────────────────────────────────────
 * 默认插槽   = **触发元素本身**。UTooltip 的 trigger 是 asChild，
 *             所以这里绝不能再包一层 wrapper，否则会多出一层 DOM 破坏布局。
 *             （旧版 `<Tooltip.Trigger className="inline-flex">` 的那层 class，
 *               迁到 Vue 时直接写在默认插槽的元素上。）
 * #content   = 气泡内容（作用域插槽 `{ ui }`，本组件只转发，不消费）
 *
 * ────────────────────────────────────────────────────────────────────────
 * 三、⚠️ 迁页面注意事项
 * ────────────────────────────────────────────────────────────────────────
 * 1) `class` 透传是给**触发元素**的（AppTooltip 根就是 UTooltip，class 会落到
 *    asChild 的子元素上）；气泡的样式请用 `content-class`。
 * 2) UTooltip 默认的 `ui.content` 带 `h-6`，气泡里放时间线这种块级内容会被压扁。
 *    本组件默认覆写了 `h-auto max-w-xs`，页面再传 `content-class` 即可。
 * 3) UTooltip 需要 `app.vue` 的 `<UApp>` 提供全局 TooltipProvider（已就位）。
 */
import { computed, onBeforeUnmount, ref } from 'vue'

type AppTooltipPlacement = 'top' | 'bottom' | 'left' | 'right'

const props = withDefaults(defineProps<{
  /** hover 后多久出现（毫秒） */
  delay?: number
  /** 离开后延迟多久关闭（毫秒）；UTooltip 原生没有这个能力，>0 时本组件自己接管 */
  closeDelay?: number
  placement?: AppTooltipPlacement
  /** 气泡的纯文本简写（一般用 #content 插槽代替） */
  text?: string
  /** 作用在气泡上的 class（旧版 className） */
  contentClass?: string
  arrow?: boolean
  disabled?: boolean
}>(), {
  delay: 0,
  closeDelay: 0,
  placement: 'top',
  arrow: true,
})

/** 只有真的传了 closeDelay > 0 才接管 open 状态，走 Nuxt UI 自己的逻辑时零风险 */
const controlled = computed(() => props.closeDelay > 0)
const open = ref(false)
let closeTimer: ReturnType<typeof setTimeout> | undefined

function onUpdateOpen(value: boolean) {
  if (!controlled.value) return
  if (closeTimer) {
    clearTimeout(closeTimer)
    closeTimer = undefined
  }
  if (value) {
    open.value = true
    return
  }
  closeTimer = setTimeout(() => {
    open.value = false
    closeTimer = undefined
  }, props.closeDelay)
}

onBeforeUnmount(() => {
  if (closeTimer) clearTimeout(closeTimer)
})

/** UTooltip 的 content 默认 { side:'bottom', sideOffset:8, collisionPadding:8 }，只换 side */
const content = computed(() => ({ side: props.placement, sideOffset: 8, collisionPadding: 8 }))

const ui = computed(() => ({
  // h-auto：默认的 h-6 会压扁块级气泡；max-w-xs：默认没有宽度上限
  content: ['h-auto max-w-xs', props.contentClass],
}))
</script>

<template>
  <UTooltip
    v-bind="controlled ? { open } : {}"
    :delay-duration="delay"
    :arrow="arrow"
    :disabled="disabled"
    :content="content"
    :ui="ui"
    @update:open="onUpdateOpen"
  >
    <!-- 触发元素本身：不要包 wrapper -->
    <slot />
    <template #content>
      <slot name="content">{{ text }}</slot>
    </template>
  </UTooltip>
</template>
