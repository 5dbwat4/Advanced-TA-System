import * as Sentry from '@sentry/react'
import { createRoutesFromChildren, matchRoutes, useLocation, useNavigationType } from 'react-router-dom'

import { isLocalhostHost } from '@/lib/runtime'

const SENSITIVE_HEADER = /authorization|cookie|token|password|captcha|credential/i
const diagnosticTimes = new Map<string, number>()
let initialized = false

function readRate(value: string | undefined, fallback: number): number {
  const rate = Number(value)
  return Number.isFinite(rate) && rate >= 0 && rate <= 1 ? rate : fallback
}

function stripQuery(raw: string): string {
  try {
    const url = new URL(raw, window.location.origin)
    url.search = ''
    url.hash = ''
    return url.toString()
  } catch {
    return raw.split('?')[0] ?? ''
  }
}

function diagnosticContext(details: Record<string, unknown>): Record<string, string | number | boolean> {
  const result: Record<string, string | number | boolean> = {}
  for (const [key, value] of Object.entries(details)) {
    if (typeof value !== 'string' && typeof value !== 'number' && typeof value !== 'boolean') continue
    result[key] = key === 'url' && typeof value === 'string' ? stripQuery(value) : value
  }
  return result
}

export function reportRuntimeDiagnostic(
  kind: string,
  details: Record<string, unknown> = {},
  throttleMs = 60000,
): void {
  if (!initialized) return
  const url = typeof details.url === 'string' ? details.url : ''
  const key = `${kind}:${url}`
  const now = Date.now()
  if (throttleMs > 0 && (diagnosticTimes.get(key) ?? 0) + throttleMs > now) return
  diagnosticTimes.set(key, now)
  const errorLevel = /failed|error|rejected|stuck|exhausted/.test(kind) ? 'error' : 'warning'
  Sentry.captureMessage(`frontend:${kind}`, {
    level: errorLevel,
    tags: { frontendDiagnostic: kind, release: __BUILD_HASH__ },
    contexts: { runtime: diagnosticContext(details) },
    fingerprint: ['frontend-runtime', kind],
  })
}

export function reportRouteError(error: unknown, route: string): void {
  if (!initialized) return
  Sentry.captureException(error, {
    tags: { frontendDiagnostic: 'route_render_error', release: __BUILD_HASH__ },
    contexts: { runtime: { route } },
    fingerprint: ['frontend-route', route],
  })
}

function flushEarlyErrors(): void {
  const pending = window.__TA_EARLY_ERRORS__
  if (!pending?.length) return
  for (const item of pending.splice(0)) {
    reportRuntimeDiagnostic(item.kind, { message: item.message, url: item.url }, 0)
  }
}

function startSentry(dsn: string): void {
  if (initialized) return
  initialized = true

  Sentry.init({
    dsn,
    tunnel: '/api/theke-kerykos',
    environment: import.meta.env.VITE_SENTRY_ENVIRONMENT ?? import.meta.env.MODE,
    release: __BUILD_HASH__,
    dataCollection: {
      userInfo: false,
      cookies: false,
      httpHeaders: false,
      httpBodies: [],
      urlQueryParams: false,
      stackFrameVariables: false,
    },
    integrations: [
      Sentry.reactRouterV7BrowserTracingIntegration({
        useLocation,
        useNavigationType,
        createRoutesFromChildren,
        matchRoutes,
      }),
    ],
    tracesSampleRate: readRate(import.meta.env.VITE_SENTRY_TRACES_SAMPLE_RATE, 0.1),
    beforeBreadcrumb(breadcrumb) {
      if (breadcrumb.category === 'console') return null
      if (breadcrumb.data) {
        for (const key of ['url', 'from', 'to']) {
          const value = breadcrumb.data[key]
          if (typeof value === 'string') breadcrumb.data[key] = stripQuery(value)
        }
      }
      return breadcrumb
    },
    beforeSend(event) {
      if (event.request) {
        delete event.request.data
        delete event.request.cookies
        delete event.request.query_string
        if (event.request.url) event.request.url = stripQuery(event.request.url)
        if (event.request.headers) {
          for (const key of Object.keys(event.request.headers)) {
            if (SENSITIVE_HEADER.test(key)) delete event.request.headers[key]
          }
        }
      }
      return event
    },
  })

  window.__TA_REPORT__ = reportRuntimeDiagnostic
  window.__TA_FLUSH__ = () => Sentry.flush(1500)
  window.addEventListener('vite:preloadError', (event) => {
    reportRuntimeDiagnostic('chunk_load_error', {
      message: String(event.payload ?? 'dynamic import failed'),
      url: window.location.href,
    })
  })
  flushEarlyErrors()
}

export function initSentry(): void {
  const dsn = import.meta.env.VITE_SENTRY_DSN?.trim()
  if (!dsn || initialized) return
  if (isLocalhostHost()) return
  startSentry(dsn)
}

export function setSentryUser(user: { id: string; role: string } | null): void {
  if (!initialized) return
  Sentry.setUser(user ? { id: user.id } : null)
  Sentry.setTag('role', user?.role ?? 'anonymous')
}
