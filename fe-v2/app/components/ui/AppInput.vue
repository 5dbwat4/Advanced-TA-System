<script setup lang="ts">
/**
 * AppInput —— HeroUI v3 `Input` → Nuxt UI v4 `UInput` 的兼容层（25 处）
 *
 * ────────────────────────────────────────────────────────────────────────
 * 一、prop 映射
 * ────────────────────────────────────────────────────────────────────────
 * 旧 HeroUI           | AppInput                          | 说明
 * -------------------|-----------------------------------|--------------------------------------
 * value + onChange   | v-model（modelValue/update:modelValue）
 * fullWidth          | fullWidth（默认就是整宽，兼容保留）
 * placeholder        | placeholder                       | 直通
 * type               | type                              | 直通
 * disabled           | disabled                          | 直通
 * required           | required                          | 直通
 * maxLength          | maxlength                         | ↓ 见「二、原生属性透传」
 * minLength          | minlength                         | ↓
 * min / max / step   | min / max / step                  | ↓
 * inputMode          | inputmode                         | ↓
 * autoComplete       | autocomplete                      | 直通
 * autoFocus          | autofocus                         | 直通（UInput 内置 autofocusDelay=0 的 setTimeout 聚焦）
 * className          | class                             | ↓ 见「三、class 落点」
 * onBlur             | @blur                             | UInput 的 blur emit（传的是原生 FocusEvent）
 * onKeyDown          | @enter（只在 key === 'Enter' 时触发）
 * onChange（原生）    | @change                           | UInput 的 change emit
 * 其余原生属性        | 走 attrs 透传（data-*、aria-*、name、id、pattern、readonly…）
 *
 * ────────────────────────────────────────────────────────────────────────
 * 二、原生属性透传（已核实）
 * ────────────────────────────────────────────────────────────────────────
 * UInput 源码（v4 `src/runtime/components/Input.vue`）里是：
 *   `defineOptions({ inheritAttrs: false })`
 *   内部 `<input v-bind="{ ...$attrs, ...ariaAttrs }">`
 * 而 `min` / `max` / `step` / `maxlength` / `minlength` / `pattern` / `readonly`
 * / `inputmode` 这些**不是** UInput 的运行时 props（它们来自被 `@vue-ignore`
 * 标注的 `Omit<InputHTMLAttributes, ...>`，只用于 TS 补全），
 * 所以会原封不动地落到内部真正的 `<input>` 上。
 * ⚠️ `pages/Checkin.tsx`（inputMode="numeric"）、`components/checkoff/ScoreForm.tsx`
 *    （min/max/step/inputMode）依赖这一点，dev 起起来后请顺手验证一次。
 *    显式声明的 props（type / placeholder / required / autocomplete / disabled）
 *    由 UInput 模板自己绑定，不走 $attrs。
 *
 * ────────────────────────────────────────────────────────────────────────
 * 三、class 与宽度的落点（重要）
 * ────────────────────────────────────────────────────────────────────────
 * HeroUI 的 `Input` 根元素**就是** `<input>`，所以旧版的
 *   `className="pl-10"`（配合外层 relative 容器 + 绝对定位的搜索图标）
 *   `className="tabular w-16 rounded-lg border border-line bg-elevated px-2 py-1 text-center text-sm"`
 * 都作用在输入框本身。
 * UInput 的 `class` prop 却落在外层 wrapper `<div>` 上（`ui.root`），
 * 直接透传会让 pl-10 加在 div 上（无效）而真正的 input 没有内边距。
 * → 本组件 `defineOptions({ inheritAttrs: false })`，把 `class` 摘出来塞进
 *   `ui.base`，保证「页面写什么 class 就作用在 <input> 上」这条不变式。
 *
 * 宽度：HeroUI 的 `.input` 本身不带 `w-full`（只有 `.input--full-width` 才有），
 * 整宽靠容器拉伸。所以这里让**内部 input 默认 `w-full`**，而外层 wrapper：
 *   - 传了 `fullWidth`，或页面没写定宽 class → `w-full`（与旧版一致）
 *   - 页面写了 `w-16` / `w-32` 这类定宽 → wrapper 收成 `w-fit`
 *     （否则多出来的这层 wrapper 会在一行 flex 里把兄弟元素挤走）
 *
 * ────────────────────────────────────────────────────────────────────────
 * 四、⚠️ 迁页面注意事项
 * ────────────────────────────────────────────────────────────────────────
 * 1) 搜索框保持旧版「外层 relative 容器 + 绝对定位图标 + 输入框 className 带
 *    pl-10」的写法，**不要**改成 UInput 的 leading-icon（组件内不内置图标）。
 * 2) HeroUI 用 `border`，Nuxt UI 的 outline 用 `ring`。页面 className 里还带着
 *    `border border-line` 的那几处（Scores.tsx:219、ScoreForm.tsx:143、
 *    Questions.tsx:642、StudentFinder.tsx:94）会出现「ring + border」双描边，
 *    迁的时候把 className 里的 `border border-line` 删掉即可。
 * 3) `type="number"` 时 UInput 的 v-model 回传的是 **number**（内部 looseToNumber），
 *    旧版 React 给的是 string。`Number(e.target.value)` 这类转换可以去掉。
 * 4) 旧版 `ref={inputRef}` + `inputRef.current?.focus()` 改成
 *    `const inputRef = useTemplateRef('input')` + `inputRef.value?.focus()`
 *    （AppInput 通过 defineExpose 暴露了 focus()）。
 */
