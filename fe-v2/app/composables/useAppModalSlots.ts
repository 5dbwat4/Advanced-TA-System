import type { InjectionKey } from 'vue'
import { inject, provide } from 'vue'

/**
 * AppModal（Phase B）的「slot 注册表」注入 key。
 *
 * 旧版 HeroUI v3 的 `Modal.Footer` 里写 `<Button slot="close">取消</Button>`，
 * Modal 启动时会给所有 `slot="close"` 的 Button 挂上 onClick → 关闭。
 * Vue 端没有编译期 slot 注册，改为「父 provide、子 inject」的单向约定：
 *   - AppModal（父）：`provideAppModalClose(() => { isOpen.value = false })`
 *   - AppButton（子）：`const closeModal = useAppModalClose()`，点击时调用
 *
 * AppModal 尚未实现时 inject 拿不到值，`useAppModalClose()` 返回的是安全降级的
 * no-op —— AppButton 上的 `slot="close"` 会静默失效（点击无反应），不会报错。
 */
export const APP_MODAL_CLOSE_KEY: InjectionKey<(slot: string) => void> = Symbol('app-modal-close')

/**
 * 在 AppModal 内部调用一次，把「关闭弹窗」能力 provide 给整棵子树。
 * @param close 弹窗的关闭函数（一般就是 `useOverlayState().close`）
 */
export function provideAppModalClose(close: (slot?: string) => void) {
  provide(APP_MODAL_CLOSE_KEY, (slot: string) => close(slot))
}

/**
 * 在 AppModal 外部调用（目前只有 AppButton 用）：拿到一个永远可调用的关闭函数。
 * 没有被 AppModal 包住时它是 no-op。
 */
export function useAppModalClose() {
  const close = inject(APP_MODAL_CLOSE_KEY, null)
  return (slot = 'close') => close?.(slot)
}
