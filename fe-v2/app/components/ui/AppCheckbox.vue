<script setup lang="ts">
/**
 * AppCheckbox —— HeroUI v3 `Checkbox` → Nuxt UI v4 `UCheckbox` 的兼容层（16 处）
 *
 * 旧版真实用法只有 3 个文件，统计如下（其余为同构重复）：
 *   - `components/questions/SetQuestionsEditor.tsx:198`  列表多选，`<label>` 整行包住 Checkbox
 *   - `pages/LlmConnect.tsx:641`                          授权范围多选，`<label>` 整行包住 Checkbox
 *   - `pages/FocusStudents.tsx:522 / 606`                 表头「全选」三态 + 行首单选，无外层 label
 *
 * ────────────────────────────────────────────────────────────────────────
 * 一、prop / slot / 事件对照
 * ────────────────────────────────────────────────────────────────────────
 * 旧（HeroUI v3）        | AppCheckbox                   | 底层 UCheckbox
 * ----------------------|--------------------------------|-----------------------------------
 * isSelected            | v-model（modelValue: boolean） | v-model（modelValue）
 * isIndeterminate       | v-model 传 'indeterminate'    | v-model 传 'indeterminate'
 * isDisabled            | is-disabled                   | disabled
 * onChange              | @update:model-value            | update:modelValue
 * className             | class（落到最外层 <label>）    | ui.root（本组件接管，未再传）
 * aria-label / aria-*   | attrs 透传给「可点的方块」      | 内部 base（CheckboxRoot）
 * <Checkbox.Content>    | 默认插槽（文案）              | —
 * <Checkbox.Control>    | 内部自带                      | indicator + base
 * <Checkbox.Indicator>  | 内部自带                      | icon（勾 / 横）
 *
 * ────────────────────────────────────────────────────────────────────────
 * 二、⚠️ 三态映射（契约第 8 条，文件头必须写清）
 * ────────────────────────────────────────────────────────────────────────
 * 旧版是两个独立布尔 prop：`isSelected` + `isIndeterminate`；
 * 新版契约收敛成**一个** `modelValue`，用字符串哨兵 `'indeterminate'` 表示半选。
 * Nuxt UI 的 `UCheckbox` 用的**就是同一个** `'indeterminate'` 字符串
 * （`modelValue: T | 'indeterminate'`，reka 的 `CheckedState`），所以这里零转换直传。
 *
 *   旧 `isSelected={all} isIndeterminate={some && !all}`
 *   新 `:model-value="all ? true : some ? 'indeterminate' : false"`
 *
 * 三态切换顺序（reka `CheckboxRoot.handleClick` 已核实）：
 *   'indeterminate' → true → false → true …
 *   与旧 React Aria `useToggleButtonState` 行为一致（旧版点击半选框也是变全选），
 *   所以 `FocusStudents.toggleAll(checked: boolean)` 的语义不变。
 * `aria-checked` 也由 reka 自动给成 `'mixed'`。
 *
 * ────────────────────────────────────────────────────────────────────────
 * 三、DOM 决策：为什么是「自己套一层 <label>」而不是用 UCheckbox 的 #label
 * ────────────────────────────────────────────────────────────────────────
 * 旧版 `Checkbox.Content` 是 react-aria 的 `CheckboxButton`，本身就是**可点整行的
 * label**（`.checkbox__content` = `inline-flex items-center gap-3 text-sm font-medium`），
 * 内部才是 `Checkbox.Control`（16px 方块）+ 文案。所以点击区域 = 整行。
 *
 * `UCheckbox` 的 `#label` 插槽渲染的是**另一个** `<label>`（`data-slot="label"`）。
 * 如果本组件再在外面套一层 `<label>`，就会产生非法的 label 嵌套；
 * 而 `SetQuestionsEditor` / `LlmConnect` 这两处**页面自己已经有一层 `<label>`**
 * （整行卡片样式），旧版正是靠它 + 内部 label 共同实现整行可点。
 *
 * → 最终结构（与旧版一一对应，且 HTML 合法）：
 *     <label class="inline-flex items-center gap-3">   ← 旧 Checkbox 根（className 落点）
 *       <UCheckbox />                                ← 旧 Checkbox.Control（16px 方块）
 *       <span data-slot="label">文案</span>             ← 旧 Checkbox.Label
 *     </label>
 *   外层 label 的隐式关联控件 = 方块那个 `<button role="checkbox">`，
 *   点方块以外的整行空白都会派发点击 → 点击区域与旧版一致；
 *   页面自己那层 `<label>` 也不会再出现嵌套。
 *
 * ────────────────────────────────────────────────────────────────────────
 * 四、迁页面示例（两个形态）
 * ────────────────────────────────────────────────────────────────────────
 *   <!-- 旧 SetQuestionsEditor：有外层整行 label，文案带自己的类名 -->
 *   <label class="flex items-start gap-2 rounded-xl border px-3 py-2">
 *     <Checkbox isSelected={on} onChange={() => toggle(item)} className="mt-0.5"
 *                aria-label="选择题目">
 *       <Checkbox.Content><Checkbox.Control><Checkbox.Indicator /></Checkbox.Control>
 *         <span className="text-xs">{plain(item.question)}</span>
 *       </Checkbox.Content>
 *     </Checkbox>
 *   </label>
 *
 *   <!-- 新 -->
 *   <label class="flex items-start gap-2 rounded-xl border px-3 py-2">
 *     <AppCheckbox :model-value="on" class="mt-0.5" aria-label="选择题目"
 *                  @update:model-value="toggle(item)">
 *       <span class="text-xs">{{ plain(item.question) }}</span>
 *     </AppCheckbox>
 *   </label>
 *
 *   <!-- 旧 FocusStudents：只有方块 + aria-label -->
 *   <!-- 新 -->
 *   <AppCheckbox :model-value="selected.has(row.id)" :aria-label="`选择 ${name}`"
 *                @update:model-value="v => toggleRow(row.id, v !== 'indeterminate' && v)" />
 *
 * ⚠️ 契约表没列 slot，但旧版 16 处里有 11 处往 `Checkbox.Content` 里塞了文案，
 *    所以本组件按 Vue 惯例补了**默认插槽**承载文案（= 旧 `Checkbox.Label`）。
 */
