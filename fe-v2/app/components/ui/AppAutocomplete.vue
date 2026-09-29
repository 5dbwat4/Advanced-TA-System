<script setup lang="ts">
/**
 * AppAutocomplete —— HeroUI v3 `Autocomplete`（+ `Autocomplete.{Trigger,Value,ClearButton,Indicator,Popover,Filter}`）
 * → `AppInput` + `UPopover` + `UListbox` 的兼容层
 *
 * 真实调用点只有 1 处（`grep -rn '<Autocomplete' fe/src` 只命中 FocusStudents），
 * 契约里说的「7 处」是 `FocusStudents.tsx:762-798` 那 37 行里的 **7 个 Autocomplete JSX 标签**
 * （Autocomplete / Trigger / Value / ClearButton / Indicator / Popover / Filter），
 * 并按文件归属记到了 FocusStudents / StudentFinder / QuestionDrawer 三个文件上。
 * 实测 `StudentFinder.tsx` 与 `QuestionDrawer.tsx` **没有** Autocomplete：
 *   - StudentFinder 是裸 `Input` + `matchStudent` 过滤 + 自绘 motion 列表（不弹层），
 *     迁页面时它的搜索框要拼 `items[].keywords`，面板要自己写 motion 列表，不走本组件；
 *   - QuestionDrawer 完全没有搜索 UI。
 * 搜索语义上两者与本组件一致（都走 `useFilter` 的 `contains`），所以拼音能力不会丢。
 *
 * ────────────────────────────────────────────────────────────────────────
 * 一、prop / slot 对照（MIGRATION.md §4.5 第 4 条，冻结）
 * ────────────────────────────────────────────────────────────────────────
 * 旧 HeroUI（FocusStudents.tsx:762-798） | AppAutocomplete        | 底层
 * ---------------------------------------|------------------------|-------------------------------
 * value + onChange                      | v-model（modelValue /  | UListbox 的 modelValue
 *                                       | update:modelValue）     |
 * selectionMode="single"                | ——（v-model 只有一       | 单选由 v-model 保证，不需要
 *                                       | 个值，天然单选）        | selectionMode
 * Autocomplete.Popover > ListBox        | items: { label, value,  | UListbox :items
 *   （ListBox.Item id=… textValue=…）   |   keywords? }[]         |
 * Autocomplete.Filter filter={contains} | ——（内部用 useFilter    | 组件内 useFilter().contains
 *                                       | 的 contains 过滤）      | + items[].keywords
 * Autocomplete.Filter > SearchField     | placeholder（同一个输入 | AppInput（UInput）
 *   （autoFocus / SearchIcon /          | 框既显示选中项又做搜索） |
 *    Input / ClearButton）               | isClearable             | 右侧自绘 X
 * Autocomplete.Trigger > Value          | ——（选中后输入框显示    | displayText 计算属性
 *   （选中显示 label）                  | label 而非 value）      |
 * Autocomplete.Trigger > ClearButton    | isClearable             | 右侧自绘 X（emit null）
 * Autocomplete.Trigger > Indicator      | ——（内置右侧 chevron，   | UIcon i-lucide-chevron-down
 *   （下拉箭头）                        | 面板展开时旋转）        |
 * ListBox renderEmptyState              | emptyText               | UListbox #empty
 * ListBox.Item 的内容                   | #item 作用域 { item,    | UListbox #item
 *   （含 ListBox.ItemIndicator）        |   selected }            |
 * ListBox.ItemIndicator                 | ——（默认内容里已画      | UIcon i-lucide-check
 *                                       | 好勾；页面自带 #item    |
 *                                       | 时自己画，语义同旧版）  |
 * ListBox.Item className                | ——（内部按 activeIndex  | item.class + :ui.item
 *                                       | 生成）                  |
 * className（作用在触发区）             | class（作用在本组件     | 根 div
 *                                       | 根 div）                |
 *
 * emits: update:modelValue（选中项 value；清空时发 null）
 *        ——旧版 `Autocomplete.ClearButton` 没有单独回调，AppSelect 才有 `clear`，
 *           这里对齐旧版：`isClearable` 的清空就是一次 `update:modelValue(null)`。
 *
 * ────────────────────────────────────────────────────────────────────────
 * 二、弹层选型（已用 Nuxt UI MCP `get-component-metadata` 逐个核实）
 * ────────────────────────────────────────────────────────────────────────
 * 结论：**`UInput`（经 AppInput）+ `UPopover` + `UListbox`**，不用 UCommandPalette。
 *
 * 1) `UCommandPalette` —— 否决
 *    - 它自带输入框（`input` prop，默认 true，`ui.input` 可覆写），要当「挂在
 *      AppInput 下面的下拉」就必须 `input: false` 把搜索框摘掉，那它就退化成一个
 *      没有搜索框的命令面板，和 HeroUI 旧版「Trigger 显示 Value、Filter 里另有一个
 *      SearchField」的结构对不上。
 *    - 搜索由它内部的 fuse.js 驱动，key 固定 `['label','description','suffix']`、
 *      默认 `resultLimit: 12`、还要过 `ignoreFilter` 才能换成我们的拼音过滤——
 *      等于把整条筛选管线接管过去，却拿不回「拼音候选」这个旧版行为。
 *    - 另外它默认带 `close` / `back` / `trailingKbds`（⌘K 面板的镀铬）与嵌套分组、
 *      虚拟化，属于为一个 7 处的单选框准备的重量级组件。
 * 2) `UInputMenu`（Reka Combobox，关键词就是 autocomplete）—— 否决，但值得记一笔
 *    - 它是最贴题的原生件（自带 input+弹层+键盘上下/回车/Esc），可 §4.5 第 4 条
 *      把底层冻结成「`UInput` + 弹层」，而且它自带输入框会破坏
 *      「class 透传到最内层 input」这条全站不变式（AppInput 的核心价值）。
 *    - 真要换，只需把 `useFilter` 传进去即可，本组件的 props/slots 不用动。
 * 3) `UListbox` —— 采用
 *    - `ignoreFilter`：关掉它自己的过滤，我们把 `useFilter().contains` 过滤好的
 *      `items` 喂进去（拼音语义必须自己说了算，这是硬需求）。
 *    - `filter: false`（默认）：面板里不再出现第二个输入框，全屏只有一个搜索框。
 *    - `valueKey` / `labelKey` / `by` / `items[].class` / `#item` / `#empty` 齐备，
 *      `#item` 作用域是 `{ item, index, ui }`（和 more.vue 的用法一致）。
 *    - 鼠标选中、item 排列、间距、hover 全部免费拿到。
 * 4) 键盘为什么自己写：Reka Listbox 的上下键漫游依赖 **DOM 焦点在列表上**，
 *    而我们的焦点必须留在输入框里（否则就没法边打字边筛选）。所以
 *    `↑ / ↓ / Enter / Esc` 统一挂在根 div 的 `@keydown` 上（事件从内部 input 冒泡上来），
 *    高亮行由 `activeIndex` + `item.class` 控制，并设 `:highlight-on-hover="false"`
 *    让鼠标 hover 也走同一个 `activeIndex`，保证任何时刻只有一行被高亮
 *    （Nuxt 默认的 `before:bg-elevated/50` 叠色也因此不会和我们的高亮打架）。
 * 5) 视觉 `ui` 覆盖：面板 `bg-elevated border border-line rounded-xl p-1 shadow-lg ring-0`
 *    （Nuxt 的 popover/content 默认是 `bg-default` + `p-4` + `ring`，靠 tailwind-merge 顶掉），
 *    高亮行 `bg-brand-500/10`。
 *
 * ────────────────────────────────────────────────────────────────────────
 * 三、⚠️ 迁页面注意事项
 * ────────────────────────────────────────────────────────────────────────
 * 1) **旧版 `filter` 回调 → 新版 `items[].keywords`**（重点）
 *    旧：`candidates.map((s) => ({ id: s.stuId, textValue: `${s.name} ${s.studentNo}` }))`
 *        传 `textValue`，既当显示文案又当 `contains` 的被过滤字段 → **只能搜姓名/学号**。
 *    新：
 *        items: students.map((s) => ({
 *          label: `${s.name} ${s.studentNo}`,
 *          value: s.stuId,
 *          keywords: [s.name, s.studentNo, pinyinIndex(s.name).full, pinyinIndex(s.name).initials].join(' '),
 *        }))
 *    `label` 负责显示（旧版 textValue 的位置），`value` 就是旧版 `ListBox.Item` 的 `id`，
 *    `keywords` 负责匹配。**不写 `keywords` 也能搜到拼音**（`contains` 自己会算
 *    `label` 的拼音候选），但学号/别名这类额外字段只有 `keywords` 能带进来。
 * 2) **旧版 `selectionMode="single"` → 单选由 v-model 保证**
 *    本组件只有一个 `modelValue`，不要传数组；旧页面 `String(addStuId)` 这类
 *    number/string 转换可以去掉（`value` 原样回传）。
 * 3) **两个输入框变一个**：旧版是「Trigger 显示 Value（label）+ 弹层里 SearchField 负责搜索」，
 *    新版合并成同一个输入框——展开时输入框变成空的可编辑态，收起时显示 `label`。
 *    所以旧页面里 `Autocomplete.Filter` 那个 `autoFocus` 不需要再单独配（面板一打开
 *    输入框本来就是焦点）；需要「点外面才聚焦」的页面请自行 `@focus` 处理。
 * 4) `emptyText` 取代旧版 `<ListBox renderEmptyState={() => <EmptyState>…}>`，
 *    旧版「没有匹配的学生」这类文案直接写进 `empty-text`。
 * 5) 筛选有 **300ms 防抖**（与题库搜索同一节奏，§4.4-H）；清空输入是立即生效的，
 *    不会出现「删完还筛着」的残留。
 * 6) 组件暴露了 `focus()` / `open()` / `close()` / `clear()`：
 *    `focus()` 用于「搜索框自动聚焦」（§4.4-H）这类入口。
 */
