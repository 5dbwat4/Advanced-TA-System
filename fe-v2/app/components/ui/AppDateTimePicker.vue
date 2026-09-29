<script setup lang="ts">
/**
 * AppDateTimePicker —— HeroUI v3 `DatePicker`（4 层 render-prop）→ 单个受控组件
 * （旧版 `fe/src/components/ui/DateTimePicker.tsx`，80 行；调用方 6 处：
 *   pages/Experiments.tsx:153-155 三处、pages/ExperimentDetail.tsx:337-354 三处）
 *
 * 这是兼容层里**唯一一个自写**的组件：Nuxt UI 没有 HeroUI 那种 segment 式时间输入，
 * 只有 `UCalendar`（月历）+ 自己写的分段输入层。
 *
 * ══════════════════════════════════════════════════════════════════════════
 * 一、旧版四层 render-prop 结构 → 新版单组件结构的对照
 * ══════════════════════════════════════════════════════════════════════════
 * 旧（HeroUI v3，调用方看不见这四层，全在组件内部）：
 *   DatePicker<ZonedDateTime>            → 本组件 <script setup> 的 props/emits
 *     ├─ Label                            → 内置 <label>（旧 className 逐字保留）
 *     ├─ DateField.Group                  → 触发区那层「输入框」外观的 div
 *     │   ├─ DateField.Input(render-prop) → 一组 v-for 出来的 <input>（每段一个）
 *     │   │   └─ DateField.Segment        → 每段一个 input：可打字 / ↑↓ 加减 / 自动跳段
 *     │   └─ DateField.Suffix
 *     │       ├─ Button(清除)             → 内置 UButton icon="i-lucide-x"
 *     │       └─ DatePicker.Trigger
 *     │           └─ TriggerIndicator     → 内置 UButton icon="i-lucide-calendar"
 *     └─ DatePicker.Popover               → <UPopover>（自带 outside-click / Esc 关闭）
 *         └─ Calendar
 *             ├─ Header                   → UCalendar 的 monthControls 前后箭头
 *             │   ├─ YearPickerTrigger    → UCalendar 的 viewControl（点标题 day→month→year）
 *             │   └─ NavButton previous/next → :prev-month / :next-month
 *             ├─ Grid / GridHeader        → UCalendar 内建（weekday-format="narrow"）
 *             ├─ GridBody / Cell          → UCalendar 内建（点击选日 → @update:model-value）
 *             └─ YearPickerGrid           → UCalendar 的 year 视图（点标题两级可达）
 *
 * props / emits（严格照 MIGRATION.md §4.5 第 13 条冻结契约，未改名、未换语义）：
 *   modelValue: ZonedDateTime | null   v-model（用 @internationalized/date 的 ZonedDateTime）
 *   label?: string                     字段名，同时用于 aria-label
 *   granularity?: 'minute'|'hour'|'day' 默认 'minute'
 *   isDisabled?: boolean               旧 HeroUI isDisabled 语义（禁用输入 + 禁用开面板）
 *   class?: string                     旧版 className="w-full" 加在 DatePicker 根 div 上
 *                                      → 新版 class 透传到同一个位置的根 div
 *   emits: update:modelValue           旧版 onChange(next ? next.toDate().toISOString() : null)
 *
 * ⚠️ Phase C 迁 `Experiments` / `ExperimentDetail` 时注意值的换算（后端 API 仍是 ISO 串）：
 *   :model-value="parseAbsoluteToLocal(publishTime)"
 *   @update:model-value="(v) => setPublishTime(v ? v.toDate().toISOString() : null)"
 *   （`normalize()` 内部也容忍 ISO 字符串，但**不要**依赖它，类型上仍是 ZonedDateTime）
 *
 * ══════════════════════════════════════════════════════════════════════════
 * 二、「旧版支持的全部交互」逐条 → 新实现的落点（证明没丢功能）
 * ══════════════════════════════════════════════════════════════════════════
 *  旧版交互（来源：DateTimePicker.tsx 全文 + react-aria / heroui 内建语义）
 *  ─────────────────────────────────────────────────────────────────────────
 *  1. 字段名标签（小号加粗灰字，块级，带 1.5 下边距）→ 内置 <label class="mb-1.5 block
 *     text-xs font-semibold text-fg-muted">，用 `for` 指向年分段，点击标签聚焦年分段
 *     （旧版 HeroUI Label 同样会 focus 字段；这里**没有**用 AppLabel，因为它硬编码了
 *      `inline-block`，与旧 className 里的 `block` 会在同层打架，见 AppLabel.vue 头注）
 *  2. 整宽输入框外观                              → FIELD_CLASS（bg-elevated border-line
 *     rounded-lg + focus-within 品牌色环，与 AppInput / 全站表单同一套观感）
 *  3. 未选择时显示分段占位符（react-aria 中文 locale
 *     会渲染「年/月/日 时:分」这五个字面量）        → 每段 <input placeholder="年|月|日|时|分">，
 *     未选中时 value 为空、只留灰色占位符；分隔符「/ / ␣ : 」照常显示
 *  4. 分段键盘打字（年 4 位、月/日/时/分各 2 位）→ @input 逐字符解析 → applySegment
 *     → 立即 emit（保持旧版 DateField「改一段就 onChange 一次」的实时语义，
 *       ExperimentDetail 的 dirty 判断依赖这一点）
 *  5. 打字填满自动跳到下一段                     → onSegmentInput 里 digits.length === 段长时 focus 下一段
 *  6. 空段按 Backspace 回到上一段                 → onSegmentKeydown
 *  7. ↑/↓ 对当前段 ±1 且循环（12→1、23→0、59→0）→ cycleSegment（day 的上界按当月天数算）
 *  8. hourCycle=24（00~23，不是 01~12）          → SEGMENT_RANGE.hour = [0, 23]
 *  9. hideTimeZone（面板里没有时区分段）          → 时区只有一个，字段里根本不出现
 * 10. granularity="minute"（年月日 + 时:分）      → 见下面「三、granularity 的实现」
 * 11. 清除按钮：有值且未禁用才出现，aria-label
 *     =「清除${label}」                            → canClear + UButton icon="i-lucide-x"
 *     （@click.stop：否则会连带触发外层 PopoverTrigger 的 toggle）
 * 12. 日历图标触发器打开面板                      → UPopover 整块触发区（点框内任意处都能开，
 *     比旧版「只能点图标」更好用；再点一次收起 —— 见模板里的 @pointerdown.stop 注）
 * 13. 面板里上/下月切换                          → UCalendar :month-controls（默认 true）
 * 14. 面板里选年（点标题两级：日→月→年）          → UCalendar :view-control（默认 true）
 * 15. 面板里点日期即选中                          → @update:model-value → onPickDate
 * 16. 选完日期不立刻关面板（因为还有时间要调）      → granularity != 'day' 时保持打开；
 *     'day' 时选完即关（等价旧版 day 粒度的收尾）
 * 17. Esc 关闭面板                                → UPopover 内建（面板内焦点）
 *     + 根节点 @keydown.esc（焦点在分段输入时也能关）
 * 18. 点遮罩 / 点面板外关闭                        → UPopover :dismissible 默认 true
 * 19. Enter 确认（并关闭）                         → 分段与面板输入的 @keydown Enter → finish()；
 *     面板底部另有「完成」按钮给出可点击的等价物（面板里 Tab 能走完全部控件）
 * 20. 非法值回退                                 → normalize 解析失败 → 当作未选中
 *     （与旧版一致，旧版 try/catch 返回 null）      + **工作副本**回退到「当前时间」
 *     （契约 §4.5 第 13 条要求）：modelValue 为 null 时 draft = now(本地时区)，
 *     但界面仍显示占位符、不会凭空回填；用户一旦编辑/点选才落盘。
 *  21. 底部「现在」快捷项                          → 面板底部「现在」（契约 §4.5 第 13 条要求；
 *     ⚠️ 旧版**没有**这个按钮，属于只增不减的超集）
 *  22. isDisabled 时整块不可用                      → pointer-events-none + 所有控件 disabled
 *     （旧版 isDisabled 会同时禁掉输入与面板，这里行为一致）
 * 23. 键盘可达 / 焦点                            → 5 个分段可 Tab、清除与图标按钮可 Tab、
 *     面板内可 Tab 走完；图标按钮 aria-label=「选择${label}日期时间」，
 *     面板 role="dialog" aria-label=${label}，分段 aria-label=「${label}年/月/日/时/分」
 *
 * ══════════════════════════════════════════════════════════════════════════
 * 三、granularity 的实现
 * ══════════════════════════════════════════════════════════════════════════
 *   'minute'（默认，旧版唯一用到的一种）→ 年/月/日 + 时:分，面板带时间行
 *   'hour'                             → 年/月/日 + 时，面板带时间行（分钟在内部保留，不显示）
 *   'day'                              → 只有年/月/日，面板**不渲染**时间行，
 *                                        且选中日期 / 点「现在」时把时分秒归零
 *                                        （等价旧版 day 粒度「只选到天」的语义）
 *   内部一律用完整的 ZonedDateTime 承载值 → 切粒度不会丢时刻，emits 的类型始终是 ZonedDateTime。
 *
 * ══════════════════════════════════════════════════════════════════════════
 * 四、底层 Nuxt UI 组件（均已用 Nuxt UI MCP `get-component(-metadata)` 核实）
 * ══════════════════════════════════════════════════════════════════════════
 *  UCalendar（不是 UCalendarRange）
 *    - v-model 类型 `CalendarDate | CalendarDateTime | ZonedDateTime | DateRange | DateValue[]`。
 *      本组件**只喂 CalendarDate**（`toCalendarDate(draft)`），这样月历点选返回值与
 *      时区/时间无关，跨 DST 也不会错位；点选结果再自己拼回 ZonedDateTime。
 *    - `:placeholder` + `@update:placeholder` 拿来做「翻月」状态（受控），旧版的
 *      NavButton 就是这个；`v-model` 只管选中日，两者分工与旧版一致。
 *    - `weekday-format="narrow"`（一二三四五六日）、`:week-starts-on="1"`（周一开头）、
 *      `:locale="'zh-CN'"` —— ⚠️ 本项目没装 @nuxtjs/i18n，Nuxt UI 的 useLocale() 恒为 'en'，
 *      不显式传 locale 的话标题会变 "September 2026"，而旧版 react-aria 吃的是
 *      浏览器 locale（本项目 <html lang="zh-CN">）→ 显式钉死中文。
 *    - `size="sm"` + `type="date"`（默认）：点标题即可 day→month→year 切换，
 *      等价旧版 YearPickerTrigger + YearPickerGrid。
 *    - `ui.body` 只覆盖 `pt-4 → pt-2`（面板更紧凑），其余走主题（品牌色由
 *      app.config.ts 的 ui.colors.primary='brand' 提供）。
 *  UPopover
 *    - `open` 受控（`v-model:open`）、`content` 用 `defu` 合并默认（side/sideOffset/
 *      collisionPadding）、`dismissible` 默认 true → 面板外点击与 Esc 关闭都是内建行为。
 *    - `ui.content` 覆盖 `bg-default→bg-elevated`、`ring→ring-0`、`rounded-md→rounded-xl`；
 *      ⚠️ 保留主题里的 `data-[state=open/closed]:animate-[scale-in/out…]`，
 *      所以面板本身有 Nuxt UI 自带的缩放过渡（§4.4-I：不要用自定义 class 盖掉自带过渡）。
 *    - 默认 slot 是 PopoverTrigger（as-child）→ 整块触发区 div 就是触发器（reka 的
 *      `PopoverTrigger` 只有 onClick，没有 keydown）；面板内容在 `portal`（默认 true）
 *      里，会 teleport 到 body，DOM 上不是触发区的后代。
 *    - `tabindex="-1"`：触发区是 div，本身不可聚焦，而 reka 关闭面板后会把焦点还给
 *      触发器（`triggerRef.focus()`）；给个 tabindex 才能接住这个焦点（不进 Tab 序列）。
 *    - `@pointerdown.stop`：见模板里的注 —— 否则点触发区会被 DismissableLayer 判成
 *      「面板外」先关一次、click 再开回来，出现闪烁。
 *  UButton（清除 / 日历图标）：`icon="i-lucide-x"` / `"i-lucide-calendar"`（Iconify 名，
 *    与 error.vue 一致），`ui.base` 压到 24~28px 方块，icon-only 语义。
 *  AppButton（面板底部「现在」/「完成」）：复用兼容层按钮，自带全站按压反馈。
 *
 * ══════════════════════════════════════════════════════════════════════════
 * 五、动效（§4.4-B / C / I）
 * ══════════════════════════════════════════════════════════════════════════
 *  - 面板缩放淡入：Nuxt UI UPopover 自带（data-state 的 scale-in/out + ease-out），
 *    没有用 AnimatePresence —— 面板被 portal 到了 body，不在触发器的 DOM 子树里，
 *    触发器侧的 AnimatePresence 根本管不到它。
 *  - 面板内容入场：motion-v 的 `motion.div`（opacity 0→1 + scale .96→1 + y -4→0，
 *    180ms easeOut）。面板每次关闭是真卸载（reka Presence 不 forceMount），
 *    所以每次打开都会重放这段入场。
 *  - 分段/清除/图标按钮：交给 main.css 末尾的全局 `:active { scale: .97 }` 兜底
 *    （与 AppButton 一致，不重复加 transform 过渡，避免和全局规则打架）。
 *
 * 六、两个已知的有意取舍（写明以免 Phase D 走查时误判为退化）
 *  1) 点触发区是**切换**语义（关着→开，开着→关），包括点分段输入框本身。所以
 *     「面板开着 → 想点某个分段改字」会先把面板收起来；要在面板开着时调时段，
 *     请用面板里那一行时间控件（带 −/+ 按钮，鼠标用户完全不必打字）。
 *  2) 值一变就立刻 emit（旧版 DateField 也是实时 onChange），所以在空字段里
 *     打一个「2」（年份）会立刻提交「0002-09-29 现在时刻」这类中间值 —— 这与
 *     react-aria 的分段中间态行为一致，blur 后定格为完整值。
 *  3) 显示格式用「2026/09/29 23:30」这种紧凑写法（旧版 react-aria 在中文 locale
 *     下是「2026年09月29日 23时30分」，同宽但更宽）。空值占位符则保留旧版的
 *     「年/月/日 时:分」，因为它正好在说明「这里有哪些段可填」。
 */
