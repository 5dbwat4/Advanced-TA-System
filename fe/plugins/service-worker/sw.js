const VERSION = '__BUILD_VERSION__'
const STATIC_CACHE = 'tasaas-static'
const SCOPE = self.registration.scope
const ASSETS_PATH = new URL('assets/', SCOPE).pathname
const ORIGIN_TIMEOUT_MS = 8000
const MAX_CACHE_ENTRIES = 600
const MAX_PRELOAD_ASSETS = 8
const API_PREFIXES = ['/api', '/socket.io', '/mcp']
const GRADE_TAG = 'tasaas-grade-updates'

const inFlight = new Map()
const diagnosticTimes = new Map()
let originActive = 0
const originQueue = []
let cacheWrites = 0
let preloadState = { done: 0, total: 0, failed: 0, complete: true }

function isManagedAsset(url) {
  return url.origin === self.location.origin && url.pathname.startsWith(ASSETS_PATH)
}

function isCacheable(response, url) {
  if (!response || !response.ok || response.type === 'opaque') return false
  const contentType = (response.headers.get('content-type') || '').toLowerCase()
  if (/\.m?js$/i.test(url.pathname)) return /javascript|ecmascript/.test(contentType)
  if (/\.css$/i.test(url.pathname)) return contentType.includes('text/css')
  return !contentType.includes('text/html')
}

async function postClient(message) {
  const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
  await Promise.all(clients.map((client) => client.postMessage(message)))
}

function diagnostic(kind, details = {}, throttleMs = 60000) {
  const key = kind + ':' + (details.url || '')
  const now = Date.now()
  if ((diagnosticTimes.get(key) || 0) + throttleMs > now) return
  diagnosticTimes.set(key, now)
  return postClient({
    type: 'SW_DIAGNOSTIC',
    diagnostic: { kind, version: VERSION, at: new Date(now).toISOString(), ...details },
  }).catch(() => {})
}

async function readCache(cache, request, url) {
  const hit = await cache.match(request)
  if (!hit) return null
  if (isCacheable(hit, url)) return hit
  await cache.delete(request)
  diagnostic('cache_entry_rejected', { url: request.url })
  return null
}

async function trimCache(cache) {
  const keys = await cache.keys()
  const excess = keys.length - MAX_CACHE_ENTRIES
  if (excess <= 0) return
  await Promise.all(keys.slice(0, excess).map((key) => cache.delete(key)))
}

async function fetchWithTimeout(input, timeoutMs) {
  const controller = new AbortController()
  const request = new Request(input, { signal: controller.signal })
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetch(request)
  } catch (error) {
    if (controller.signal.aborted) throw new Error('RESOURCE_TIMEOUT', { cause: error })
    throw error
  } finally {
    clearTimeout(timer)
  }
}

async function acquireOriginSlot() {
  if (originActive < 2) {
    originActive += 1
    return
  }
  await new Promise((resolve) => originQueue.push(resolve))
  originActive += 1
}

function releaseOriginSlot() {
  originActive = Math.max(0, originActive - 1)
  const next = originQueue.shift()
  if (next) next()
}

async function fetchOrigin(request) {
  await acquireOriginSlot()
  try {
    return await fetchWithTimeout(request, ORIGIN_TIMEOUT_MS)
  } finally {
    releaseOriginSlot()
  }
}

async function loadAsset(request, url, cache, event) {
  const response = await fetchOrigin(request)

  if (!isCacheable(response, url)) {
    await response.body?.cancel()
    diagnostic('resource_response_rejected', { url: request.url, status: response.status })
    throw new Error('INVALID_ASSET_RESPONSE')
  }

  const write = (async () => {
    await cache.put(request, response.clone())
    cacheWrites += 1
    if (cacheWrites % 100 === 0) await trimCache(cache)
  })().catch((error) => {
    diagnostic('cache_write_failed', { url: request.url, message: String(error) })
  })
  if (event) event.waitUntil(write)
  else await write
  return response
}