import { computed, onBeforeUnmount, ref, useTemplateRef, watch } from 'vue'

import { useFilter } from '~/composables/useFilter'
import { cn } from '~/lib/utils'

export type AppAutocompleteItem = {
  label: string
  value: string | number
  /** 参与匹配的额外关键字（学号 / 拼音 / 别名），`label` 本身永远参与匹配 */
  keywords?: string
  [extra: string]: unknown
}

/** 与题库搜索同节奏的输入防抖（ms） */
const DEBOUNCE = 300

const props = withDefaults(defineProps<{
  /** 选中项的 value；null / undefined = 未选中 */
  modelValue?: string | number | null
  items: AppAutocompleteItem[]
  placeholder?: string
  isDisabled?: boolean
  /** 旧版 `Autocomplete.ClearButton` */
  isClearable?: boolean
  /** 旧版 `ListBox renderEmptyState` */
  emptyText?: string
}>(), {
  modelValue: null,
  emptyText: '没有匹配的结果',
})

const emit = defineEmits<{
  'update:modelValue': [value: string | number | null]
}>()

const { contains } = useFilter({ sensitivity: 'base' })

const rootEl = useTemplateRef('root')
const panelEl = useTemplateRef('panel')
/** AppInput 通过 defineExpose 暴露了 focus()（旧版 `inputRef.current?.focus()`） */
const inputRef = useTemplateRef('input')

