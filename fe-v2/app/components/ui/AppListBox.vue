<script setup lang="ts">
/**
 * AppListBox —— HeroUI v3 `ListBox` + `ListBox.{Item,ItemIndicator}` → Nuxt UI v4 `UListbox`
 *                的兼容层。参考实现就是本站已迁好的 `pages/console/more.vue`
 *                （`:items` + `#item` 作用域插槽 + `:highlight-on-hover="false"`），
 *                本组件只是把那一段抽出来、补上 `selectionMode` / `v-model` / `action`。
 *
 * 旧版真实调用点（`grep -rn '<ListBox' fe/src` 命中 19 行，5 个 ListBox 根）：
 *   - `pages/More.tsx:19`            页面级列表：`selectionMode="none"` + `onAction` ← **本组件的正主**
 *   - `pages/CourseSettings.tsx:164`      在 `Select.Popover` 内 → 归 AppSelect
 *   - `pages/ExperimentDetail.tsx:273`    在 `Select.Popover` 内 → 归 AppSelect
 *   - `pages/ExperimentDetail.tsx:649`    在 `Select.Popover` 内 → 归 AppSelect
 *   - `pages/FocusStudents.tsx:784`       在 `Autocomplete.Filter` 内 → 归 AppAutocomplete
 *
 * ────────────────────────────────────────────────────────────────────────
 * 一、prop / slot / 事件对照
 * ────────────────────────────────────────────────────────────────────────
 * 旧 HeroUI                            | AppListBox              | 底层 UListbox
 * -------------------------------------|-------------------------|-------------------------------
 * items（`ListBox.Item` 手写 map）     | items                   | items（Nuxt 逐项字段全支持）
 * selectionMode="none"                 | selection-mode="none"   | `multiple=false` + 把
 *                                       |                         | modelValue 锁成 `null`
 * selectionMode="single"               | selection-mode="single" | `multiple=false` +
 *                                       |                         | `selectionBehavior="replace"`
 * selectionMode="multiple"             | selection-mode="multiple" | multiple
 * selectedKeys / onSelectionChange     | v-model（modelValue /   | `multiple` 时是数组
 *                                       | update:modelValue）     |
 * onAction={(key) => …}                | @action="(item) => …"   | item 激活（点击 / Enter / Space）
 * className                            | class                   | 根（`ui.root`，见「二、3」）
 * aria-label                           | aria-label              | attrs 透传到根
 * `<ListBox.Item id textValue>{label}` | `#item` 作用域插槽      | `#item`（`{ item, index, ui }`）
 *                                       | `{ item, selected,      |
 *                                       |   select, toggle }`     |
 * `<ListBox.Item className>`           | `item.class`            | 与 `ui.item` 一起过 tailwind-merge
 * `<ListBox.Item onAction>`            | `item.onSelect`         | Nuxt 惯例（与根 `@action` 同时触发）
 * `<ListBox.ItemIndicator />`          | 内置对勾                | `#item-trailing` + `isSelected`
 * `renderEmptyState`                   | ❌ 未提供                | `#empty`（Nuxt 默认「暂无数据」）
 *
 * ────────────────────────────────────────────────────────────────────────
 * 二、底层与 ui 覆盖（Nuxt UI MCP `get-component Listbox` + 读
 *    `node_modules/@nuxt/ui/dist/runtime/components/Listbox.vue` 与
 *    `reka-ui/dist/Listbox/*.js` 源码核实）
 * ────────────────────────────────────────────────────────────────────────
 * 1. `UListbox` **没有** `selectionMode`，只有布尔 `multiple`（默认 false）；
 *    也**没有** `action` 事件，emits 只有
 *    `update:modelValue` / `change` / `highlight` / `leave` / `entryFocus`。
 *    → `selectionMode` 由本组件翻译（见上表），`action` 由
 *      `@update:model-value` 的载荷反推（载荷就是那个 item 对象本身）。
 * 2. ⚠ `selectionMode="none"` 怎么做到「点得动但选不上」：
 *    reka `ListboxRoot` 的 `useVModel` 有个 `passive: props.modelValue === void 0`
 *    —— 传 `undefined` 会走**内部状态**（选得上），必须传 `null`（非 undefined）
 *    才进入**受控模式**，点击虽然照样 emit，但值永远落不下来。
 *    旧 HeroUI 的 `selectionMode="none"` 也正是「不可选、只有 onAction」。
 * 3. 主题根是 `flex flex-col … ring ring-inset ring-default rounded-lg`，
 *    那个 ring 是给下拉面板用的；`AppListBox` 是页面里平铺的一段列表
 *    → `ui.root` 给 `ring-0`。宽度不用管：`flex` 块级元素自然撑满父容器。
 * 4. `:highlight-on-hover="false"` 照抄 `more.vue`：默认 hover 会给 item 打上
 *    `data-highlighted`，而旧版 `More.tsx` 的高亮是**自己**写在
 *    `item.class` 里的（`hover:bg-sunken/60` / active 行 `bg-brand-500/10`），
 *    两套叠在一起会把 active 行的底色冲掉。关掉之后
 *    `data-[highlighted]:bg-sunken/60` 只在键盘漫游时出现。
 *    ⚠ 副作用（与 `more.vue` 现状一致，不是新引入的）：reka 挂载时会跑一次
 *    `watch(modelValue, …, { immediate: true })` → `highlightSelected()`，
 *    于是**第一项**在页面进来时就带 `data-highlighted`（`more.vue` 现在是
 *    `before:bg-elevated/50`，换成本组件的写法后变成 `bg-sunken/60`，
 *    稍明显一点）。这是「可以从这里开始按方向键」的提示，别当成选中态。
 * 5. 主题的 item 高亮同样是 `data-highlighted:…:before:bg-elevated/50` 伪元素叠色，
 *    与 `More.tsx` 自己写的背景打架 → `before:hidden`，改成 item 自身背景。
 * 6. 选中态用 reka 的 **`data-state="checked"`**（`ListboxItem.js`），
 *    文字色用 important 后缀 `!` 盖掉主题的 `data-highlighted:…:text-highlighted`
 *    （同 `pages/console/more.vue` 的 `!p-2` 写法）。
 * 7. 对勾走 `#item-trailing` 自绘，判定用**本组件自己算的** `selected`，
 *    所以即便页面把 `modelValue` 存成 `item.value`（而不是 item 对象），
 *    对勾也照常出现 —— 见「三、2」。
 * 8. 键盘一行都不用自己写：`ArrowUp/Down/Home/End` 漫游、`Enter`/`Space` 选中、
 *    字母首字搜索（typeahead）全是 reka `ListboxRoot` 自带的
 *    （`onKeydownNavigation` / `onKeydownEnter` / `onKeydownTypeAhead`）。
 *
 * ────────────────────────────────────────────────────────────────────────
 * 三、⚠ 迁页面注意事项
 * ────────────────────────────────────────────────────────────────────────
 * 1. `id` → `value`、`textValue` → `label`：
 *      旧 `<ListBox.Item id={item.to} textValue={item.label}>{item.label}`
 *      新 `{ label: item.label, value: item.to }`
 *    `onAction={(key) => navigate(String(key))}` → `@action="item => navigateTo(item.value)"`
 *    （`String()` 转换可以去掉；如果页面把 key 存在别的字段上，
 *      `@action` 给的是**整个 item**，用 `item.你的字段` 即可）。
 * 2. ⚠ `v-model` 建议存 **item 对象本身**（`selected` 判定与 `item.value` 都兼容，
 *    但只有存对象时 reka 自己的 `data-state="checked"` / `aria-selected` 才跟着对）。
 *    存 key 的话 reka 那边会比不上（它的 item value 就是对象，`valueKey` 才能换），
 *    表现为屏幕阅读器读不出选中，但视觉与对勾仍然正确。
 * 3. `item.class` 里写旧版的 `className` 即可（`px-3 py-3 / gap-3 / rounded-xl`…），
 *    UListbox 会把 `[ui.item, item.ui?.item, item.class]` 一起交给 tailwind-merge，
 *    能正确顶掉主题的 `p-1.5 / gap-1.5 / items-start`。
 * 4. `More.tsx` 那种「整行自己排版」的行，用 `#item` 作用域插槽：
 *      `<AppListBox :items="items" @action="go">` + `<template #item="{ item }">…</template>`
 *    （`:highlight-on-hover="false"` 组件内部已经写死，页面不用再传。）
 *    `#item` 只替换 item **内部内容**，item 自身的 `item.class` 仍然生效。
 *    ⚠ 一旦用了 `#item`，对勾（`#item-trailing`）就不会再渲染 —— 这与旧版一致
 *    （自定义的 `ListBox.Item` 里不写 `<ItemIndicator />` 就没有对勾），
 *    页面用插槽给的 `selected` 自己画即可。
 * 5. 想在自定义 item 里放一个「自己控制的选中开关」，用插槽给的
 *    `select` / `toggle`（会走 `update:modelValue` + `action`），
 *    不要直接改 `item`（那是 props）。
 * 6. item 逐项字段（`label` / `value` / `icon` / `avatar` / `chip` / `description` /
 *    `disabled` / `class` / `ui` / `onSelect` / `type: 'label' | 'separator'`）
 *    全部是 Nuxt 原生的，页面按 Nuxt 的写法给就行。
 * 7. `items` 为空时显示 Nuxt 默认的「暂无数据」文案（旧版 `renderEmptyState`
 *    只有 `FocusStudents` 用过，而那处归 AppAutocomplete 的 `emptyText`）。
 */
