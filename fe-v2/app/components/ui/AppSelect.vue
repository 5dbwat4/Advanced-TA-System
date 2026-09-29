<script setup lang="ts">
/**
 * AppSelect —— HeroUI v3 `Select` + `Select.{Trigger,Value,Indicator,Popover,ClearButton}`
 *              与 Popover 内部那个 `ListBox` → Nuxt UI v4 `USelect` 的兼容层。
 *
 * 旧版真实调用点（`grep -rn '<Select' fe/src` 命中 17 行，全部是同一套复合结构）：
 *   - `pages/CourseSettings.tsx:151`   Checkpoint 规则（无 ClearButton、无 onClear）
 *   - `pages/ExperimentDetail.tsx:258` 抽题题目集（ClearButton + onClear）
 *   - `pages/ExperimentDetail.tsx:634` `HomeworkSelect` 内部组件（ClearButton + onClear）
 *   （`FocusStudents` / `QuestionDrawer` / `Experiments` 命中的是 `Autocomplete`，
 *     里面的 `ListBox` 由 AppAutocomplete 自己渲染 —— 见 MIGRATION §4.5 第 4 条，
 *     **不要**在 Autocomplete 里手写 AppListBox。）
 *
 * ────────────────────────────────────────────────────────────────────────
 * 一、prop / slot / 事件对照
 * ────────────────────────────────────────────────────────────────────────
 * 旧 HeroUI                          | AppSelect                  | 底层 USelect
 * -----------------------------------|----------------------------|--------------------------------
 * value + onChange(key)              | v-model（modelValue /      | `valueKey` 默认就是 `'value'`，
 *                                     | update:modelValue）        | 回传的是 `item.value`，
 *                                     |                            | 与旧版 `key` 语义一致
 * isDisabled                         | is-disabled                | disabled
 * placeholder                        | placeholder                | placeholder
 * isClearable / `<Select.ClearButton>` | is-clearable             | ❌ **USelect 没有 clearable**
 *                                     |                            |    （只有 `USelectMenu` 有
 *                                     |                            |    `clear` prop + `clear` 事件，
 *                                     |                            |    但它是可搜索的 Combobox），
 *                                     |                            |    所以清空按钮在 `#trailing`
 *                                     |                            |    里自绘（见「二、2」）
 * size                               | size                       | size
 * className                          | class                      | `ui.base`（= 触发按钮本身）
 * aria-label                         | aria-label                 | attrs 透传到触发按钮
 * onClear                            | @clear                     | ❌ USelect 无此事件，自绘按钮 emit
 * `<Select.Trigger>`                 | 内置，**不接受替换**        | Reka `SelectTrigger`（真正的 `<button>`）
 * `<Select.Value>`                   | 内置（= USelect 的 default | Reka `SelectValue`（自带
 *                                     | 插槽底座，有值/placeholder  | 有值 / placeholder 两态与 ui 键）
 *                                     | 两态）                      |
 * `<Select.Indicator>`               | 内置（在 `#trailing` 里）   | 自绘 chevron-down
 * `<Select.Popover>`                 | 内置                       | `content`（`ui.content` 覆盖观感）
 * Popover 里的 `<ListBox>`           | 内置                       | `items` 渲染
 * `<ListBox.ItemIndicator>`          | 内置（对勾）                | `UIcon` + `ui.itemTrailingIcon`
 * `<ListBox.Item>{label}<ItemIndicator/>` | `#item` 作用域插槽    | `#item`（`{ item, index, ui }`）
 * 想完全自定义触发区内容             | `#trigger` 插槽             | USelect 的 `default` 插槽
 *
 * ────────────────────────────────────────────────────────────────────────
 * 二、底层与 ui 覆盖（Nuxt UI MCP `get-component Select` + 读
 *    `node_modules/@nuxt/ui/dist/runtime/components/Select.vue` 源码核实）
 * ────────────────────────────────────────────────────────────────────────
 * 1. `USelect` 的 props 清单里**没有** `clearable`，emits 里也**没有** `clear`
 *    （只有 `update:modelValue` / `update:open` / `change` / `blur` / `focus`）。
 *    契约第 3 条里那句「底层 USelect（items + #item + clearable）」按当前版本**不成立**，
 *    所以 `isClearable` / `clear` 由本组件在 `#trailing` 里手绘补齐（键盘逻辑不重写）。
 * 2. 清空按钮必须挡住触发器的事件，否则会顺带把下拉开合：
 *    Reka 的 `SelectTrigger` 在 **pointerdown**（左键）/ **pointerup**（触摸）时开面板，
 *    在 click 时 focus，所以三个都要 `stop`（源码 `SelectTrigger.js`）。
 *    外层是 `<button>`，不能再塞 `<button>`（非法嵌套），用 `span[role=button]`。
 * 3. 主题的 item 高亮是 `data-highlighted:not-data-disabled:before:bg-elevated/50`
 *    —— 伪元素叠色，而面板本身就是 `bg-elevated`，叠同色**等于看不出高亮**。
 *    → `before:hidden` + 改用 `data-[highlighted]:bg-sunken/60`
 *    （Reka 把 `data-highlighted` 打在 item 上，键盘上下 / hover 都会给，
 *      键盘可达性一行都不用自己写）。
 * 4. 选中态用的是 Reka 的 **`data-state="checked"`**（源码 `SelectItem.js`），
 *    不是 `data-selected`。主题自带的 `data-highlighted:…:text-highlighted`
 *    会和选中态的 `text-brand-600` 打架，所以选中文字色用 Tailwind v4 的
 *    important 后缀 `!` 强制（同 `pages/console/more.vue` 的 `!p-2` 写法）。
 * 5. ⚠ Reka `SelectItem` 的 `value` 是空字符串会直接 **throw**
 *    （源码里有显式 `throw new Error(...)`）→ item 的 `value` 不能是 `''`，
 *    旧版拿 `''` 当「未绑定」哨兵的页面要改成 `null`。
 * 6. 宽度：旧 HeroUI `Select` 的根不是整宽，宽度全靠 `className`
 *    （`min-w-[12rem]` / `w-full`），所以这里**刻意不给** `ui.base` 加 `w-full`，
 *    否则 `ExperimentDetail` 顶部那行 `flex items-center gap-2` 会被挤变形。
 *    面板宽度仍由 `w-(--reka-select-trigger-width)` 自动跟随触发器。
 *
 * ────────────────────────────────────────────────────────────────────────
 * 三、⚠ 迁页面注意事项
 * ────────────────────────────────────────────────────────────────────────
 * 1. `onChange={(key) => … String(key)}`：v-model 拿到的就是 `item.value` 本身，
 *    页面原来存字符串就把 `String()` 去掉；原来存数字（`bank.id`）就保持数字。
 * 2. `<ListBox.Item id={item.id} textValue={item.name}>` →
 *    `:items="[{ label: item.name, value: item.id }]"`（`textValue` 消失，等于 `label`）。
 * 3. 「未绑定」用 `null`（`value: ''` 会让 Reka 抛错，见「二、5」）。
 * 4. 清空时 `update:modelValue(null)` 与 `clear` **两个都会发**（与旧版 HeroUI 一致），
 *    所以 v-model 绑的回调和 `@clear` 要幂等 —— 旧版 `ExperimentDetail` 两处
 *    都是 `bind('')`，天然幂等，不用改。
 * 5. 触发区想自己排版用 `#trigger`（只覆盖按钮**内部内容**；外层 `<button>`、
 *    焦点、Enter/Space/上下键/首字母搜索全是 Reka 的，别自己写 keydown）。
 *    清空按钮与箭头在 `#trailing`，不受 `#trigger` 影响。
 * 6. 焦点在触发器上时 `Delete` / `Backspace` 等价于点清空按钮
 *    （旧版 HeroUI 的 ClearButton 键盘不可达，这里算净收益）。
 * 7. 单个 item 想禁用：`{ label, value, disabled: true }` 直通（Nuxt 原生支持）。
 * 8. 全站旧版选中项的类名是 `bg-brand-500/10` + `text-brand-600 dark:text-brand-300`
 *    （`More.tsx` 的 active 行是 `bg-brand-500/10 ring-1 ring-brand-500/25`），
 *    已写进下面的 `ui.item`，页面 `#item` 里不用再自己上色。
 */