const isOpen = ref(false)
/** 输入框此刻的真实内容（展开态） */
const query = ref('')
/** 防抖后的查询词，筛选以它为准 */
const debouncedQuery = ref('')
/** 键盘 / 鼠标共用的高亮行下标 */
const activeIndex = ref(0)

const selectedItem = computed(() => props.items.find((item) => item.value === props.modelValue) ?? null)

/**
 * 收起时输入框显示选中项的 label（不是 value，旧版 `Autocomplete.Value` 的行为）；
 * 此时输入框是只读的，点一下 / 按 ↓ 就会展开成可编辑态。
 */
const isPristine = computed(() => !isOpen.value && selectedItem.value !== null)
const displayText = computed(() => (isOpen.value ? query.value : (selectedItem.value?.label ?? '')))

/** `label` + `keywords` 拼成匹配用的 haystack（拼音由 useFilter 内部算） */
const searchable = computed(() =>
  props.items.map((item) => ({
    item,
    haystack: item.keywords ? `${item.label} ${item.keywords}` : item.label,
  })),
)

const filtered = computed(() => {
  const needle = debouncedQuery.value
  if (!needle.trim()) return props.items
  return searchable.value.filter((entry) => contains(entry.haystack, needle)).map((entry) => entry.item)
})

/** 喂给 UListbox 的 items：高亮行靠 item.class（与 pages/console/more.vue 同一套写法） */
const listItems = computed(() =>
  filtered.value.map((item, index) => ({
    ...item,
    class: cn(
      'cursor-pointer transition-colors hover:bg-brand-500/10',
      index === activeIndex.value && 'bg-brand-500/10',
    ),
  })),
)

const showClear = computed(() => Boolean(props.isClearable) && selectedItem.value !== null)

/** Nuxt UI 的 popover 内容默认 `bg-default` + `p-4` + `ring`，逐条顶成本站观感 */
const popoverUi = {
  content: 'bg-elevated border border-line rounded-xl p-1 shadow-lg ring-0',
}