import { computed, ref, useAttrs, watch } from 'vue'

/**
 * class / aria-label 都落在 UListbox 的根上。
 * `UListbox` 声明了 `class` prop（并进 `ui.root`），其余 attrs 由它的
 * `inheritAttrs: false` 手动 `v-bind` 到 reka 的 `ListboxRoot`，所以整体透传即可。
 */
defineOptions({ inheritAttrs: false })

const props = withDefaults(defineProps<{
  /** 旧版是手写 `<ListBox.Item>` map 出来的；这里给 Nuxt 形状的对象数组 */
  items?: unknown[]
  /** 旧版 ListBox 的 selectionMode */
  selectionMode?: 'none' | 'single' | 'multiple'
  /** 受控选中值；multiple 时是数组。不绑也能用（内部兜一个值） */
  modelValue?: unknown
}>(), {
  items: () => [],
  selectionMode: 'none',
})

const emit = defineEmits<{
  'update:modelValue': [value: unknown]
  /** 旧版 onAction(key) —— 这里给的是被点的那个 item */
  action: [item: unknown]
}>()

const attrs = useAttrs()

/** 没绑 v-model 时也能自己切换（对应 HeroUI 的非受控用法） */
const inner = ref<unknown>(props.modelValue)
watch(() => props.modelValue, (value) => { inner.value = value })

