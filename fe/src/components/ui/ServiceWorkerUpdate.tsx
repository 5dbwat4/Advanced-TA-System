import { useEffect } from 'react'
import { toast } from 'sonner'

const UPDATE_INTERVAL_MS = 30 * 60 * 1000

/**
 * 注册 Service Worker，并在检测到新版本时提示用户手动刷新。
 *
 * 页面 HTML 由 SW 以 cache-first 提供，因此应用只会在用户点击“刷新”、新 SW 接管后
 * 升级。这里通过定时 / 回到前台时调用 registration.update() 主动检查更新，
 * 覆盖 SPA 内长时间不整页导航的情况。
 */
export function ServiceWorkerUpdate() {
  useEffect(() => {
    if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return

    let prompted = false
    let reloading = false
    // 只有用户点过“刷新”才允许 reload：首次安装的 clients.claim() 同样会触发
    // controllerchange，若不区分会导致首访多刷一次。
    let pendingReload = false
    let registration: ServiceWorkerRegistration | null = null

    const onControllerChange = () => {
      if (!pendingReload || reloading) return
      reloading = true
      window.location.reload()
    }

    const prompt = (reg: ServiceWorkerRegistration) => {
      if (prompted || !reg.waiting) return
      prompted = true
      toast('发现新版本', {
        description: '刷新即可更新到最新版本。',
        duration: Number.POSITIVE_INFINITY,
        action: {
          label: '刷新',
          onClick: () => {
            pendingReload = true
            reg.waiting?.postMessage({ type: 'SKIP_WAITING' })
          },
        },
      })
    }

    const watch = (reg: ServiceWorkerRegistration) => {
      if (reg.waiting && navigator.serviceWorker.controller) prompt(reg)
      reg.addEventListener('updatefound', () => {
        const installing = reg.installing
        if (!installing) return
        installing.addEventListener('statechange', () => {
          if (installing.state === 'installed' && navigator.serviceWorker.controller) prompt(reg)
        })
      })
    }

    const checkForUpdate = () => {
      registration?.update().catch(() => {})
    }

    const onVisible = () => {
      if (document.visibilityState === 'visible') checkForUpdate()
    }

    navigator.serviceWorker.addEventListener('controllerchange', onControllerChange)
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('focus', checkForUpdate)
    const timer = window.setInterval(checkForUpdate, UPDATE_INTERVAL_MS)

    navigator.serviceWorker
      .register(`${import.meta.env.BASE_URL}sw.js`)
      .then((reg) => {
        registration = reg
        watch(reg)
        checkForUpdate()
      })
      .catch(() => {})

    return () => {
      navigator.serviceWorker.removeEventListener('controllerchange', onControllerChange)
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('focus', checkForUpdate)
      window.clearInterval(timer)
    }
  }, [])

  return null
}