import { computed, ref, useId, watch } from 'vue'

import {
  CalendarDate,
  fromDate,
  getLocalTimeZone,
  now,
  parseAbsoluteToLocal,
  parseZonedDateTime,
  toCalendarDate,
  type DateValue,
  type ZonedDateTime,
} from '@internationalized/date'
import { motion } from 'motion-v'

import { cn } from '~/lib/utils'

/**
 * 月历语言：本项目没装 @nuxtjs/i18n，Nuxt UI 的 useLocale() 恒为 'en'，
 * 不显式传 locale 的话标题会变英文（旧版 react-aria 走浏览器 locale = zh-CN）。
 */
const CALENDAR_LOCALE = 'zh-CN'

/** 周一开头：reka / UCalendar 默认 0（周日），中文日历惯例是周一。
 *  写成 `as const` 是为了让它保持字面量类型 —— 该 prop 是 0|1|2|… 的联合类型，
 *  模板里直接写 `:week-starts-on="1"` 会被推断成 number。 */
const WEEK_STARTS_ON = 1 as const

/** 面板定位：底部、左侧对齐（Nuxt UI 会用 defu 与它自己的默认值合并）。
 *  `as const` 让 side/align 保持字面量类型 —— 这两个 prop 是字符串联合类型，
 *  直接在模板里写对象字面量会被推断成 string。 */
