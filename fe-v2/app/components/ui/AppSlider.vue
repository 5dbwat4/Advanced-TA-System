<script setup lang="ts">
/**
 * AppSlider —— HeroUI v3 `Slider` → Nuxt UI v4 `USlider` 的兼容层（4 处）
 *
 * 旧版真实用法只有 `components/checkoff/ScoreForm.tsx:117`（按评分类型各一个滑块），
 * 结构是 `Slider > Slider.Track > (Slider.Fill + Slider.Thumb)`；
 * 另外 `CourseSettings.tsx` / `PreferenceSection.tsx` / `PreferenceOnboarding.tsx`
 * 里的 `SlidersHorizontal` 是 lucide 图标名，与本组件无关。
 *
 * ────────────────────────────────────────────────────────────────────────
 * 一、prop / slot / 事件对照
 * ────────────────────────────────────────────────────────────────────────
 * 旧（HeroUI v3） | AppSlider        | 底层 USlider
 * ----------------|------------------|-------------------------------------------
 * value           | v-model          | v-model（单 thumb 时回传 number）
 * minValue        | :min-value       | min        ← 旧 prop 名保留，不改成 min
 * maxValue        | :max-value       | max        ← 旧 prop 名保留，不改成 max
 * step            | :step            | step
 * isDisabled      | :is-disabled     | disabled
 * onChange        | @update:model-value | update:modelValue
 * className       | class（落到最外层 <div>，与旧版 Slider 根一致） | ui.root
 * aria-label      | attrs → 内部 thumb | aria-label（见「三」）
 * <Slider.Track>  | 内部自带         | ui.track
 * <Slider.Fill>   | 内部自带         | ui.range
 * <Slider.Thumb>  | 内部自带         | ui.thumb
 *
 * ────────────────────────────────────────────────────────────────────────
 * 二、⚠️ 不搬旧版 .score-slider（决定记录）
 * ────────────────────────────────────────────────────────────────────────
 * 旧版 `fe/src/index.css:269` 起有 53 行 `.score-slider` 自定义样式
 * （appearance:none + 自绘 8px 圆角轨道 + 22px 白色滑块 + hover 缩放）。
 * 实测它在**旧版 0 处使用**（旧 `ScoreForm` 写的是裸 `Slider`，没有这个 className），
 * 属于死代码。按契约第 10 条**不搬**，`AppSlider` 直接用 Nuxt UI 默认观感：
 * 8px 圆角轨道 + 品牌色填充 + 16px 圆钮 + 品牌色 focus 环。
 * 旧 `index.css` 那 53 行由 Phase E 切换时整体不迁移。
 *
 * ────────────────────────────────────────────────────────────────────────
 * 三、交互（已核实 reka-ui / Nuxt UI 源码）
 * ────────────────────────────────────────────────────────────────────────
 * - **键盘方向键可用**：reka 的 `SliderThumb` 自带 keydown 处理
 *   ← → ↑ ↓ / Home / End / PageUp / PageDown，且带 `step` 步进；
 *   USlider 的 root 是 `touch-none select-none`，拖拽/触摸也正常。
 * - `class` 落点：USlider 是 `inheritAttrs: false`，`class` prop 走 `ui.root`
 *   （最外层 `<div>`，`horizontal` 时默认 `w-full`），与旧版 Slider 根一致；
 *   旧页面写的 `flex-1` 会和 `w-full` 一起进 tailwind-merge，
 *   `flex: 1 1 0%` 的 flex-basis 覆盖 `width:100%`，一行 flex 里不会被挤走。
 * - `aria-label`：USlider 单 thumb 时会把 `aria-label` 从 $attrs 摘出来
 *   绑到 thumb 上（`pick($attrs, thumbAttrs)`），比旧版绑在根 div 上更正确，
 *   迁页面时**照抄 aria-label 即可，不用改**。
 * - `modelValue` 回传：USlider 的 setter 是
 *   `value?.length !== 1 ? value : value[0]`，单 thumb 回传 number（不是数组），
 *   与旧版 `onChange` 里 `Array.isArray(value) ? value[0] : value` 的处理结果一致，
 *   页面那层 `Array.isArray` 判断可以删掉。
 * - `thumb` 主题默认 `bg-default`（Nuxt 的中性色，不是本站卡片色）→ 换成 `bg-elevated`，
 *   与 `AppInput` 里对 `bg-default` 的处理一致。
 *
 * ────────────────────────────────────────────────────────────────────────
 * 四、迁页面示例（ScoreForm.tsx:117）
 * ────────────────────────────────────────────────────────────────────────
 *   <!-- 旧 -->
 *   <Slider aria-label={type.label} className="flex-1" minValue={0} maxValue={SCORE_MAX}
 *           step={1} value={values[type.value]} onChange={(v) => setValue(type.value, v)}>
 *     <Slider.Track><Slider.Fill /><Slider.Thumb /></Slider.Track>
 *   </Slider>
 *
 *   <!-- 新：SCORE_MAX 仍由页面从 ~/lib/scores 传入，组件内不硬编码 -->
 *   <AppSlider :aria-label="type.label" class="flex-1" :min-value="0" :max-value="SCORE_MAX"
 *              :step="1" :model-value="values[type.value]"
 *              @update:model-value="v => setValue(type.value, v)" />
 */
import { computed } from 'vue'

const props = withDefaults(defineProps<{
  /** v-model，旧版 value */
  modelValue: number
  /** 旧 prop 名 minValue（不改成 min） */
  minValue?: number
  /** 旧 prop 名 maxValue（不改成 max）；SCORE_MAX 由页面从 ~/lib/scores 传入 */
  maxValue?: number
  step?: number
  isDisabled?: boolean
}>(), {
  minValue: 0,
  maxValue: 100,
  step: 1,
})

const emit = defineEmits<{
  'update:modelValue': [value: number]
}>()

/** USlider 的 modelValue 允许 number[]（多 thumb），本组件只有单 thumb，取首值兜底 */
const model = computed({
  get: (): number => props.modelValue,
  set: (value: number | number[] | undefined) => {
    emit('update:modelValue', Array.isArray(value) ? (value[0] ?? props.minValue) : (value ?? props.minValue))
  },
})

const ui = { thumb: 'bg-elevated' }
</script>

<template>
  <USlider
    v-model="model"
    :min="minValue"
    :max="maxValue"
    :step="step"
    :disabled="isDisabled"
    :ui="ui"
  />
</template>
