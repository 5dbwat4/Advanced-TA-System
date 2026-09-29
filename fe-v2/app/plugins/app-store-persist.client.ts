import { persistAppState, useAppStore, type PersistedAppState } from '~/stores/app'

/**
 * 把 app store 的持久化切片写回 localStorage（等价于旧版 zustand 的
 * `persist({ name: 'tasaas.app', partialize })`）。
 *
 * 之所以单独放一个插件而不是塞进 store 内部：store 的 state 初始化函数里
 * 再去注册 $subscribe 属于「工厂里套工厂」，HMR 下容易出问题；
 * 拆到 client 插件里则完全绕开 store 工厂的递归。
 *
 * 文件名带 .client → Nuxt 只在浏览器端注册这个插件。
 */
export default defineNuxtPlugin({
  name: 'app-store-persist',
  setup() {
    const store = useAppStore()

    const slice = (): PersistedAppState => ({
      currentClassId: store.currentClassId,
      sidebarCollapsed: store.sidebarCollapsed,
    })

    // 只在真正要持久化的字段变化时写盘，避免无关的状态更新触发写入
    let last = JSON.stringify(slice())

    store.$subscribe(
      () => {
        const next = JSON.stringify(slice())
        if (next === last) return
        last = next
        persistAppState(slice())
      },
      { detached: true },
    )
  },
})