const POPOVER_CONTENT = { side: 'bottom', align: 'start', sideOffset: 8, collisionPadding: 8 } as const

/** 面板容器：bg-elevated + border-line + rounded-xl（只覆盖观感，保留 Nuxt UI 自带过渡） */
const POPOVER_CONTENT_CLASS = 'bg-elevated border border-line rounded-xl shadow-lg ring-0'

/** 触发区：与 AppInput / 全站表单同一套输入框观感 + 品牌色 focus 环 */
const FIELD_CLASS = [
  'flex w-full items-center gap-2 rounded-lg border border-line bg-elevated px-3 py-1.5',
  'transition-colors focus-within:border-brand-500/60 focus-within:ring-2 focus-within:ring-brand-500/25',
].join(' ')

/** 分段输入：透明底、居中、等宽数字；聚焦时淡品牌底而不是画五个焦点环 */
const SEGMENT_CLASS = [
  'rounded border-0 bg-transparent p-0 text-center text-sm tabular leading-6',
  'text-fg placeholder:text-fg-subtle/70',
  'focus:outline-none focus-visible:bg-brand-500/10',
].join(' ')

/** 面板里时间行的 −/+ 按钮 */
const STEPPER_CLASS = 'flex size-6 shrink-0 items-center justify-center rounded-md text-fg-subtle transition-colors hover:bg-sunken hover:text-fg active:scale-95'

