<script setup lang="ts">
/**
 * AppButton —— HeroUI v3 `Button` → Nuxt UI v4 `UButton` 的兼容层
 * （全站 111 处调用，Phase C/D 每迁一个页面都要用到）
 *
 * ────────────────────────────────────────────────────────────────────────
 * 一、variant 映射表（取值经 Nuxt UI MCP `get-component Button` 核实）
 * ────────────────────────────────────────────────────────────────────────
 * 旧 variant   | UButton color | UButton variant | 观感
 * -------------|---------------|-----------------|---------------------------------
 * primary      | primary       | solid           | 品牌蓝实心（app.config 里 primary=brand）
 * secondary    | neutral       | subtle          | 浅灰底 + 1px ring（Nuxt 的 subtle 带 ring-accented 描边，最接近旧版「浅底描边」）
 * ghost        | neutral       | ghost           | 透明底，hover 才有底色（额外覆盖成 hover:bg-sunken/50，贴合本站微交互语言）
 * danger       | error         | solid           | 红色实心
 * danger-soft  | error         | soft            | 红色 10% 底 + 红色文字
 * 不写 variant | primary       | solid           | 旧版默认就是 primary（依据 LlmConnect.tsx:680「完成」不写 variant，
 *               |               |                 | 而同页 683「取消」显式写 secondary）
 *
 * ────────────────────────────────────────────────────────────────────────
 * 二、size 映射（UButton 的 size 取值：xs | sm | md | lg | xl）
 * ────────────────────────────────────────────────────────────────────────
 * 旧 size | UButton size | 备注
 * --------|--------------|---------------------------------------
 * sm      | sm           | 全站 66 处
 * 不写     | md           | 39 处
 * lg      | lg           | 6 处
 *
 * ────────────────────────────────────────────────────────────────────────
 * 三、其余 prop 映射
 * ────────────────────────────────────────────────────────────────────────
 * 旧 prop       | 处理
 * --------------|-------------------------------------------------------------
 * isPending     | :loading（UButton 自带 spinner，且会自动 disabled）
 * isDisabled    | :disabled
 * fullWidth     | :block（→ w-full justify-center）
 * isIconOnly    | :square + ui.base 追加 p-0 / size-8(sm) size-9(md) size-10(lg)
 * type          | :type（submit / button / reset）
 * onPress       | @press（emit）— UButton 渲染真 <button>，Enter/Space 天然可用
 * slot="close"  | 点击时调用 inject 到的 AppModal 关闭函数（见 useAppModalSlots.ts），
 *               |  AppModal 未实现时静默降级为 no-op
 * className     | 改写成 class，落在 UButton 的 class prop → ui.base → 真实 <button> 上
 * color         | 直通 UButton color（少数动态 color 场景；variant 仍走上面的映射表）
 *
 * ────────────────────────────────────────────────────────────────────────
 * 四、⚠️ 迁页面时必须遵守的规则（双 spinner）
 * ────────────────────────────────────────────────────────────────────────
 * UButton 的 `loading` 自带一个 spinner 停在内容**前面**。所以：
 *
 *   1) 凡是给 AppButton 传了 `is-pending` 的地方，**必须删掉内部手写的
 *      `<Spinner color="current" size="sm" />`**，否则会出现双 spinner。
 *      典型：LoginPanel.tsx:212 / :364 / :394、Experiments.tsx:170、
 *            Scores.tsx:446、FocusStudents.tsx:737。
 *   2) 只有「pending 时想换成别的图标」的写法才保留内部内容，并用作用域插槽的
 *      `isPending` 判断，例如：
 *
 *        <!-- 旧版 -->
 *        <AppButton is-pending="passkeyLoading" @press="...">
 *          {{#default}}待验证中
 *            {{#if isPending}}<Spinner />{{else}}<Fingerprint />{{/if}}
 *            {{isPending ? '验证中' : '使用通行密钥继续'}}
 *          {{/default}}
 *        </AppButton>
 *
 *        <!-- 新版：删掉 Spinner，只留图标切换 + 文案切换 -->
 *        <AppButton is-pending="passkeyLoading" @press="...">
 *          <template #default="{ isPending }">
 *            <Fingerprint v-if="!isPending" :width="16" :height="16" class="shrink-0" />
 *            {{ isPending ? '验证中' : '使用通行密钥继续' }}
 *          </template>
 *        </AppButton>
 *
 *   3) 「页面里另写的 spinner」不算在内（例如 StudentFinder 搜索框右侧那个
 *      绝对定位的 Spinner），那是独立元素，不用删。
 *
 * 按压反馈：`main.css` 末尾已有全局 `:active { scale: .97 }` 兜底（§4.4-B），
 * 本组件**不再重复添加**，避免与 Nuxt UI 自带的 transition 打架。
 */
