import * as Sentry from '@sentry/react'
import { createRoutesFromChildren, matchRoutes, useLocation, useNavigationType } from 'react-router-dom'

import { isLocalDev, isLocalhostHost } from '@/lib/runtime'

const SENSITIVE_HEADER = /authorization|cookie|token|password|captcha|credential/i
let initialized = false
let starting = false

function readRate(value: string | undefined, fallback: number): number {
  if (!value) return fallback
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
    return raw.split('?')[0] ?? raw
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
}

export function initSentry(): void {
  const dsn = import.meta.env.VITE_SENTRY_DSN?.trim()
  if (!dsn || initialized || starting) return

  // localhost 下先确认后端是否为 dev；是 dev 时完全不初始化 Sentry
  if (!isLocalhostHost()) {
    startSentry(dsn)
    return
  }

  starting = true
  void isLocalDev()
    .then((localDev) => {
      starting = false
      if (!localDev) startSentry(dsn)
    })
    .catch(() => {
      starting = false
    })
}

export function setSentryUser(user: { id: string; role: string } | null): void {
  if (!initialized) return
  Sentry.setUser(user ? { id: user.id } : null)
  Sentry.setTag('role', user?.role ?? 'anonymous')
}