/** 图标按钮（清除 / 日历）：压到 24px 方块，塞进 36px 高的输入框里不撑高 */
const ICON_BUTTON_UI = { base: 'size-6 rounded-md text-fg-subtle hover:bg-sunken/60 hover:text-fg' }

type Granularity = 'minute' | 'hour' | 'day'
type SegmentKey = 'year' | 'month' | 'day' | 'hour' | 'minute'

interface SegmentDef {
  key: SegmentKey
  /** 固定宽度：年 4 位，其余 2 位 */
  length: number
  /** 分段名，同时用作 input 的 placeholder（对齐 react-aria 中文 locale 的年/月/日 时/分） */
  label: string
  /** 输入框定宽类 */
  widthClass: string
  /** 该分段后面的分隔符 */
  sep: string
}

/** 分段定义表，字段顺序 = 显示顺序，缺哪一段由 granularity 切片决定 */
const SEGMENTS: SegmentDef[] = [
  { key: 'year', length: 4, label: '年', widthClass: 'w-11', sep: '/' },
  { key: 'month', length: 2, label: '月', widthClass: 'w-8', sep: '/' },
  { key: 'day', length: 2, label: '日', widthClass: 'w-8', sep: ' ' },
  { key: 'hour', length: 2, label: '时', widthClass: 'w-8', sep: ':' },
  { key: 'minute', length: 2, label: '分', widthClass: 'w-8', sep: '' },
]