async function serveAsset(request, event) {
  const url = new URL(request.url)
  if (!isManagedAsset(url)) return fetch(request)
  const cache = await caches.open(STATIC_CACHE)
  const cached = await readCache(cache, request, url)
  if (cached) return cached

  let task = inFlight.get(request.url)
  const owner = !task
  if (!task) {
    task = loadAsset(request, url, cache, event)
    inFlight.set(request.url, task)
  }
  try {
    const response = await task
    return owner ? response : response.clone()
  } finally {
    if (inFlight.get(request.url) === task) inFlight.delete(request.url)
  }
}

async function preload(urls) {
  const selected = [...new Set(urls)].filter((raw) => {
    try {
      return isManagedAsset(new URL(raw, SCOPE))
    } catch {
      return false
    }
  }).slice(0, MAX_PRELOAD_ASSETS)
  preloadState = { done: 0, total: selected.length, failed: 0, complete: selected.length === 0 }
  for (const raw of selected) {
    try {
      const request = new Request(new URL(raw, SCOPE).href, { credentials: 'same-origin' })
      const response = await serveAsset(request, null)
      await response.body?.cancel()
    } catch {
      preloadState.failed += 1
    }
    preloadState.done += 1
  }
  preloadState.complete = true
  await postClient({ type: 'CHUNK_PROGRESS', ...preloadState }).catch(() => {})
}

self.addEventListener('install', (event) => {
  event.waitUntil(self.skipWaiting())
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys()
      await Promise.all(
        names
          .filter((name) => name.startsWith('tasaas-pages-') || name.startsWith('tasaas-manifest-'))
          .map((name) => caches.delete(name)),
      )
      await self.clients.claim()
      const cache = await caches.open(STATIC_CACHE)
      await trimCache(cache)
      await postClient({ type: 'SW_ACTIVATED', version: VERSION }).catch(() => {})
    })(),
  )
})

self.addEventListener('message', (event) => {
  const data = event.data || {}
  if (data.type === 'SKIP_WAITING') {
    event.waitUntil(self.skipWaiting())
    return
  }
  if (data.type === 'VERSION' && event.source && 'postMessage' in event.source) {
    event.source.postMessage({ type: 'VERSION', version: VERSION })
    return
  }
  if (data.type === 'PRELOAD_ASSETS' && Array.isArray(data.urls)) {
    event.waitUntil(preload(data.urls))
    return
  }
  if (data.type === 'PRELOAD_STATE' && event.source && 'postMessage' in event.source) {
    event.source.postMessage({ type: 'CHUNK_PROGRESS', ...preloadState })
    return
  }
  if (data.type === 'PRELOAD_START' && event.source && 'postMessage' in event.source) {
    event.source.postMessage({ type: 'CHUNK_PROGRESS', ...preloadState })
  }
})

self.addEventListener('fetch', (event) => {
  const request = event.request
  if (request.method !== 'GET' || request.mode === 'navigate') return
  let url
  try {
    url = new URL(request.url)
  } catch {
    return
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return
  if (url.origin === self.location.origin && API_PREFIXES.some((prefix) =>
    url.pathname === prefix || url.pathname.startsWith(prefix + '/'),
  )) return
  if (!isManagedAsset(url)) return
  event.respondWith(serveAsset(request, event))
})

self.addEventListener('push', (event) => {
  let payload = {}
  try {
    payload = event.data ? event.data.json() : {}
  } catch {
    payload = {}
  }
  const title = typeof payload.title === 'string' ? payload.title : '成绩更新'
  const body = typeof payload.body === 'string' ? payload.body : '你的成绩有更新'
  const tag = typeof payload.tag === 'string' ? payload.tag : GRADE_TAG
  const url = typeof payload.url === 'string' && payload.url.length > 0
    ? payload.url
    : 'student-console/scores'
  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon: new URL('icon-192.png', SCOPE).href,
      badge: new URL('favicon-32x32.png', SCOPE).href,
      tag,
      data: { url },
    }).catch(() => {}),
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const data = event.notification.data || {}
  const rawUrl = typeof data.url === 'string' && data.url.length > 0
    ? data.url
    : 'student-console/scores'
  const target = new URL(rawUrl, SCOPE).href
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      const existing = windows.find((client) =>
        client.url.startsWith(new URL('student-console', SCOPE).href),
      )
      if (existing) {
        if (existing.url !== target && typeof existing.navigate === 'function') {
          await existing.navigate(target)
        }
        return existing.focus()
      }
      return self.clients.openWindow(target)
    })(),
  )
})
