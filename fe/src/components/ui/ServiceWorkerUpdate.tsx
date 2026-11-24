import { useEffect } from 'react'
import { toast } from 'sonner'

import { reportRuntimeDiagnostic } from '@/lib/sentry'

const UPDATE_INTERVAL_MS = 30 * 60 * 1000
const UPDATE_TIMEOUT_MS = 10000

export function ServiceWorkerUpdate() {
  useEffect(() => {
    if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return

    let disposed = false
    let prompted = false
    let hadController = Boolean(navigator.serviceWorker.controller)
    let registration: ServiceWorkerRegistration | null = null
    let updateInFlight = false
    let channel: BroadcastChannel | null = null

    const prompt = () => {
      if (disposed || prompted) return
      prompted = true
      toast('发现新版本', {
        description: '其他标签页可继续使用；需要时刷新当前标签页即可更新。',
        duration: Number.POSITIVE_INFINITY,
        action: {
          label: '刷新当前页',
          onClick: () => window.location.reload(),
        },
      })
    }

    const checkForUpdate = async () => {
      const current = registration
      if (!current || updateInFlight || disposed) return
      updateInFlight = true
      const update = async () => {
        let timer = 0
        try {
          await Promise.race([
            current.update(),
            new Promise<never>((_, reject) => {
              timer = window.setTimeout(() => reject(new Error('SW_UPDATE_TIMEOUT')), UPDATE_TIMEOUT_MS)
            }),
          ])
        } catch (error) {
          reportRuntimeDiagnostic('sw_update_failed', { message: String(error) })
        } finally {
          window.clearTimeout(timer)
        }
      }
      try {
        if (navigator.locks) {
          await navigator.locks.request('tasaas-sw-update', { ifAvailable: true }, async (lock) => {
            if (lock) await update()
          })
        } else {
          await update()
        }
      } catch (error) {
        reportRuntimeDiagnostic('sw_update_failed', { message: String(error) })
      } finally {
        updateInFlight = false
      }
    }

    const watch = (reg: ServiceWorkerRegistration) => {
      if (reg.waiting && hadController) {
        reg.waiting.postMessage({ type: 'SKIP_WAITING' })
        prompt()
      }
      reg.addEventListener('updatefound', () => {
        const installing = reg.installing
        if (!installing) return
        installing.addEventListener('statechange', () => {
          if (installing.state !== 'installed' || !hadController) return
          channel?.postMessage({ type: 'update-available' })
          prompt()
        })
      })
    }

    const onControllerChange = () => {
      if (hadController) {
        reportRuntimeDiagnostic('sw_controller_changed', {})
        prompt()
      }
      hadController = true
    }

    const onMessage = (event: MessageEvent) => {
      const data = event.data as { type?: string; diagnostic?: { kind?: string } & Record<string, unknown> }
      if (data?.type !== 'SW_DIAGNOSTIC' || typeof data.diagnostic?.kind !== 'string') return
      const { kind, ...details } = data.diagnostic
      reportRuntimeDiagnostic(kind, details)
    }

    const onVisible = () => {
      if (document.visibilityState === 'visible') void checkForUpdate()
    }

    try {
      channel = new BroadcastChannel('tasaas-runtime')
      channel.onmessage = (event) => {
        if (event.data?.type === 'update-available') prompt()
        if (event.data?.type === 'recovery-started') {
          reportRuntimeDiagnostic('peer_recovery_started', {})
        }
      }
    } catch {
      channel = null
    }

    navigator.serviceWorker.addEventListener('controllerchange', onControllerChange)
    navigator.serviceWorker.addEventListener('message', onMessage)
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('focus', checkForUpdate)
    const timer = window.setInterval(() => void checkForUpdate(), UPDATE_INTERVAL_MS)

    const bootstrap = window.__TA_SW_REGISTRATION__ ?? navigator.serviceWorker.register('/sw.js', {
      updateViaCache: 'none',
    })
    void bootstrap
      .then((reg) => {
        if (!reg || disposed) return
        registration = reg
        watch(reg)
        void checkForUpdate()
      })
      .catch((error) => {
        reportRuntimeDiagnostic('sw_register_failed', { message: String(error) })
      })

    return () => {
      disposed = true
      navigator.serviceWorker.removeEventListener('controllerchange', onControllerChange)
      navigator.serviceWorker.removeEventListener('message', onMessage)
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('focus', checkForUpdate)
      window.clearInterval(timer)
      channel?.close()
    }
  }, [])

  return null
}