/** 各分段的取值范围；day 的上界按当月天数在 cycleSegment 里现算 */
const SEGMENT_RANGE: Record<SegmentKey, readonly [number, number]> = {
  year: [1, 9999],
  month: [1, 12],
  day: [1, 31],
  hour: [0, 23],
  minute: [0, 59],
}

const props = withDefaults(defineProps<{
  /** 受控值；null = 未选中（字段只显示占位符） */
  modelValue?: ZonedDateTime | null
  /** 字段名，同时用于 aria-label */
  label?: string
  granularity?: Granularity
  isDisabled?: boolean
  /** 透传到根 div（旧版 className="w-full" 加在 DatePicker 根 div 上） */
  class?: string
}>(), {
  modelValue: null,
  granularity: 'minute',
  isDisabled: false,
})

const emit = defineEmits<{
  'update:modelValue': [value: ZonedDateTime | null]
}>()

const zone = getLocalTimeZone()
const fieldId = useId()

/** 面板开合：组件内部自管，值仍然完全受控 */
const isOpen = ref(false)
/** 工作副本：字段与月历的所有编辑都落在它身上，改完立即 emit */
const draft = ref<ZonedDateTime>(normalize(props.modelValue) ?? now(zone))
/** 月历当前翻到哪个月（受控 placeholder，避免翻月时被外部值拽回去） */
const viewDate = ref<CalendarDate>(toCalendarDate(draft.value))
/** 有没有被编辑过：决定 Enter 确认时要不要落盘（空字段按 Enter 不该凭空产生值） */
const touched = ref(false)
/** 正在编辑的分段与其缓冲文本：分段输入是「有状态」的，打字期间不能被格式化值覆盖 */
const editingKey = ref<SegmentKey | null>(null)
const buffer = ref('')

/** 触发区里各个分段 input 的 DOM（只登记触发区的，面板里的时间输入不需要被聚焦跳转） */
const segmentInputs: Partial<Record<SegmentKey, HTMLInputElement>> = {}

/** 外部值：容忍 ISO 字符串（Phase C 的页面手里多半是后端串），解析失败按未选中处理 */
function normalize(value: unknown): ZonedDateTime | null {
  if (!value) return null
  if (typeof value === 'string') {
    try {
      // 带时区偏移/Z 的是绝对时间，没带的是 zoned 字符串
      return /(?:[zZ]|[+-]\d{2}:?\d{2})$/.test(value) ? parseAbsoluteToLocal(value) : parseZonedDateTime(value)
    } catch {
      return null
    }
  }
  if (value instanceof Date) return fromDate(value, zone)
  // 已经是 ZonedDateTime（或结构相同的 DateValue）
  if (typeof value === 'object' && 'year' in value && 'timeZone' in value) return value as ZonedDateTime
  return null
}

/** 受控值；显示永远跟随它（外部不认账时不会显示幽灵值） */
const committed = computed(() => normalize(props.modelValue))

watch(() => props.modelValue, (value) => {
  const next = normalize(value)
  // 我们自己 emit 出去的值会原样回传，这时不要动工作副本（否则会打断正在输入的分段）
  if (next && next.epochTime === draft.value.epochTime && next.timeZone === draft.value.timeZone) return
  // 非法 / 空值 → 工作副本回退到「当前时间」（契约 §4.5 第 13 条），但界面仍显示占位符
  const base = next ?? now(zone)
  draft.value = base
  viewDate.value = toCalendarDate(base)
  editingKey.value = null
  touched.value = false
})

/** granularity → 显示哪几个分段 */
const segments = computed<SegmentDef[]>(() => {
  if (props.granularity === 'day') return SEGMENTS.slice(0, 3)
  if (props.granularity === 'hour') return SEGMENTS.slice(0, 4)
  return SEGMENTS
})

