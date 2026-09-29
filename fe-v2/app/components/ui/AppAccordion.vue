<script setup lang="ts">
/**
 * AppAccordion —— HeroUI v3 `Accordion` → Nuxt UI v4 `UAccordion` 的兼容层（7 处）
 *
 * 旧版真实用法只有 `pages/LlmConnect.tsx:553`（客户端接入指引折叠面板），
 * 结构是 `Accordion > Accordion.Item > (Heading > Trigger > Indicator) + (Panel > Body)`，
 * 共 3 个 `clientGuides` 项；`variant="surface"` + `allowsMultipleExpanded`。
 *
 * ────────────────────────────────────────────────────────────────────────
 * 一、prop / slot / 事件对照
 * ────────────────────────────────────────────────────────────────────────
 * 旧（HeroUI v3）          | AppAccordion                | 底层 UAccordion
 * -------------------------|------------------------------|--------------------------------
 * allowsMultipleExpanded   | type="multiple"（默认值）    | type
 * （无 → 单开）            | type="single"               | type
 * selectedKeys（页面自管）  | v-model:modelValue: string[]| v-model:modelValue
 * <Accordion.Item id>      | items[].value               | items[].value（valueKey）
 * <Accordion.Trigger> 文案  | items[].label               | items[].label（labelKey）
 * <Accordion.Indicator>    | 内部自带（chevron-down）    | trailingIcon（展开时旋转 180°）
 * <Accordion.Item disabled>| items[].disabled            | items[].disabled
 * （无图标位）              | items[].icon                | items[].icon / #leading
 * <Accordion.Body>         | #body 插槽（{ item, open }） | #body 插槽
 * variant="surface"        | 见「三」的 :ui 覆盖         | ui.content / ui.body …
 * className                | class（落到最外层 <div>）    | ui.root
 *
 * ────────────────────────────────────────────────────────────────────────
 * 二、旧版 compound 结构的收敛
 * ────────────────────────────────────────────────────────────────────────
 * 旧版要写 6 层子组件（Item/Heading/Trigger/Indicator/Panel/Body），
 * 新版全部由 UAccordion 内部生成，页面只写 `items` + `#body`：
 *   - `Heading` + `Trigger` → UAccordion 内部 `header` + `trigger`
 *   - `Indicator`（旧版手动塞 `<ChevronDown/>`）→ UAccordion 的 `trailingIcon`
 *     默认就是 `i-lucide-chevron-down`，主题自带 `group-data-[state=open]:rotate-180`，
 *     展开/收起的旋转行为与旧版一致，不用自己重写。
 *   - `Panel` → `content` 槽（UAccordion 只在有 `content`/插槽时才渲染，
 *     我们恒定提供 `#body`，所以永远存在）
 *   - `Body` → `#body` 插槽，作用域 `{ item, index, open, ui }`
 *     （本组件只往外放行契约约定的 `{ item, open }`）
 *
 * ────────────────────────────────────────────────────────────────────────
 * 三、⚠️ variant="surface" 的替代（契约第 9 条）
 * ────────────────────────────────────────────────────────────────────────
 * Nuxt UI 没有 surface 变体，按契约用 `:ui` 复刻「分隔线 + 凹陷内容面板」的观感：
 *   item         → 分隔线（主题默认 `border-b border-default` → 换成本站 `border-line`）
 *   content      → 内容区 `bg-sunken border border-line rounded-xl`（契约点名要加的就是这层）
 *   body         → 旧 `Accordion.Body className="flex flex-col gap-2"` → 同款排布
 *   label/trigger→ 文案色换成本站 `text-fg`
 *   trailingIcon → 旧版 ChevronDown 是 16px（主题默认 size-5），收到 size-4
 *
 * **展开动画完全不重写**：主题自带的
 * `data-[state=open]:animate-[accordion-down_200ms_var(--ease-out)]` /
 * `data-[state=closed]:animate-[accordion-up_...]` +
 * `data-[state=closed]:overflow-hidden` 都保留（`:ui` 只做 tailwind-merge 追加，
 * 不会顶掉这些类）。
 *
 * ────────────────────────────────────────────────────────────────────────
 * 四、迁页面示例（LlmConnect.tsx:553）
 * ────────────────────────────────────────────────────────────────────────
 *   <!-- 旧 -->
 *   <Accordion allowsMultipleExpanded variant="surface" className="w-full">
 *     {clientGuides.map((g) => (
 *       <Accordion.Item key={g.id} id={g.id}>
 *         <Accordion.Heading><Accordion.Trigger>{g.name}
 *           <Accordion.Indicator><ChevronDown width={16} height={16} /></Accordion.Indicator>
 *         </Accordion.Trigger></Accordion.Heading>
 *         <Accordion.Panel><Accordion.Body className="flex flex-col gap-2">…</Accordion.Body></Accordion.Panel>
 *       </Accordion.Item>
 *     ))}
 *   </Accordion>
 *
 *   <!-- 新：value=旧 id，label=旧 Trigger 文案，正文进 #body -->
 *   <AppAccordion v-model:model-value="open" type="multiple" class="w-full"
 *                 :items="guides">
 *     <template #body="{ item, open }">…{{ item.value }}…</template>
 *   </AppAccordion>
 *
 * ⚠️ `items` 里**不要**加 `slot` 字段：UAccordion 的 `item.slot` 会被当成插槽名，
 *    一旦有值就会把 `content`/`body` 换成那个名字（契约的 items 形状本来也没有它）。
 */