import { computed, useAttrs } from 'vue'

import { cn } from '~/lib/utils'

/**
 * class 必须落在最外层 <label>（旧版 className 落在 Checkbox 根 = 整行），
 * 而 aria-label 等必须落到内部方块上（UCheckbox 是 inheritAttrs: false，
 * attrs 只会进 base，不会自动落到它的根），所以两边分开处理。
 */
defineOptions({ inheritAttrs: false })

const props = defineProps<{
  /** v-model；`'indeterminate'` 哨兵 = 旧版 isIndeterminate（见文件头「二」） */
  modelValue: boolean | 'indeterminate'
  /** 旧版 isDisabled（保留 is 前缀，不改成 disabled） */
  isDisabled?: boolean
}>()

const emit = defineEmits<{
  'update:modelValue': [value: boolean | 'indeterminate']
}>()

const attrs = useAttrs()

/** 除 class 外的 attrs 全部交给 UCheckbox → 内部 base（可点的方块 / 无障碍名） */
const passthrough = computed(() => {
  const { class: _class, ...rest } = attrs
  return rest
})

const rootClass = computed(() => cn(
  // 旧 .checkbox__content：inline-flex + items-center + gap-3 + text-sm font-medium
  'inline-flex cursor-pointer items-center gap-3 text-sm font-medium text-fg',
  props.isDisabled ? 'cursor-not-allowed opacity-75' : '',
  attrs.class as string | undefined,
))

/**
 * UCheckbox 主题在 disabled 时给**它自己的根**加了 `opacity-75`；
 * 本组件把禁用态统一画在外层 label 上（整行变淡，和旧版 `status-disabled` 一致），
 * 所以这里把它自己那层透明度清掉，避免 0.75 × 0.75 过暗。
 */
const ui = computed(() => ({
  root: props.isDisabled ? 'opacity-100' : '',
}))

/**
 * UCheckbox 是受控的（reka `useVModel(passive)`），点方块只会发事件、
 * 真正的勾选态由父组件回写——和旧版 HeroUI 的 `isSelected` 受控语义一致。
 * 三态切换顺序见文件头「二」，这里原样透传（含 'indeterminate' 哨兵）。
 */
function onUpdate(value: boolean | 'indeterminate'): void {
  emit('update:modelValue', value)
}
</script>

<template>
  <label :class="rootClass">
    <UCheckbox
      v-bind="passthrough"
      :model-value="modelValue"
      :disabled="isDisabled"
      :ui="ui"
      @update:model-value="onUpdate"
    />
    <span data-slot="label"><slot /></span>
  </label>
</template>