/** 面板时间行：时 + 分（day 粒度没有） */
const timeSegments = computed(() => segments.value.filter((item) => item.key === 'hour' || item.key === 'minute'))
const hasTime = computed(() => props.granularity !== 'day')

/** 月历的选中日：只喂 CalendarDate，与时区/时间解耦 */
const calendarDate = computed(() => toCalendarDate(draft.value))

/** 触发区渲染数据（含分隔符与当前显示文本） */
const fieldSegments = computed(() => {
  const list = segments.value
  return list.map((seg, index) => ({
    seg,
    // 最后一段不画分隔符（否则 day 粒度会多出一个尾随空格）
    sep: index === list.length - 1 ? '' : seg.sep,
    text: segmentText(seg),
  }))
})

/** 清除按钮：旧版 {value && !isDisabled && …} */
const canClear = computed(() => Boolean(committed.value) && !props.isDisabled)

/** 触发框的 aria-label（面板内 role="dialog" 也用它） */
const ariaLabel = computed(() => props.label ?? '日期时间')

/** 某分段取自工作副本的数值 */
function valueOfKey(key: SegmentKey): number {
  return key === 'year' ? draft.value.year : draft.value[key]
}

/** 分段显示文本：编辑中用缓冲，否则用工作副本；未选中时留空（由 placeholder 顶位） */
function segmentText(seg: SegmentDef): string {
  if (editingKey.value === seg.key) return buffer.value
  if (!committed.value) return ''
  return String(valueOfKey(seg.key)).padStart(seg.length, '0')
}

/** 写入工作副本；@internationalized/date 的 set 内部会把 day clamp 到当月天数 */
function applySegment(key: SegmentKey, value: number) {
  switch (key) {
    case 'year': draft.value = draft.value.set({ year: value }); break
    case 'month': draft.value = draft.value.set({ month: value }); break
    case 'day': draft.value = draft.value.set({ day: value }); break
    case 'hour': draft.value = draft.value.set({ hour: value }); break
    case 'minute': draft.value = draft.value.set({ minute: value }); break
  }
}

/** 编辑落盘：改副本 → 必要时把月历翻回该日期 → 立即通知外部（旧版的实时 onChange） */
function edit(mutate: () => void, syncView = true) {
  mutate()
  touched.value = true
  if (syncView) {
    const day = toCalendarDate(draft.value)
    if (day.compare(viewDate.value) !== 0) viewDate.value = day
  }
  emit('update:modelValue', draft.value)
}

function clampSegment(seg: SegmentDef, value: number): number {
  const [min, max] = SEGMENT_RANGE[seg.key]
  return Math.min(max, Math.max(min, value))
}

/** ↑/↓ 与面板 −/+ 的公共入口：循环加减（12→1、23→0、59→0） */
function cycleSegment(key: SegmentKey, step: 1 | -1) {
  const [min, max] = SEGMENT_RANGE[key]
  const upper = key === 'day' ? daysInMonth(draft.value.year, draft.value.month) : max
  const current = valueOfKey(key)
  const span = upper - min + 1
  const next = min + ((((current - min + step) % span) + span) % span)
  edit(() => applySegment(key, next))
}

function daysInMonth(year: number, month: number): number {
  // CalendarDate 构造时会 constrain：day=0 即上个月最后一天；month=13 也会被收成 12
  return new CalendarDate(year, month + 1, 0).day
}

function setSegmentRef(key: SegmentKey, el: unknown) {
  if (el instanceof HTMLInputElement) segmentInputs[key] = el
}

function focusSegment(key: SegmentKey) {
  const el = segmentInputs[key]
  if (!el) return
  el.focus()
  el.select()
}

/** 聚焦某分段：全选（react-aria 同款，点一下就能整段重打），缓冲重置 */
function onSegmentFocus(seg: SegmentDef, event: FocusEvent) {
  editingKey.value = seg.key
  // 未选中时不要拿「回退到当前时间」的预估值做预览，否则失焦就跳回去看着像丢值
  buffer.value = committed.value ? String(valueOfKey(seg.key)).padStart(seg.length, '0') : ''
  const el = event.target as HTMLInputElement | null
  el?.select?.()
}

/** 失焦：丢弃缓冲，显示回到工作副本的规范格式 */
function onSegmentBlur() {
  editingKey.value = null
  buffer.value = ''
}

/**
 * 打字：只取数字、截到段长，越界 clamp；填满自动跳下一段。
 * `advance` 只在触发区的分段上为 true —— 面板里那行时间输入与触发区分段共用同一批
 * DOM 记录，自动跳段会把焦点从面板甩回触发区。
 */