const current = computed(() => (props.modelValue === undefined ? inner.value : props.modelValue))

/**
 * `selectionMode="none"` 必须传 `null` 而不是 `undefined`：
 * reka 的 `useVModel(..., { passive: props.modelValue === void 0 })` 只有在
 * 收到非 undefined 的值时才进入受控模式，受控了值就落不下来（见文件头「二、2」）。
 */
const listModel = computed(() => (props.selectionMode === 'none' ? null : current.value))

/** single 用 replace：重复点已选项时回的还是这个 item，@action 才拿得到正确值 */
const selectionBehavior = computed(() => (props.selectionMode === 'single' ? 'replace' : undefined))

function itemKey(value: unknown): unknown {
  if (value !== null && typeof value === 'object') {
    const record = value as { value?: unknown; id?: unknown }
    return record.value ?? record.id ?? value
  }
  return value
}

/** 同时兼容「modelValue 存 item 对象」与「存 item.value / item.id」两种写法 */
function sameItem(a: unknown, b: unknown): boolean {
  if (a === b) return true
  return itemKey(a) === itemKey(b)
}

function isSelected(item: unknown): boolean {
  if (props.selectionMode === 'none') return false
  const value = current.value
  if (value == null) return false
  if (Array.isArray(value)) return value.some((entry) => sameItem(entry, item))
  return sameItem(value, item)
}

