<script setup lang="ts">
/**
 * AppModal —— HeroUI v3 `Modal` 八层 compound → Nuxt UI v4 `UModal` 的兼容层
 * （全站 11 个弹窗实例；契约见 MIGRATION.md §4.5 第 1 条，**冻结版**）
 *
 * ────────────────────────────────────────────────────────────────────────
 * 一、旧 props / slots（← 实测 11 处用法，grep 自 fe/src）
 * ────────────────────────────────────────────────────────────────────────
 * 旧结构（22 次 Modal.Container、22 次 Modal.Dialog、22 次 Modal.Body、
 * 22 次 Modal.Backdrop、20 次 Modal.{Header,Heading,Icon,Footer}、
 * 11 次 Modal.CloseTrigger、4 次 Modal.Trigger）：
 *
 *   <Modal state={x}>            ← state 传整个 useOverlayState 返回值
 *     <Modal.Trigger>…</Modal.Trigger>   ← 只有 SystemSection.tsx:130,280 用了（整块卡片当触发器）
 *     <Modal.Backdrop>
 *       <Modal.Container>                ← 11 处**都没传** size / scroll / variant，全走默认
 *         <Modal.Dialog className="sm:max-w-md">   ← 宽度 11 处全靠 className 手写
 *           <Modal.CloseTrigger />        ← 11 处全有
 *           <Modal.Header>                ← 10 处（Checkoff 没有）
 *             <Modal.Icon className="bg-brand-500/10 text-brand-600 dark:text-brand-300">
 *             <Modal.Heading>助教绑定课程</Modal.Heading>
 *           </Modal.Header>
 *           <Modal.Body className="flex flex-col gap-4">…</Modal.Body>
 *           <Modal.Footer>…</Modal.Footer>          ← 10 处（Checkoff 没有）
 *         </Modal.Dialog>
 *       </Modal.Container>
 *     </Modal.Backdrop>
 *   </Modal>
 *
 * ────────────────────────────────────────────────────────────────────────
 * 二、新 props / emits / slots（严格照 MIGRATION §4.5 第 1 条，不改名不加料）
 * ────────────────────────────────────────────────────────────────────────
 * props: open: boolean                    受控，必需（配 useOverlayState）
 *        size?: 'sm'|'md'|'lg'|'xl'|'full'  默认 'md'
 *        scroll?: 'inside'|'outside'       默认 'inside'
 *        hideClose?: boolean               默认 false
 * emits: update:open                      关闭/打开（遮罩点击、Esc、X 按钮统一走它）
 * slots: header   标题区（旧 Modal.Header + Modal.Heading）
 *        icon     标题左侧图标（旧 Modal.Icon）
 *        default  正文（旧 Modal.Body）
 *        footer   底部按钮（旧 Modal.Footer）
 *
 * size 取值来自旧版实际宽度（11 处逐个抄）：
 *   sm:max-w-md  ×7  SystemSection×2 / ExperimentDetail / FocusStudents×2 / Scores / Settings
 *   sm:max-w-2xl ×2  Questions / LlmConnect          → size="xl"
 *   sm:max-w-lg  ×1  FocusStudents:753              → size="lg"
 *   sm:max-w-xl  ×1  Checkoff:325                   → size="lg"（略窄 4rem，见下方「已知取舍」）
 *   → 默认 'md'（28rem）与旧版 .modal__dialog--md 的 max-w-md 完全一致
 *
 * ────────────────────────────────────────────────────────────────────────
 * 三、底层 `UModal` + `ui` 覆盖（props / slots 全部经 Nuxt UI MCP
 *    `get-component Modal` 核实，@nuxt/ui 4.11.2）
 * ────────────────────────────────────────────────────────────────────────
 * 核实到的关键 API：
 *   props : open / defaultOpen / modal / overlay / scrollable / transition /
 *           fullscreen / portal / title / description / close(布尔|ButtonProps) /
 *           closeIcon / dismissible / unmountOnHide / content / ui
 *   slots : default(触发器) / content / header / title / description / actions /
 *           close / body / footer
 *   emits : update:open / close:prevent / enter / after:enter / leave / after:leave
 *   ui 键 : overlay / content / header / wrapper / body / footer / title /
 *           description / close
 *
 * ★ 关于「点外面关闭 / Esc 关闭」：**没有** `closeOnPressOutside` / `closeOnEscape`
 *   这两个 prop，只有一个总开关 `dismissible`（默认 true，同时管住「点外面」和
 *   「按 Esc」，关掉会额外 emit `close:prevent`）。本组件不重写它，也不重写
 *   焦点陷阱 / 焦点回归 / body 滚动锁定 —— 全部交给 UModal（reka-ui Dialog）。
 *
 * ★ 关于「#header 覆盖」：UModal 源码里 X 按钮（DialogClose）**只存在于
 *   #header 插槽的默认内容中**；一旦传了 #header，它就不会再渲染。所以本组件
 *   自己画 X，并直接 emit('update:open', false)——语义与遮罩点击 / Esc 完全一致。
 *   因此给 UModal 传 :close="false"（避免任何路径下冒出第二个 X）。
 *
 * ★ 关于无障碍标题：UModal 在「没有 title 且没传 #title」时会自己渲染一个
 *   VisuallyHidden 的空 DialogTitle（源码第 82 行），所以覆盖 #header 不会触发
 *   reka-ui 的「缺少 DialogTitle」告警；代价是读屏软件读不到弹窗标题（可接受）。
 *
 * ────────────────────────────────────────────────────────────────────────
 * 四、`ui` 覆盖明细（class 透传到最内层原生元素，与 §4.5 通用约定一致）
 * ────────────────────────────────────────────────────────────────────────
 * content  bg-elevated border border-line rounded-2xl shadow-2xl shadow-brand-500/5
 *          （ring-0 用来顶掉 UModal 默认的 ring ring-default；尺寸类见下）
 * overlay  bg-brand-500/40 backdrop-blur-sm   ← 品牌色半透明遮罩 + 轻微磨砂
 * header   min-h-0（顶掉 --ui-header-height）；无标题内容时 p-0 收成 0 高
 * body     flex flex-col gap-4（= 旧版 20 处 Modal.Body 的 className）
 * footer   items-center justify-end gap-2（= 旧版 .modal__footer）
 *
 * ────────────────────────────────────────────────────────────────────────
 * 五、⚠️ 迁页面规则（Phase C 必读）
 * ────────────────────────────────────────────────────────────────────────
 * 0) 标准接法（务必照抄）：
 *      const state = useOverlayState()
 *      <AppModal :open="state.isOpen" @update:open="state.onOpenChange" size="md">
 *        <template #header>修改用户名</template>
 *        <template #icon>…</template>
 *        <AppInput … />
 *        <template #footer>
 *          <AppButton variant="secondary" @press="state.close">取消</AppButton>
 *          <AppButton @press="save">保存</AppButton>
 *        </template>
 *      </AppModal>
 *    遮罩点击 / Esc / 右上角 X / 页面按钮，四条关闭路径**全部**汇到
 *    `update:open`，因此旧版 `useOverlayState({ onOpenChange })` 里的
 *    「关闭时清表单 / 清 timer」逻辑一次都不会丢。
 *
 * 1) **不要用 `slot="close"`**（MIGRATION §4.5 第 1 条明写：关闭统一走 @press）。
 *    本组件**故意不调用** useAppModalSlots 的 provideAppModalClose，
 *    所以 AppButton 上的 `slot="close"` 在新版里是 no-op（点击不关弹窗）。
 *    旧写法 → 新写法：
 *      旧：<Button slot="close" variant="secondary">取消</Button>
 *      新：<AppButton variant="secondary" @press="state.close">取消</AppButton>
 *
 * 2) 旧版 Modal.CloseTrigger（11 处）→ 不用写任何东西，右上角 X 自带；
 *    确实不要 X 的场景传 `hide-close`。
 *
 * 3) 旧版 Modal.Trigger 包整块卡片（SystemSection.tsx:130,280）：
 *    新版把「触发器」挪到 AppModal **外面**（UModal 的 default 插槽是触发器，
 *    本组件不占用它），即：
 *      <div @click="courseState.open()">…卡片…</div>
 *      <AppModal :open="courseState.isOpen" @update:open="courseState.onOpenChange" …>
 *
 * 4) 旧版 Modal.Icon 的 className（bg-brand-500/10 text-brand-600 …）**照抄到
 *    #icon 插槽内容上**（§4.5「class 加在哪就落到哪」的语义），照抄模板：
 *      <template #icon>
 *        <div class="flex size-10 shrink-0 items-center justify-center rounded-3xl
 *                    bg-brand-500/10 text-brand-600 dark:text-brand-300">
 *          <GraduationCap class="size-[18px]" />
 *        </div>
 *      </template>
 *    危险色变体把底/字色换成 bg-danger/10 text-danger（SystemSection×2 /
 *    FocusStudents:841 / Scores:472）。尺寸 rounded-3xl size-10 取自旧版
 *    .modal__icon。
 *
 * 5) 旧 Modal.Dialog 的 className 宽度 → 换成 size prop。
 *    **已知取舍**：Checkoff.tsx:325 的 `sm:max-w-xl`(36rem) 在冻结契约里
 *    没有对应档位，用 `size="lg"`(32rem) 近似（差 4rem，肉眼几乎无差）。
 *    注：写在 AppModal 上的 `class` 会被 UModal 透传到弹窗本体，但排在
 *    `ui.content` **之前**，tailwind-merge 冲突时 size 赢，所以别拿它改宽度。
 *
 * ────────────────────────────────────────────────────────────────────────
 * 六、已知视觉取舍（1 处，已按契约文字实现）
 * ────────────────────────────────────────────────────────────────────────
 * 旧版 `.modal__header` 是 `flex flex-col gap-3`，即**图标在标题上方**；
 * MIGRATION §4.5 把 icon 插槽描述为「标题左侧图标」，本组件按契约做成
 * **左右排布**（更紧凑，也更贴 UModal 的行式 header）。若要逐像素还原旧版，
 * 把下面 header 行 div 的 `flex items-center` 改成 `flex flex-col items-start` 即可。
 */