const listboxUi = {
  /** 外层 content 已经给了 p-1，这里不要再叠一层 */
  content: 'p-0',
  /**
   * `before:hidden`：Nuxt 主题的 item 高亮是 `before:bg-elevated/50` 伪元素叠色，
   * 而面板本身就是 `bg-elevated`，叠同色等于看不见（与 AppSelect 文件头「二、3」同源结论）。
   * 本组件的高亮走自身背景 + item.class，所以直接把这个伪元素关掉。
   */
  item: 'flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-sm text-fg before:hidden',
}

// ── 输入 → 筛选（300ms 防抖；清空立即生效） ───────────────────────────────
let timer: ReturnType<typeof setTimeout> | undefined

watch(query, (value) => {
  if (timer) clearTimeout(timer)
  if (!value) {
    debouncedQuery.value = ''
    return
  }
  timer = setTimeout(() => {
    debouncedQuery.value = value
  }, DEBOUNCE)
})

onBeforeUnmount(() => {
  if (timer) clearTimeout(timer)
})

/** 换一批候选就回到第一行（否则高亮会停在越界的位置） */
watch(filtered, () => {
  activeIndex.value = 0
})

// ── 展开 / 收起 / 选中 ──────────────────────────────────────────────────
function open() {
  if (props.isDisabled) return
  query.value = ''
  debouncedQuery.value = ''
  isOpen.value = true
  const index = filtered.value.findIndex((item) => item.value === props.modelValue)
  activeIndex.value = index >= 0 ? index : 0
}

function close() {
  isOpen.value = false
}

/** 旧版 `ListBox.Item` 的选中：回传 value（= 旧版 `id`），收起面板并把输入框还原成 label */
function select(value: string | number) {
  emit('update:modelValue', value)
  query.value = ''
  debouncedQuery.value = ''
  isOpen.value = false
}

/** UListbox 的 update:modelValue（`value-key="value"` → item.value） */
function onSelect(value: unknown) {
  const resolved = value !== null && typeof value === 'object'
    ? (value as { value?: string | number }).value
    : value
  if (resolved == null) return
  select(resolved)
}

/** 旧版 `Autocomplete.ClearButton`：清空 = 一次 `update:modelValue(null)`（没有单独 clear 事件） */
function clear() {
  emit('update:modelValue', null)
  query.value = ''
  debouncedQuery.value = ''
  isOpen.value = false
  inputRef.value?.focus()
}

function onFocus() {
  open()
}

function onInput(value: string | number | null) {
  query.value = value == null ? '' : String(value)
  activeIndex.value = 0
  if (props.isDisabled) return
  // 收起状态下继续打字（例如 Esc 之后）要能重新展开
  isOpen.value = true
}

/**
 * 焦点离开才算收起，但**焦点移进弹层面板不算**（面板在 portal 里，
 * 不在 rootEl 的 DOM 子树内）；否则点候选项时面板会先一步消失、点击落空。
 * 面板外部的点击与 Esc 交给 UPopover 的 dismissible。
 */
function onFocusOut(event: FocusEvent) {
  const next = event.relatedTarget as Node | null
  if (next && (rootEl.value?.contains(next) || panelEl.value?.contains(next))) return
  isOpen.value = false
}

/**
 * 用 `@update:open` 而不是 `v-model:open`：禁用态下触发区（点输入框）仍可能发出
 * 「打开」，这里统一挡掉，避免弹出一个空面板。
 */
function onPopoverOpenChange(next: boolean) {
  isOpen.value = next && !props.isDisabled
}

// ── 键盘（挂在根 div 上，从内部 input 冒泡） ────────────────────────────
/** 排除功能键 / 快捷键组合，只留「可打印字符」 */
function isPrintableKey(event: KeyboardEvent) {
  return event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey
}

function onKeydown(event: KeyboardEvent) {
  if (props.isDisabled) return
  const total = filtered.value.length

  // 输入框里正显示着选中项的 label（只读）时，打字 = 换选择
  if (isPrintableKey(event) && isPristine.value) {
    open()
    query.value = event.key
    activeIndex.value = 0
    // 此时输入框还是 readonly，浏览器不会往旧 label 上再插一次
    event.preventDefault()
    return
  }

  if (event.key === 'ArrowDown') {
    event.preventDefault()
    if (!isOpen.value) {
      open()
      return
    }
    activeIndex.value = total > 0 ? (activeIndex.value + 1) % total : 0
    return
  }

  if (event.key === 'ArrowUp') {
    event.preventDefault()
    if (!isOpen.value) {
      open()
      return
    }
    activeIndex.value = total > 0 ? (activeIndex.value - 1 + total) % total : 0
    return
  }

  if (event.key === 'Enter') {
    if (!isOpen.value || total === 0) return
    const target = filtered.value[activeIndex.value]
    if (!target) return
    event.preventDefault()
    select(target.value)
    return
  }

  if (event.key === 'Escape' && isOpen.value) {
    event.preventDefault()
    close()
  }
}

