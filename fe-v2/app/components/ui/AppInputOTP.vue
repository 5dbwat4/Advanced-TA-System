<script setup lang="ts">
/**
 * AppInputOTP —— HeroUI v3 `InputOTP` → Nuxt UI v4 `UPinInput` 的兼容层（10 处）
 *
 * 旧版真实用法只有 `pages/Checkin.tsx:46`（6 位数字验收码，`pattern=REGEXP_ONLY_DIGITS`
 * + `inputMode="numeric"` + `autoFocus` + `className="justify-center"`），
 * 结构是 `InputOTP > (Group > Slot×3) + Separator + (Group > Slot×3)`。
 * （任务书里提到的 `QuestionDrawer` / `ScoreForm` 目前旧代码里没有 InputOTP，
 *  迁页面时按同一份契约调用即可。）
 *
 * ────────────────────────────────────────────────────────────────────────
 * 一、prop / slot / 事件对照
 * ────────────────────────────────────────────────────────────────────────
 * 旧（HeroUI v3）          | AppInputOTP          | 底层 UPinInput
 * -------------------------|----------------------|--------------------------------
 * value                    | v-model（string）     | v-model（逐位数组 ↔ 字符串互转）
 * maxLength                | :length（默认 6）    | length
 * inputMode="numeric"      | :input-mode（默认 numeric）| type="number"
 * pattern（字符串常量）     | :pattern（RegExp）   | 无对应 prop → 本组件自己逐位过滤
 * autoFocus                | :auto-focus          | autofocus
 * onChange                 | @update:model-value  | update:modelValue
 * className                | class（落到最外层 <div>） | ui.root
 * aria-label               | attrs → 最外层        | attrs → 最外层（同旧版）
 * <InputOTP.Slot index>    | 内部按 length 生成   | 内部 PinInputInput × length
 * <InputOTP.Group>         | 内部自带分组          | （Nuxt UI 用 separator 表达分组）
 * <InputOTP.Separator>     | #separator 插槽       | #separator 插槽（作用域 { index }）
 *
 * ────────────────────────────────────────────────────────────────────────
 * 二、底层能力对应关系（已核实 reka-ui / Nuxt UI 源码）
 * ────────────────────────────────────────────────────────────────────────
 * - **长度控制**：`length` 一比一透传，UPinInput 内部
 *   `v-for="index in looseToNumber(length)"` 生成对应个数的 `<input>`。
 *   旧版要手写 6 个 `<InputOTP.Slot index={n}/>`，新版由 length 决定。
 * - **inputMode**：`type="number"` 时 reka 给每个 input 绑
 *   `inputmode="numeric" pattern="[0-9]*"` 并只放行数字；`'text'` 时绑
 *   `inputmode="text"`。所以 `inputMode: 'numeric'` 直接映射 `:type`。
 *   ⚠️ 副作用：`type="number"` 时 reka 的 modelValue 是 `number[]`（否则 `string[]`），
 *   本组件统一在 emit 前 `.map(String)` 抹平，页面只看到 string。
 * - **粘贴整串填满**：reka 的 `handlePaste` / `handleMultipleCharacter`
 *   会把多字符摊到后面各个 input 上（贴 6 位一次填满），不依赖我们自己实现。
 * - **逐位 pattern**：UPinInput 没有 pattern prop（numeric 模式下它写死
 *   `pattern="[0-9]*"`），所以在 emit 出口做逐位过滤（见 `accept()`）。
 *   旧版传的是字符串常量 `REGEXP_ONLY_DIGITS = "^\\d+$"`，Vue 侧写 `/^\d+$/`。
 * - **autoFocus**：UPinInput 内部 `onMounted` 里 `setTimeout(focus, autofocusDelay=0)`
 *   自动聚焦第 0 位。
 *
 * ────────────────────────────────────────────────────────────────────────
 * 三、⚠️ 分隔符（默认第 3 位后）
 * ────────────────────────────────────────────────────────────────────────
 * 旧版把 6 个 Slot 手动分成两组 + 中间一个 `InputOTP.Separator`，
 * 视觉上是 `3 位 + 短横 + 3 位`。UPinInput 用 `separator` prop 表达同样的分组：
 *   `:separator="3"` → 在第 3 位后插一个分隔符（内部还会自动跳过最后一位，
 *   不会在末位后多插一个）。默认值取 `Math.floor(length / 2)`：
 *   length=6（默认）→ 3，与旧版 Checkin.tsx 完全一致；length<4 时不插。
 * 分隔符默认内容是 `-`（契约第 11 条）；旧版 `InputOTP.Separator` 其实是个
 * **没有文字**的 `h-[2px] w-[6px] rounded-sm bg-separator` 小横条，
 * 这里用 `-` 字符 + `text-fg-subtle` 近似，页面要还原可以走 #separator 插槽。
 *
 * ────────────────────────────────────────────────────────────────────────
 * 四、迁页面示例（Checkin.tsx:46）
 * ────────────────────────────────────────────────────────────────────────
 *   <!-- 旧 -->
 *   <InputOTP maxLength={6} pattern={REGEXP_ONLY_DIGITS} inputMode="numeric"
 *             value={value} onChange={setValue} autoFocus aria-label="验收码"
 *             className="justify-center">
 *     <InputOTP.Group><InputOTP.Slot index={0} /><InputOTP.Slot index={1} /><InputOTP.Slot index={2} /></InputOTP.Group>
 *     <InputOTP.Separator />
 *     <InputOTP.Group><InputOTP.Slot index={3} /><InputOTP.Slot index={4} /><InputOTP.Slot index={5} /></InputOTP.Group>
 *   </InputOTP>
 *
 *   <!-- 新：6 位 / 数字都是默认值；pattern 显式写出来更清楚。
 *        注意 :pattern="..." 里是 JS 表达式，正则字面量要带斜杠（别写成字符串） -->
 *   <AppInputOTP v-model="value" :length="6" input-mode="numeric" :pattern="/^\d+$/"
 *                auto-focus aria-label="验收码" class="justify-center" />
 */