import { computed } from 'vue'

const props = withDefaults(defineProps<{
  /** 受控开关，必需（配 useOverlayState） */
  open: boolean
  /** 弹窗宽度，默认 'md'（= 旧版 .modal__dialog--md 的 max-w-md） */
  size?: 'sm' | 'md' | 'lg' | 'xl' | 'full'
  /** 内容滚动位置：inside = 正文内部滚（默认，同旧版），outside = 遮罩整体滚 */
  scroll?: 'inside' | 'outside'
  /** 隐藏右上角 X（旧版删掉 Modal.CloseTrigger 的等价物） */
  hideClose?: boolean
}>(), {
  size: 'md',
  scroll: 'inside',
  hideClose: false,
})

const emit = defineEmits<{
  'update:open': [value: boolean]
}>()

const slots = defineSlots<{
  /** 标题区（标题文案） */
  header?: () => unknown
  /** 标题左侧图标（自带底色盒子，见文件头「五-4」） */
  icon?: () => unknown
  /** 正文 */
  default?: () => unknown
  /** 底部按钮 */
  footer?: () => unknown
}>()

/** 有没有标题区内容：没有时 header 收成 0 高，只留右上角 X（对齐 Checkoff 那种无标题弹窗） */
const hasHeader = computed(() => Boolean(slots.header || slots.icon))