import { computed, type Component } from 'vue'

interface AppAccordionItem {
  label: string
  value: string
  /** 图标：字符串走 UAccordion 内置 UIcon；组件（unplugin-icons）走 #leading */
  icon?: string | Component
  disabled?: boolean
}

const props = withDefaults(defineProps<{
  items: AppAccordionItem[]
  /** 旧版 allowsMultipleExpanded；默认多开（7 处旧用法里 LlmConnect 就是多开） */
  type?: 'single' | 'multiple'
  /** 受控展开值：multiple 时是数组，single 时是单值（页面自己管，见契约第 9 条） */
  modelValue?: string[]
}>(), {
  type: 'multiple',
  modelValue: () => [],
})

const emit = defineEmits<{
  'update:modelValue': [value: string[]]
}>()

/** 单开模式下 UAccordion 回传的是字符串，这里统一成数组对外 */
function toArray(value: string | string[] | undefined): string[] {
  if (value === undefined) return []
  return Array.isArray(value) ? value : [value]
}

const model = computed<string | string[]>({
  get: () => (props.type === 'multiple' ? (props.modelValue ?? []) : (props.modelValue?.[0] ?? '')),
  set: (value) => { emit('update:modelValue', toArray(value)) },
})

/** items[].icon 传组件时 UAccordion 只会当字符串喂给 UIcon，需要自己渲染 #leading */
const hasComponentIcon = computed(() => props.items.some((item) => !!item.icon && typeof item.icon !== 'string'))

/** 展开动画交给主题的 accordion-down/up，这里只补「分隔线 + 凹陷内容面板」 */
const ui = computed(() => ({
  item: 'border-b border-line last:border-b-0',
  content: 'bg-sunken border border-line rounded-xl',
  body: 'flex flex-col gap-2 p-3',
  trigger: 'text-fg',
  label: 'text-fg font-semibold',
  trailingIcon: 'size-4 text-fg-muted',
}))
</script>

<template>
  <UAccordion
    v-model="model"
    :items="items"
    :type="type"
    :ui="ui"
  >
    <template v-if="hasComponentIcon" #leading="{ item }">
      <component :is="item.icon" class="size-5 shrink-0 text-fg-muted" />
    </template>
    <!-- 只在页面真的给了 #body 时才声明这个插槽：UAccordion 是靠 `!!slots.body`
         决定要不要渲染 content 区，没人给正文时不至于留一个空的凹陷面板 -->
    <template v-if="$slots.body" #body="{ item, open }">
      <slot name="body" :item="item" :open="open" />
    </template>
  </UAccordion>
</template>