defineExpose({
  /** 聚焦输入框（旧版 `inputRef.current?.focus()`，§4.4-H「搜索框自动聚焦」） */
  focus: () => inputRef.value?.focus(),
  open,
  close,
  clear,
})
</script>

<template>
  <div
    ref="root"
    class="relative w-full cursor-pointer"
    @keydown="onKeydown"
    @focusout="onFocusOut"
  >
    <UPopover
      :open="isOpen"
      :dismissible="!isDisabled"
      :content="{ side: 'bottom', align: 'start', sideOffset: 8, collisionPadding: 8 }"
      :ui="popoverUi"
      @update:open="onPopoverOpenChange"
    >
      <!-- 这层 relative div 同时是弹层锚点：宽度锁满，按钮按旧版绝对定位 -->
      <div class="relative w-full">
        <AppInput
          ref="input"
          :model-value="displayText"
          :placeholder="placeholder"
          :disabled="isDisabled"
          :readonly="isPristine"
          autocomplete="off"
          class="pl-10 pr-9 ring-line"
          @update:model-value="onInput"
          @focus="onFocus"
        />

        <!-- 旧版 `SearchField.SearchIcon`（FocusStudents 是 left-3.5 + pl-10） -->
        <UIcon
          name="i-lucide-search"
          class="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-fg-subtle"
        />

        <!--
          旧版 `Autocomplete.ClearButton`。四件套 stop 是必须的：Reka 的 Popover 触发器
          在 click / pointerdown 上切换开合（哪个事件随版本而定），全挡掉才不会
          「清空的同时又把面板打开」；`pointerdown.prevent` 顺带保住输入框焦点
          （同 AppSelect 的清空按钮写法）。
        -->
        <button
          v-if="showClear"
          type="button"
          aria-label="清空"
          class="absolute right-2 top-1/2 flex size-6 -translate-y-1/2 items-center justify-center rounded-md text-fg-subtle transition-colors hover:bg-sunken/60 hover:text-fg"
          @pointerdown.stop.prevent
          @pointerup.stop
          @mousedown.stop
          @click.stop="clear"
        >
          <UIcon name="i-lucide-x" class="size-4" />
        </button>

        <!-- 旧版 `Autocomplete.Indicator`：有值可清空时让位给 X -->
        <UIcon
          v-else
          name="i-lucide-chevron-down"
          class="pointer-events-none absolute right-2.5 top-1/2 size-4 -translate-y-1/2 text-fg-subtle transition-transform"
          :class="isOpen && 'rotate-180'"
        />
      </div>

      <template #content>
        <!--
          `@mousedown.prevent`：面板在 portal 里，浏览器默认会把焦点交给可聚焦的
          ListboxRoot；一旦焦点离开输入框，Reka 自己的高亮就和我们的 activeIndex
          打架。挡住 mousedown 的默认行为即可让焦点始终留在输入框
          （Reka 是在 pointerup 上做选中，不受影响）。
        -->
        <div
          ref="panel"
          class="min-w-(--reka-popover-trigger-width) max-h-72 overflow-auto bg-elevated"
          @mousedown.prevent
        >
          <UListbox
            :items="listItems"
            :model-value="modelValue"
            value-key="value"
            :disabled="isDisabled"
            :ignore-filter="true"
            :highlight-on-hover="false"
            :ui="listboxUi"
            @update:model-value="onSelect"
          >
            <template #item="{ item }">
              <slot name="item" :item="item" :selected="item.value === modelValue">
                <span class="min-w-0 flex-1 truncate">{{ item.label }}</span>
                <UIcon
                  v-if="item.value === modelValue"
                  name="i-lucide-check"
                  class="ms-auto size-4 shrink-0 text-brand-500"
                />
              </slot>
            </template>
            <template #empty>
              <p class="px-3 py-4 text-center text-xs text-fg-subtle">{{ emptyText }}</p>
            </template>
          </UListbox>
        </div>
      </template>
    </UPopover>
  </div>
</template>