/** size → 弹窗最大宽度。类名不加 sm: 前缀，避免和 UModal 自带的 max-w-lg 抢断点 */
const SIZE_CONTENT_CLASS: Record<'sm' | 'md' | 'lg' | 'xl' | 'full', string> = {
  sm: 'max-w-sm',
  md: 'max-w-md',
  lg: 'max-w-lg',
  xl: 'max-w-2xl',
  // full 走 UModal 的 fullscreen（内容 inset-0），宽度由 variant 管
  full: '',
}

const isFull = computed(() => props.size === 'full')

const ui = computed(() => ({
  content: [
    'bg-elevated',
    'ring-0',
    'border',
    'border-line',
    'rounded-2xl',
    'shadow-2xl',
    'shadow-brand-500/5',
    SIZE_CONTENT_CLASS[props.size],
    // fullscreen 变体下要去掉圆角/边框/阴影（对齐旧版 .modal__dialog--full）
    isFull.value ? 'rounded-none border-0 shadow-none' : '',
  ],
  overlay: 'bg-brand-500/40 backdrop-blur-sm',
  // min-h-0 顶掉 UModal 自带的 min-h-(--ui-header-height)（tailwind-merge 认不出
  // `--var` 简写，只能靠 ! 强制生效）；无标题内容时清零内边距，让 header 收成 0 高，
  // 此时只剩绝对定位的 X，不会在正文上方留一条空白
  header: hasHeader.value ? 'min-h-0' : 'min-h-0! p-0 sm:p-0',
  // flex flex-col gap-4 = 旧版 20 处 <Modal.Body className="flex flex-col gap-4">
  body: 'flex flex-col gap-4',
  // = 旧版 .modal__footer：右对齐 + gap-2
  footer: 'items-center justify-end gap-2',
}))

/** 关闭按钮 / 页面按钮的关闭，统一走契约里的 update:open */
function requestClose() {
  emit('update:open', false)
}
</script>

<template>
  <UModal
    :open="open"
    :scrollable="scroll === 'outside'"
    :fullscreen="isFull"
    :close="false"
    :ui="ui"
    @update:open="emit('update:open', $event)"
  >
    <template #header>
      <div v-if="hasHeader" class="flex w-full items-center gap-3 pr-8 sm:pr-10">
        <slot name="icon" />
        <h2 class="min-w-0 text-base font-medium text-fg">
          <slot name="header" />
        </h2>
      </div>

      <UButton
        v-if="!hideClose"
        icon="i-lucide-x"
        color="neutral"
        variant="ghost"
        aria-label="关闭"
        class="absolute end-4 top-4"
        @click="requestClose"
      />
    </template>

    <template v-if="$slots.default" #body>
      <slot />
    </template>

    <template v-if="$slots.footer" #footer>
      <slot name="footer" />
    </template>
  </UModal>
</template>