function onSegmentInput(seg: SegmentDef, event: Event, advance = true) {
  const input = event.target as HTMLInputElement
  const digits = String(input.value ?? '').replace(/\D/g, '').slice(0, seg.length)
  buffer.value = digits
  // 空段不回写（跟 react-aria 一致：清空某一段不等于把整个值清空）
  if (!digits) return
  edit(() => applySegment(seg.key, clampSegment(seg, Number(digits))))
  if (advance && digits.length >= seg.length) {
    const order = segments.value.map((item) => item.key)
    const next = order[order.indexOf(seg.key) + 1]
    if (next) focusSegment(next)
  }
}

/** ↑/↓ 加减、Enter 确认、Backspace 退回上一段；stop 已加在模板上，避免触发 PopoverTrigger */
function onSegmentKeydown(seg: SegmentDef, event: KeyboardEvent, advance = true) {
  const input = event.target as HTMLInputElement
  switch (event.key) {
    case 'ArrowUp':
    case 'ArrowDown': {
      event.preventDefault()
      cycleSegment(seg.key, event.key === 'ArrowUp' ? 1 : -1)
      // 加减之后缓冲要跟上，否则输入框还显示旧数字
      editingKey.value = seg.key
      buffer.value = String(valueOfKey(seg.key)).padStart(seg.length, '0')
      input.setSelectionRange?.(buffer.value.length, buffer.value.length)
      break
    }
    case 'Enter':
      event.preventDefault()
      finish()
      break
    case 'Backspace': {
      if (!advance || input.value) break
      const order = segments.value.map((item) => item.key)
      const prev = order[order.indexOf(seg.key) - 1]
      if (!prev) break
      event.preventDefault()
      focusSegment(prev)
      break
    }
  }
}

/** 月历点选日期：只改年月日；day 粒度顺带把时刻归零 */
function onPickDate(next: unknown) {
  if (!next || Array.isArray(next)) return
  const picked = next as DateValue
  edit(() => {
    draft.value = draft.value.set({ year: picked.year, month: picked.month, day: picked.day })
    if (!hasTime.value) draft.value = draft.value.set({ hour: 0, minute: 0, second: 0, millisecond: 0 })
  })
  if (!hasTime.value) isOpen.value = false
}

/** 月历翻月 / 切视图时同步受控 placeholder */
function onViewChange(next: unknown) {
  if (!next || Array.isArray(next)) return
  viewDate.value = toCalendarDate(next as DateValue)
}

/** 「现在」快捷项（旧版没有，契约 §4.5 第 13 条要求） */
function pickNow() {
  edit(() => {
    draft.value = now(zone)
    if (!hasTime.value) draft.value = draft.value.set({ hour: 0, minute: 0, second: 0, millisecond: 0 })
  })
}

/** Enter / 「完成」：落盘（编辑过才落）再收面板 */
function finish() {
  if (touched.value) edit(() => {})
  isOpen.value = false
}

/** 清除（旧的 X 按钮） */
function clear() {
  touched.value = false
  editingKey.value = null
  emit('update:modelValue', null)
}

/** Esc：焦点在触发区（分段输入）时面板内建的 Esc 监听收不到，这里兜一层 */
function closePanel() {
  isOpen.value = false
}
</script>