import { computed } from 'vue'

import { useAppModalClose } from '~/composables/useAppModalSlots'

/** 旧版 HeroUI Button 的 variant 取值集合 */
type AppButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'danger-soft'
type AppButtonSize = 'sm' | 'md' | 'lg'
/** UButton 的取值（经 MCP 核实：error | primary | secondary | success | info | warning | neutral） */
type UiButtonColor = 'error' | 'primary' | 'secondary' | 'success' | 'info' | 'warning' | 'neutral'
/** UButton 的 variant 取值（经 MCP 核实：solid | outline | soft | subtle | ghost | link） */
type UiButtonVariant = 'solid' | 'outline' | 'soft' | 'subtle' | 'ghost' | 'link'

const props = withDefaults(defineProps<{
  variant?: AppButtonVariant
  size?: AppButtonSize
  isIconOnly?: boolean
  isPending?: boolean
  isDisabled?: boolean
  fullWidth?: boolean
  type?: 'button' | 'submit' | 'reset'
  /** 旧版 slot="close"：点击时关闭外层 AppModal */
  slot?: string
  /** 直通 UButton color（少数动态 color 场景） */
  color?: UiButtonColor
  /** 有值则渲染 NuxtLink */
  to?: string | Record<string, unknown>
  /** 外链 */
  href?: string
}>(), {
  variant: 'primary',
  size: 'md',
  type: 'button',
})

const emit = defineEmits<{
  press: [event: MouseEvent]
}>()

const closeModal = useAppModalClose()

const COLOR_MAP: Record<AppButtonVariant, UiButtonColor> = {
  primary: 'primary',
  secondary: 'neutral',
  ghost: 'neutral',
  danger: 'error',
  'danger-soft': 'error',
}

const VARIANT_MAP: Record<AppButtonVariant, UiButtonVariant> = {
  primary: 'solid',
  secondary: 'subtle',
  ghost: 'ghost',
  danger: 'solid',
  'danger-soft': 'soft',
}

/** isIconOnly 的方形边长，与旧版 HeroUI 的 h-8 / h-9 / h-10 一一对应 */
const ICON_SIZE_MAP: Record<AppButtonSize, string> = {
  sm: 'size-8',
  md: 'size-9',
  lg: 'size-10',
}

const uiColor = computed<UiButtonColor>(() => props.color ?? COLOR_MAP[props.variant])
const uiVariant = computed<UiButtonVariant>(() => VARIANT_MAP[props.variant])

const uiBase = computed(() => [
  // Nuxt UI 默认 rounded-md（6px），本站卡片/输入框都是 rounded-lg~rounded-xl，
  // 这里统一到 rounded-lg，让按钮和周围元素同属一个圆角体系。
  'rounded-lg font-semibold',
  // ghost 的默认 hover 底色是 bg-elevated（暗色下偏亮），换成本站的 bg-sunken
  props.variant === 'ghost' ? 'hover:bg-sunken/50 active:bg-sunken/50' : '',
  props.isIconOnly ? ['justify-center', 'p-0', ICON_SIZE_MAP[props.size]] : '',
])

function onClick(event: MouseEvent) {
  // 先跑页面自己的逻辑，再关弹窗（关掉后 DOM 已卸载，但闭包里的 Promise 仍会跑完）
  emit('press', event)
  if (props.slot === 'close') closeModal('close')
}
</script>

<template>
  <UButton
    :color="uiColor"
    :variant="uiVariant"
    :size="size"
    :square="isIconOnly"
    :block="fullWidth"
    :loading="isPending"
    :disabled="isDisabled"
    :type="type"
    :to="to"
    :href="href"
    :ui="{ base: uiBase }"
    @click="onClick"
  >
    <template #default>
      <slot :is-pending="isPending" :is-disabled="isDisabled" />
    </template>
  </UButton>
</template>
