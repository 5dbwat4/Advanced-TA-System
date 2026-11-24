import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'

const loaders: Array<[string, () => Promise<unknown>]> = [
  ['/console/checkoff-queue', () => import('@/pages/console/checkoff/CheckoffQueue')],
  ['/console/checkoff-multi', () => import('@/pages/console/checkoff/CheckoffMulti')],
  ['/console/checkoff', () => import('@/pages/console/checkoff/Checkoff')],
  ['/console/experiments', () => import('@/pages/console/experiments/Experiments')],
  ['/console/questions', () => import('@/pages/console/questions/Questions')],
  ['/console/reports', () => import('@/pages/console/reports/Reports')],
  ['/console/scores', () => import('@/pages/console/scores/Scores')],
  ['/console/courses/settings', () => import('@/pages/console/courses/CourseSettings')],
  ['/console/settings', () => import('@/pages/account/Settings')],
  ['/console', () => import('@/pages/console/Dashboard')],
  ['/student-console/queue', () => import('@/pages/student/StudentQueue')],
  ['/student-console/scores', () => import('@/pages/student/StudentScores')],
  ['/student-console/experiments', () => import('@/pages/student/StudentExperiment')],
  ['/student-console/settings', () => import('@/pages/student/StudentSettings')],
  ['/student-console', () => import('@/pages/student/StudentOverview')],
  ['/viewer/experiments', () => import('@/pages/viewer/ViewerExperiments')],
  ['/viewer/scores', () => import('@/pages/viewer/ViewerScores')],
  ['/viewer/focus-students', () => import('@/pages/viewer/ViewerFocusStudents')],
  ['/viewer/courses/settings', () => import('@/pages/viewer/ViewerCourseSettings')],
  ['/settings', () => import('@/pages/account/Settings')],
]

const idleRoutes: Record<string, string> = {
  '/console': '/console/checkoff-queue',
  '/student-console': '/student-console/queue',
  '/viewer/experiments': '/viewer/scores',
}

const pending = new Map<string, Promise<unknown>>()
let chain: Promise<unknown> = Promise.resolve()
let blockedUntil = 0

function allowed(): boolean {
  if (Date.now() < blockedUntil || !navigator.onLine || document.visibilityState !== 'visible') return false
  const connection = (navigator as Navigator & {
    connection?: { saveData?: boolean; effectiveType?: string }
  }).connection
  if (connection?.saveData) return false
  return !connection?.effectiveType?.includes('2g')
}

export function prefetchRoute(pathname: string): Promise<unknown> | null {
  const normalized = pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname
  const existing = pending.get(normalized)
  if (existing) return existing
  if (!allowed() || pending.size >= 8) return null
  const match = loaders.find(([prefix]) => normalized === prefix)
  if (!match) return null
  const run = () => match[1]()
  const task = chain.then(run, run)
  chain = task.catch(() => undefined)
  pending.set(normalized, task)
  task.catch(() => pending.delete(normalized))
  return task
}

export function RoutePrefetch() {
  const { pathname } = useLocation()

  useEffect(() => {
    const onIntent = (event: Event) => {
      const target = event.target
      if (!(target instanceof Element)) return
      const anchor = target.closest('a[href]')
      if (!(anchor instanceof HTMLAnchorElement) || anchor.target) return
      const url = new URL(anchor.href, window.location.href)
      if (url.origin === window.location.origin) void prefetchRoute(url.pathname)
    }
    const onSwMessage = (event: MessageEvent) => {
      const data = event.data as {
        type?: string
        diagnostic?: { kind?: string; until?: number }
      }
      if (data?.type !== 'SW_DIAGNOSTIC' || data.diagnostic?.kind !== 'cdn_circuit_open') return
      blockedUntil = Math.max(blockedUntil, data.diagnostic.until ?? Date.now() + 30000)
    }
    if ('serviceWorker' in navigator) navigator.serviceWorker.addEventListener('message', onSwMessage)
    document.addEventListener('pointerover', onIntent, { passive: true })
    document.addEventListener('focusin', onIntent)
    document.addEventListener('touchstart', onIntent, { passive: true })
    return () => {
      if ('serviceWorker' in navigator) navigator.serviceWorker.removeEventListener('message', onSwMessage)
      document.removeEventListener('pointerover', onIntent)
      document.removeEventListener('focusin', onIntent)
      document.removeEventListener('touchstart', onIntent)
    }
  }, [])

  useEffect(() => {
    const target = idleRoutes[pathname]
    if (!target || !allowed()) return
    const prefetch = () => void prefetchRoute(target)
    const id = window.requestIdleCallback
      ? window.requestIdleCallback(prefetch, { timeout: 2500 })
      : window.setTimeout(prefetch, 1200)
    return () => {
      if (window.cancelIdleCallback) window.cancelIdleCallback(id)
      else window.clearTimeout(id)
    }
  }, [pathname])

  return null
}