import { computed } from 'vue'

const props = withDefaults(defineProps<{
  /** v-model，整个码拼成一个字符串（页面里 /^\d{6}$/.test(value) 继续可用） */
  modelValue: string
  /** 旧版 maxLength；默认 6（Checkin 的验收码位数） */
  length?: number
  inputMode?: 'numeric' | 'text'
  /** 逐位过滤（旧版 REGEXP_ONLY_DIGITS = /^\d+$/）；不传则不额外过滤 */
  pattern?: RegExp
  autoFocus?: boolean
}>(), {
  length: 6,
  inputMode: 'numeric',
})

const emit = defineEmits<{
  'update:modelValue': [value: string]
}>()

/** 逐位数组 → 底层；空位不占位（reka 靠数组长度判断填到第几位） */
const chars = computed(() => Array.from(props.modelValue ?? '').slice(0, props.length))

/** 分隔符位置：length=6 → 3（与旧版 Checkin.tsx 的 Group 切分一致）；太短就不插 */
const separatorAt = computed(() => (props.length >= 4 ? Math.floor(props.length / 2) : undefined))

/**
 * 逐位匹配 pattern。
 * 注意：带 g / y 标志的正则复用同一个实例会带 lastIndex 状态（`.test()` 结果会飘），
 * 所以每次用 source + 去掉 g/y 的标志新建一个（量级很小，逐位调用无压力）。
 */
function accept(char: string): boolean {
  if (!props.pattern) return true
  const flags = props.pattern.flags.replace(/[gy]/g, '')
  return new RegExp(props.pattern.source, flags).test(char)
}

function onUpdate(value: (string | number)[] | undefined): void {
  const next = (value ?? [])
    // filter 会跳过数组空洞（reka 删位时用 delete 制造空洞），再兜一层 null 判断，
    // 避免 String(undefined) 把 'undefined' 拼进验证码
    .filter((item): item is string | number => item !== undefined && item !== null)
    .map(item => String(item))
    .filter(char => accept(char))
    .join('')
    .slice(0, props.length)
  // 受控用法下父组件必然回写；值没变就不 emit，避免多余的 watch 抖动
  if (next !== props.modelValue) emit('update:modelValue', next)
}

/** 只做「向本站 token 对齐」的最小覆盖，不重写 reka 的行为与动画 */
const ui = {
  // 旧 .input-otp 根是 `flex w-full`、gap-2；Nuxt 默认是 inline-flex 且不定宽，
  // 不补 w-full 的话页面写的 justify-center（旧版 className）不生效
  root: 'w-full gap-2',
  // 旧 .input-otp__slot：h-10 w-9.5 text-lg font-semibold + bg-field；
  // Nuxt outline 默认 bg-default（中性色）→ 换本站卡片色
  base: 'h-10 w-9.5 bg-elevated text-lg font-semibold',
  // 旧 InputOTP.Separator 是 2px×6px 的小横条，这里用 muted 色的短横近似
  separator: 'text-fg-subtle',
}
</script>

<template>
  <UPinInput
    :model-value="chars"
    :length="length"
    :type="inputMode === 'numeric' ? 'number' : 'text'"
    :separator="separatorAt"
    :autofocus="autoFocus"
    :ui="ui"
    @update:model-value="onUpdate"
  >
    <template #separator="{ index }">
      <slot name="separator" :index="index">-</slot>
    </template>
  </UPinInput>
</template>
