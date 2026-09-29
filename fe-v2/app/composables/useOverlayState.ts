/**
 * useOverlayState —— 旧版 HeroUI v3 `useOverlayState` 的 1:1 兼容层
 * （全站 11 套弹窗的状态机，契约见 MIGRATION.md §4.5 第 2 条）
 *
 * ────────────────────────────────────────────────────────────────────────
 * 一、旧字段 → 新字段（逐个抄自 fe/node_modules/@heroui/react 的
 *    dist/hooks/use-overlay-state.d.ts，字段名与语义完全一致）
 * ────────────────────────────────────────────────────────────────────────
 * 旧 UseOverlayStateProps   | 新（同名）        | 说明
 * --------------------------|-------------------|-------------------------------------------------
 * isOpen?: boolean          | isOpen?: boolean  | 受控开关。Vue 端一般不用（用 :open + @update:open）
 * defaultOpen?: boolean     | defaultOpen?      | 非受控初始值，默认 false
 * onOpenChange?: fn         | onOpenChange?     | 状态变化回调（11 处里有 7 处传了它做「开/关时重置」）
 *
 * 旧 UseOverlayStateReturn  | 新（同名 + 契约别名）
 * --------------------------|---------------------------------------------------
 * isOpen: boolean           | isOpen: boolean   | 旧版只读；Vue 端通过 reactive 自动拆 ref，模板里直接写
 *                           |                   | `state.isOpen`
 * setOpen(isOpen)           | setOpen(isOpen)   | 旧字段名，逐字保留
 * —                         | onOpenChange(open)| ★ MIGRATION §4.5 冻结契约要求的名字，**就是 setOpen 的别名**
 * open()                    | open()            | 旧字段名
 * close()                   | close()           | 旧字段名
 * toggle()                  | toggle()          | 旧字段名（实测 11 处没用，留着补齐）
 *
 * 实现差异只有一处（MIGRATION §4.5 明写）：内部 `useState` → `ref`。
 * setOpen 的行为逐行照搬旧实现：**先调 onOpenChange 回调，再在非受控模式下
 * 改内部值**（所以回调里读 state.isOpen 拿到的是「旧值」，与旧版一致）。
 *
 * ────────────────────────────────────────────────────────────────────────
 * 二、⚠️ 迁页面规则（Phase C 必读）
 * ────────────────────────────────────────────────────────────────────────
 * 1) 弹窗必须这样接，**不要用 v-model:open**：
 *
 *      const state = useOverlayState()
 *      <AppModal :open="state.isOpen" @update:open="state.onOpenChange">…</AppModal>
 *
 *    v-model:open 会直接写 state.isOpen（绕开 setOpen），
 *    于是 `useOverlayState({ onOpenChange })` 里的重置逻辑**不会被触发**。
 *
 * 2) 旧版写在 `onOpenChange` 里的「打开时清表单 / 关闭时清 timer」，
 *    **原样保留在 composable 的选项里**，不要挪到组件里：
 *
 *      // 旧 fe/src/pages/LlmConnect.tsx:91
 *      const createState = useOverlayState({
 *        onOpenChange: (open) => { if (!open) { setName(''); setNewToken(null) } },
 *      })
 *      // 新：完全一样
 *      const createState = useOverlayState({
 *        onOpenChange: (open) => { if (!open) { name.value = ''; newToken.value = null } },
 *      })
 *
 *    按钮上**不要**再写 `slot="close"`（新契约废弃该机制，见 AppModal.vue
 *    文件头「三」），改成 `@press="createState.close"`：
 *      <AppButton @press="createState.close">取消</AppButton>
 *    `close()` → setOpen(false) → 触发上面的重置逻辑 → state.isOpen 变 false
 *    → AppModal 的 :open 变 false → 关闭。三步是连着的。
 *
 * 3) 不要解构 `isOpen`（解构拿到的是当时的布尔快照）：
 *      const { close } = useOverlayState()      // ✅ 函数可以解构
 *      const { isOpen } = useOverlayState()     // ❌ 永远是初始值
 *      state.isOpen                              // ✅
 */
import { computed, reactive, ref } from 'vue'

export interface UseOverlayStateProps {
  /** 受控开关（旧版同名 prop）。传了就由外部决定，内部 ref 不再生效 */
  isOpen?: boolean
  /** 非受控时的初始开关状态，默认 false */
  defaultOpen?: boolean
  /** 状态变化回调。旧版 11 处里有 7 处在这里做「开/关时重置」 */
  onOpenChange?: (isOpen: boolean) => void
}

export interface UseOverlayStateReturn {
  /** 当前是否打开（只读） */
  readonly isOpen: boolean
  /** 旧版字段名：设置开关状态 */
  setOpen(isOpen: boolean): void
  /** MIGRATION §4.5 契约字段名，与 setOpen 完全等价 */
  onOpenChange(isOpen: boolean): void
  /** 打开 */
  open(): void
  /** 关闭 */
  close(): void
  /** 取反 */
  toggle(): void
}

export function useOverlayState(props: UseOverlayStateProps = {}): UseOverlayStateReturn {
  // 非受控模式的内部值（旧版是 useState，这里换成 ref）
  const uncontrolled = ref(props.defaultOpen ?? false)

  // 受控优先：传了 isOpen 就完全由外部说了算（与旧实现逐行一致）
  const isOpen = computed(() => props.isOpen ?? uncontrolled.value)

  function setOpen(nextIsOpen: boolean) {
    // 顺序与旧版一致：先回调，再改内部值
    props.onOpenChange?.(nextIsOpen)
    if (props.isOpen === undefined) uncontrolled.value = nextIsOpen
  }

  // 用 reactive 包一层：模板 / script 里 `state.isOpen` 会自动拆 ref 成 boolean，
  // 与旧版 `<Modal state={x}>` 里的 `x.isOpen` 写法一一对应
  return reactive({
    isOpen,
    setOpen,
    // 契约名字 = 旧字段名，方便页面照 MIGRATION.md 写
    onOpenChange: setOpen,
    open: () => setOpen(true),
    close: () => setOpen(false),
    toggle: () => setOpen(!isOpen.value),
  })
}
