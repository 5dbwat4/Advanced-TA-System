<script setup lang="ts">
/**
 * AppSwitch —— HeroUI v3 `Switch` → Nuxt UI v4 `USwitch` 的兼容层（4 处）
 *
 * 旧版结构是 `Switch.Content > Switch.Control > Switch.Thumb` 三层 compound，
 * USwitch 内部自带这三层，页面只需要写一个开关即可，结构变简单是好事。
 *
 * ────────────────────────────────────────────────────────────────────────
 * prop 映射
 * ────────────────────────────────────────────────────────────────────────
 * 旧 prop     | AppSwitch                 | USwitch
 * ------------|---------------------------|---------------------------------------
 * isSelected  | v-model:is-selected       | v-model（modelValue）
 * isDisabled  | is-disabled               | disabled
 * onChange    | @change（拿到 boolean）   | USwitch 的 change emit 传的是原生 Event
 *                                        （内部 new Event('change', { target: { value } })），
 *                                        AppSwitch 把它转回 boolean 再 emit
 * —           | color / size              | 直通
 *
 * `class` / `aria-label` 等 attrs 透传：USwitch 是 `inheritAttrs: false`，
 * 把剩余 attrs 绑到内部真正的 SwitchRoot（可聚焦的 button）上，
 * `class` 则落到外层 wrapper `<div>`（与旧版 HeroUI Switch 的根一致）。
 *
 * 迁页面示例：
 *   <!-- 旧 -->
 *   <Switch isSelected={settings?.focusEnabled ?? false} isDisabled={busy}
 *           onChange={(v) => void patch({ focusEnabled: v })} aria-label="启用重点关注学生">
 *     <Switch.Content><Switch.Control><Switch.Thumb /></Switch.Control></Switch.Content>
 *   </Switch>
 *
 *   <!-- 新 -->
 *   <AppSwitch v-model:is-selected="settings.focusEnabled" :is-disabled="busy"
 *              aria-label="启用重点关注学生" @change="onToggle" />
 */
import { computed, ref, watch } from 'vue'

const props = defineProps<{
  isSelected?: boolean
  isDisabled?: boolean
  color?: 'primary' | 'secondary' | 'success' | 'info' | 'warning' | 'error' | 'neutral'
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl'
}>()

const emit = defineEmits<{
  'update:isSelected': [value: boolean]
  change: [value: boolean]
}>()

/** 不传 is-selected 时也能自己切换（对应 HeroUI 的非受控用法） */
const inner = ref(props.isSelected)
watch(() => props.isSelected, (value) => { inner.value = value })

const model = computed({
  get: () => props.isSelected ?? inner.value,
  set: (value: boolean) => {
    inner.value = value
    emit('update:isSelected', value)
  },
})

/** USwitch 的 change 事件是原生 Event，target.value 是新的布尔值 */
function onChange(event: Event) {
  emit('change', (event.target as HTMLInputElement).value === 'true')
}
</script>

<template>
  <USwitch
    v-model="model"
    :disabled="isDisabled"
    :color="color"
    :size="size"
    @change="onChange"
  >
    <template v-if="$slots.label" #label="{ label }">
      <slot name="label" :label="label" />
    </template>
    <template v-if="$slots.description" #description="{ description }">
      <slot name="description" :description="description" />
    </template>
  </USwitch>
</template>