import { computed, useAttrs } from 'vue'

import { cn } from '~/lib/utils'

/**
 * class 与 aria-label 都要落在触发按钮上。
 * USelect 声明了 `class` prop 并把它并进 `ui.base`（触发按钮），
 * 其余 attrs（aria-* / data-* / name / id…）由它的 `inheritAttrs: false`
 * 手动 `v-bind` 到内部 SelectTrigger，所以整体透传即可。
 */
defineOptions({ inheritAttrs: false })

type AppSelectItem = {
  label: string
  /** 旧版 ListBox.Item 的 `id`；不能是空字符串（见文件头「二、5」） */
  value: string | number
  disabled?: boolean
  /** Nuxt 原生字段直通：icon / description / class / ui / type… */
  [extra: string]: unknown
}

const props = withDefaults(defineProps<{
  /** v-model；旧版 onChange 给的就是它（= 选中项的 value） */
  modelValue?: string | number | null
  items?: AppSelectItem[]
  placeholder?: string
  /** 旧版 isDisabled（保留 is 前缀） */
  isDisabled?: boolean
  /** 旧版 <Select.ClearButton> / isClearable */
  isClearable?: boolean
  size?: 'sm' | 'md' | 'lg'
}>(), {
  items: () => [],
  size: 'md',
})