/** 插槽给页面的「选中这一项」 */
function select(item: unknown) {
  if (props.selectionMode === 'none') return
  inner.value = item
  emit('update:modelValue', item)
  emit('action', item)
}

/** 插槽给页面的「切换这一项」（multiple 时进/出数组） */
function toggle(item: unknown) {
  if (props.selectionMode === 'multiple') {
    const list = Array.isArray(current.value) ? current.value : []
    const index = list.findIndex((entry) => sameItem(entry, item))
    const next = index === -1
      ? [...list, item]
      : list.filter((_, i) => i !== index)
    inner.value = next
    emit('update:modelValue', next)
    emit('action', item)
    return
  }
  select(item)
}

/**
 * UListbox 只有 `update:modelValue`，没有 `action`：
 * 它的载荷就是被点的那个 item 对象（reka 的 item value = item 本身），
 * 所以点击 / Enter / Space 三种激活方式统一从这里转成 `@action`。
 */
function onUpdateModelValue(value: unknown) {
  inner.value = value
  // 旧版 selectionMode="none" 不会触发任何选中变化，只触发 onAction
  if (props.selectionMode !== 'none') emit('update:modelValue', value)
  emit('action', value)
}

const ui = {
  /** 主题根自带 ring（那是下拉面板的观感），这里平铺在页面里 → 去掉 */
  root: 'ring-0',
  content: 'max-h-72',
  /** item：主题的 before 叠色会冲掉 item.class 里旧版写的背景 → 换成自身背景 */
  item: [
    'items-center gap-2 rounded-lg px-2.5 py-2 text-fg before:hidden',
    'data-[highlighted]:bg-sunken/60',
    'data-[state=checked]:bg-brand-500/10',
    'data-[state=checked]:text-brand-600! dark:data-[state=checked]:text-brand-300!',
  ],
  itemLabel: 'truncate',
  itemDescription: 'truncate text-xs text-fg-subtle',
  itemTrailing: 'ms-auto inline-flex shrink-0 items-center',
  label: 'px-2 py-1.5 text-[11px] font-semibold text-fg-muted',
  separator: 'bg-line',
  empty: 'px-2 py-4 text-center text-xs text-fg-subtle',
}
</script>

<template>
  <UListbox
    v-bind="attrs"
    :items="items"
    :model-value="listModel"
    :multiple="selectionMode === 'multiple'"
    :selection-behavior="selectionBehavior"
    :highlight-on-hover="false"
    :ui="ui"
    @update:model-value="onUpdateModelValue"
  >
    <!-- 自定义单项（`More.tsx` 那种整行自己排版）；不传时用 Nuxt 默认的 label + 描述 -->
    <template v-if="$slots.item" #item="{ item, index }">
      <slot
        name="item"
        :item="item"
        :index="index"
        :selected="isSelected(item)"
        :select="() => select(item)"
        :toggle="() => toggle(item)"
      />
    </template>

    <!-- 旧版 <ListBox.ItemIndicator />：对勾由本组件自己算的 selected 驱动 -->
    <template #item-trailing="{ item }">
      <UIcon
        v-if="isSelected(item)"
        name="i-lucide-check"
        class="size-4 shrink-0 text-brand-600 dark:text-brand-300"
      />
    </template>
  </UListbox>
</template>