import { computed, useAttrs, useTemplateRef } from 'vue'

import { cn } from '~/lib/utils'

defineOptions({ inheritAttrs: false })

type AppInputSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl'
type AppInputVariant = 'outline' | 'soft' | 'subtle' | 'ghost' | 'none'

const props = withDefaults(defineProps<{
  modelValue?: string | number
  type?: string
  placeholder?: string
  disabled?: boolean
  required?: boolean
  maxlength?: string | number
  minlength?: string | number
  min?: string | number
  max?: string | number
  step?: string | number
  inputmode?: 'none' | 'text' | 'tel' | 'url' | 'email' | 'numeric' | 'decimal' | 'search' | (string & {})
  pattern?: string
  autocomplete?: string
  autofocus?: boolean
  fullWidth?: boolean
  size?: AppInputSize
  variant?: AppInputVariant
  color?: 'primary' | 'secondary' | 'success' | 'info' | 'warning' | 'error' | 'neutral'
  loading?: boolean
}>(), {
  type: 'text',
  variant: 'outline',
  size: 'md',
})

const emit = defineEmits<{
  'update:modelValue': [value: string | number | null]
  blur: [event: FocusEvent]
  /** 对应旧版 Input 的 onKeyDown，只在按下 Enter 时触发；不会自动 preventDefault */
  enter: [event: KeyboardEvent]
}>()

const attrs = useAttrs()
const uinput = useTemplateRef('uinput')

/**
 * class 要落到内部 <input>（见文件头「三」）。
 * UInput 的 `ui.base` 与主题类走 tailwind-merge 合并，页面 class 里与主题冲突的
 * 工具类（w-16 / px-2 / text-sm / rounded-lg）会正确覆盖。
 */
const uiBase = computed(() => cn(
  // 内部 input 默认整宽：HeroUI 的 `.input` 本身也是靠容器拉伸 / `--full-width` 才整宽，
  // 页面若写了 w-16 之类会被 tailwind-merge 顶掉。
  'w-full',
  'rounded-lg',
  // Nuxt UI 的 outline 默认 bg-default；暗色下它不是本站的卡片色，换成 bg-elevated
  props.variant === 'outline' ? 'bg-elevated' : '',
  attrs.class as string | undefined,
))

const uiRoot = computed(() => {
  // 页面显式给了非整宽的宽度（w-16 / w-32 / max-w-… 之外的定宽）时，
  // 外层 wrapper 必须收窄到内容宽，否则在一行 flex 里会把兄弟元素挤走
  // （旧版 HeroUI 的 Input 根元素就是 input 本身，不存在这层 wrapper）。
  const className = (attrs.class as string | undefined) ?? ''
  const hasFixedWidth = /(?:^|\s)w-(?!full\b)[a-z0-9[\]/.%-]+/.test(className)
  return cn('flex max-w-full', props.fullWidth || !hasFixedWidth ? 'w-full' : 'w-fit')
})

/** 其余原生属性 + 我们自己声明的原生属性，一起交给 UInput 落到内部 <input> */
const passthrough = computed(() => {
  const { class: _class, ...rest } = attrs
  return {
    ...rest,
    maxlength: props.maxlength,
    minlength: props.minlength,
    min: props.min,
    max: props.max,
    step: props.step,
    inputmode: props.inputmode,
    pattern: props.pattern,
  }
})

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Enter') emit('enter', event)
}

defineExpose({
  /** 内部 UInput 实例 */
  component: uinput,
  /**
   * 聚焦内部真正的 <input>（旧版 `ref={inputRef}` + `inputRef.current?.focus()`）。
   * 用 DOM 查询而不是依赖 UInput 内部暴露的 ref 名，升级小版本时更稳。
   */
  focus: () => {
    const el = uinput.value?.$el as HTMLElement | undefined
    if (!el) return
    const input = el instanceof HTMLInputElement ? el : el.querySelector('input')
    input?.focus()
  },
})
</script>

<template>
  <UInput
    ref="uinput"
    v-bind="passthrough"
    :model-value="modelValue"
    :type="type"
    :placeholder="placeholder"
    :disabled="disabled"
    :required="required"
    :autocomplete="autocomplete"
    :autofocus="autofocus"
    :size="size"
    :variant="variant"
    :color="color"
    :loading="loading"
    :ui="{ root: uiRoot, base: uiBase }"
    @update:model-value="emit('update:modelValue', $event)"
    @blur="emit('blur', $event)"
    @keydown="onKeydown"
  />
</template>