const emit = defineEmits<{
  'update:modelValue': [value: string | number | null]
  /** 旧版 onClear */
  clear: []
}>()

const attrs = useAttrs()

/** 有值且可清除时才显示清空按钮（旧版 HeroUI ClearButton 的行为） */
const showClear = computed(() => props.isClearable === true
  && props.isDisabled !== true
  && props.modelValue != null)

/** item 的 value 就是旧版的 key（`valueKey` 默认 'value'） */
function itemValue(item: unknown): unknown {
  return item !== null && typeof item === 'object'
    ? (item as { value?: unknown }).value
    : item
}

function isSelected(item: unknown): boolean {
  if (props.modelValue == null) return false
  const value = itemValue(item)
  if (value === props.modelValue) return true
  // 旧页面里 value 有时是数字、有时被 String() 过，这里做一次宽松比较
  return value != null && String(value) === String(props.modelValue)
}

function onUpdateModelValue(value: unknown) {
  // Reka 选中后可能回 undefined，统一收敛成 null（旧版 onChange 里 `key == null` 判的就是它）
  emit('update:modelValue', (value ?? null) as string | number | null)
}

function onClear() {
  emit('update:modelValue', null)
  emit('clear')
}

/** 键盘删除：焦点在触发器上时 Delete / Backspace 等价于点清空按钮 */
function onKeydown(event: KeyboardEvent) {
  if (!showClear.value) return
  if (event.key !== 'Delete' && event.key !== 'Backspace') return
  event.preventDefault()
  onClear()
}

const ui = computed(() => ({
  /** 触发按钮：观感对齐 AppInput（bg-elevated + ring-line + rounded-lg） */
  base: cn(
    'rounded-lg bg-elevated text-fg ring-line',
    // 有清空按钮时右侧要给「清空 + 箭头」两个图标留位置（见「二、2」）
    showClear.value ? 'pe-12' : '',
  ),
  value: 'truncate',
  placeholder: 'truncate text-fg-subtle',
  /** 清空按钮 + 箭头；`pe-2` 让箭头不贴边 */
  trailing: 'gap-1 pe-2',
  /** 下拉面板 */
  content: 'bg-elevated border border-line rounded-xl shadow-lg ring-0',
  /** item：主题的 before 叠色看不见高亮 → 换成自身背景；选中态用 data-state=checked */
  item: cn(
    'rounded-lg text-fg before:hidden',
    'data-[highlighted]:bg-sunken/60',
    'data-[state=checked]:bg-brand-500/10',
    'data-[state=checked]:text-brand-600! dark:data-[state=checked]:text-brand-300!',
  ),
  itemLabel: 'truncate',
  itemTrailingIcon: 'size-4 text-brand-600 dark:text-brand-300',
  label: 'px-2 py-1.5 text-[11px] font-semibold text-fg-muted',
  separator: 'bg-line',
  empty: 'px-3 py-4 text-center text-xs text-fg-subtle',
}))
</script>

<template>
  <USelect
    v-bind="attrs"
    :model-value="modelValue"
    :items="items"
    :placeholder="placeholder"
    :disabled="isDisabled"
    :size="size"
    :ui="ui"
    @update:model-value="onUpdateModelValue"
    @keydown="onKeydown"
  >
    <!--
      `#trigger` 只替换触发按钮的**内部内容**（USelect 的 default 插槽）。
      Reka 会在外面再套一层 RSelectValue（有值 / placeholder 两态 + 对应 ui 键），
      所以页面写 `#trigger` 不会把焦点环、键盘、aria 弄丢。
    -->
    <template v-if="$slots.trigger" #default="{ modelValue: slotValue, open }">
      <slot name="trigger" :model-value="slotValue" :open="open" />
    </template>

    <!-- 清空按钮 + 展开箭头（= 旧 Select.Indicator / Select.ClearButton） -->
    <template #trailing>
      <span
        v-if="showClear"
        role="button"
        tabindex="-1"
        aria-label="清除选择"
        class="flex size-4 shrink-0 items-center justify-center rounded text-fg-subtle transition-colors hover:text-fg"
        @pointerdown.stop
        @pointerup.stop
        @mousedown.stop
        @click.stop="onClear"
      >
        <UIcon name="i-lucide-x" class="size-3.5" />
      </span>
      <UIcon name="i-lucide-chevron-down" class="size-4 shrink-0 text-fg-subtle" />
    </template>

    <!-- 自定义单项（班级名 truncate 等）；不传时用 Nuxt 默认的 label + 对勾 -->
    <template v-if="$slots.item" #item="{ item, index }">
      <slot name="item" :item="item" :index="index" :selected="isSelected(item)" />
    </template>
  </USelect>
</template>