<template>
  <div :class="cn('w-full', class)" @keydown.esc.stop.prevent="closePanel">
    <!-- 旧版 <Label className="mb-1.5 block text-xs font-semibold text-fg-muted"> -->
    <label
      v-if="label"
      :for="`${fieldId}-year`"
      class="mb-1.5 block text-xs font-semibold text-fg-muted"
    >
      {{ label }}
    </label>

    <UPopover
      v-model:open="isOpen"
      :content="POPOVER_CONTENT"
      :ui="{ content: POPOVER_CONTENT_CLASS }"
    >
      <!-- 触发区：整块「输入框」，内部是 5 个可输入的分段。
           ⚠️ @pointerdown.stop 是必须的：reka 的 DismissableLayer 在 document 上监听
           pointerdown，落在触发区里的按下会被判成「面板外」而先关一次面板，随后的
           click 又把它开回来 → 每次点输入框都闪一下、进场动画重放。
           在这里截断冒泡后，「点框内任意处」= 干净的一次 toggle。 -->
      <div
        role="group"
        tabindex="-1"
        :aria-label="ariaLabel"
        :aria-disabled="isDisabled || undefined"
        :class="cn(
          FIELD_CLASS,
          isDisabled ? 'pointer-events-none cursor-not-allowed opacity-60' : 'cursor-pointer hover:border-brand-500/40',
        )"
        @pointerdown.stop
      >
        <div class="flex min-w-0 flex-1 items-center">
          <template v-for="item in fieldSegments" :key="item.seg.key">
            <input
              :id="item.seg.key === 'year' ? `${fieldId}-year` : undefined"
              :ref="(el) => setSegmentRef(item.seg.key, el)"
              :value="item.text"
              :placeholder="item.seg.label"
              :aria-label="`${ariaLabel}${item.seg.label}`"
              :disabled="isDisabled"
              :maxlength="item.seg.length"
              :class="cn(SEGMENT_CLASS, item.seg.widthClass)"
              type="text"
              inputmode="numeric"
              autocomplete="off"
              spellcheck="false"
              @focus="onSegmentFocus(item.seg, $event)"
              @input="onSegmentInput(item.seg, $event)"
              @keydown.stop="onSegmentKeydown(item.seg, $event)"
              @blur="onSegmentBlur"
            >
            <span v-if="item.sep" class="select-none text-fg-subtle">{{ item.sep }}</span>
          </template>
        </div>

        <div class="flex shrink-0 items-center gap-0.5">
          <!-- 旧版 Button(isIconOnly size="sm" variant="ghost") aria-label={`清除${label}`} -->
          <UButton
            v-if="canClear"
            icon="i-lucide-x"
            color="neutral"
            variant="ghost"
            size="xs"
            :ui="ICON_BUTTON_UI"
            :aria-label="`清除${ariaLabel}`"
            @click.stop="clear"
          />
          <!-- 旧版 DatePicker.Trigger + TriggerIndicator：不写自己的 click，
               由 PopoverTrigger 的 toggle 统一处理（点它 = 开/收面板） -->
          <UButton
            icon="i-lucide-calendar"
            color="neutral"
            variant="ghost"
            size="xs"
            :ui="ICON_BUTTON_UI"
            :aria-label="`选择${ariaLabel}`"
          />
        </div>
      </div>

      <template #content>
        <motion.div
          role="dialog"
          :aria-label="ariaLabel"
          :initial="{ opacity: 0, scale: 0.96, y: -4 }"
          :animate="{ opacity: 1, scale: 1, y: 0 }"
          :transition="{ duration: 0.18, ease: 'easeOut' }"
          class="p-3"
        >
          <UCalendar
            :model-value="calendarDate"
            :placeholder="viewDate"
            :locale="CALENDAR_LOCALE"
            :week-starts-on="WEEK_STARTS_ON"
            weekday-format="narrow"
            size="sm"
            :ui="{ body: 'pt-2' }"
            @update:model-value="onPickDate"
            @update:placeholder="onViewChange"
          />

          <!-- 时间行：鼠标用户用 −/+ 与打字两条路都能调（旧版只能打字 + ↑↓） -->
          <div v-if="hasTime" class="mt-3 flex items-center gap-2 border-t border-line pt-3">
            <span class="shrink-0 text-xs font-semibold text-fg-muted">时间</span>
            <div v-for="seg in timeSegments" :key="seg.key" class="flex items-center gap-1">
              <span v-if="seg.key === 'hour' && timeSegments.length > 1" class="text-fg-subtle">:</span>
              <button
                type="button"
                :class="STEPPER_CLASS"
                :aria-label="`减少${seg.label}`"
                @click="cycleSegment(seg.key, -1)"
              >
                −
              </button>
              <input
                :value="segmentText(seg)"
                :placeholder="seg.label"
                :aria-label="`${ariaLabel}${seg.label}`"
                :maxlength="seg.length"
                :class="cn(SEGMENT_CLASS, 'h-7 w-9 border border-line')"
                type="text"
                inputmode="numeric"
                autocomplete="off"
                spellcheck="false"
                @focus="onSegmentFocus(seg, $event)"
                @input="onSegmentInput(seg, $event, false)"
                @keydown.stop="onSegmentKeydown(seg, $event, false)"
                @blur="onSegmentBlur"
              >
              <button
                type="button"
                :class="STEPPER_CLASS"
                :aria-label="`增加${seg.label}`"
                @click="cycleSegment(seg.key, 1)"
              >
                +
              </button>
            </div>
          </div>

          <div class="mt-3 flex items-center justify-between gap-2 border-t border-line pt-3">
            <AppButton variant="ghost" size="sm" @press="pickNow">
              现在
            </AppButton>
            <AppButton size="sm" @press="finish">
              完成
            </AppButton>
          </div>
        </motion.div>
      </template>
    </UPopover>
  </div>
</template>