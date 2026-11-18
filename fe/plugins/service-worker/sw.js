/* Service Worker：仅缓存前端构建产物（/assets/*），绝不缓存 index.html 等页面、manifest 或 API。
 * 由 fe/plugins/service-worker.ts 在构建时注入 __BUILD_VERSION__（每次部署版本变化以触发更新提示）。
 *
 * 缓存布局：
 * - tasaas-static（不含版本，长期复用）：仅内容哈希的 /assets/*（js/css 等），cache-first，
 *   实现增量更新——未改动的 chunk hash 不变、直接命中缓存。
 * - 页面导航（index.html 之类）、manifest.json、/api、/socket.io、/mcp 一律放行到网络，
 *   由 Service Worker 完全不管，避免页面被旧缓存卡住或导航被 SW 拦截报错。
 *
 * 加载策略（按需）：
 * - install 不预取任何页面或 manifest。
 * - 不在 activate 时主动预加载全部 chunk；只有页面明确发送 PRELOAD_START 时才在后台
 *   基于 manifest.json 按需预取（当前首屏加载器已不再发送该消息）。
 * - 页面请求 /assets/* 时 cache-first：命中直接返回；未命中立刻联网（不会等待后台预加载），
 *   并把响应写入缓存；若同一资源后台正在下载，则复用在途请求，避免重复下载。
 * 更新：默认不 skipWaiting，等待页面提示用户后发送 SKIP_WAITING 再接管。
 */
const VERSION = '__BUILD_VERSION__'

const STATIC_CACHE = 'tasaas-static'

const SCOPE = self.registration.scope
const MANIFEST_KEY = new URL('manifest.json', SCOPE).href
const ASSETS_PATH = new URL('assets/', SCOPE).pathname

const API_PREFIXES = ['/api', '/socket.io', '/mcp']
// 只占一个连接：浏览器同源并发通常为 6，其余留给 entry / 当前路由的按需加载。
const PRELOAD_CONCURRENCY = 1
const CHUNK_RE = /\.(?:m?js|css)$/i

const GRADE_TAG = 'tasaas-grade-updates'

const isCacheable = (response) => !!response && (response.ok || response.type === 'opaque')

async function runPool(tasks, limit) {
  let index = 0
  const runners = new Array(Math.min(limit, tasks.length)).fill(0).map(async () => {
    while (index < tasks.length) {
      const current = index
      index += 1
      await tasks[current]()
    }
  })
  await Promise.all(runners)
}

function isChunk(url) {
  try {
    const parsed = new URL(url, SCOPE)
    if (parsed.origin !== self.location.origin) return false
    if (!parsed.pathname.startsWith(ASSETS_PATH)) return false
    return CHUNK_RE.test(parsed.pathname)
  } catch {
    return false
  }
}

/* ---------- 后台 chunk 加载进程 ---------- */

let preloadPromise = null
let preloadState = null
let broadcastTimer = 0

/** 后台预加载中的 URL -> Promise<void>（完成时代表已写入 Cache Storage）。 */
const preloadTasks = new Map()
/** 页面发出、仍在下载中的 URL -> Promise<void>（完成后可直接从缓存命中）。 */
const pageTasks = new Map()
/** 本版本需要加载的 chunk 及其大小。 */
const chunkSizes = new Map()
/** 已计入进度的 chunk（无论成功失败，保证进度能收敛到 100%）。 */
const chunkDone = new Set()

function progressMessage() {
  if (!preloadState) return null
  return {
    type: 'CHUNK_PROGRESS',
    done: preloadState.done,
    total: preloadState.total,
    bytes: preloadState.bytes,
    totalBytes: preloadState.totalBytes,
    failed: preloadState.failed,
    complete: preloadState.complete,
  }
}

async function broadcastProgress() {
  const message = progressMessage()
  if (!message) return
  const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
  await Promise.all(
    clients.map(async (client) => {
      try {
        client.postMessage(message)
      } catch {
        /* 客户端已关闭 */
      }
    }),
  )
}

function scheduleBroadcast(force) {
  if (force) {
    if (broadcastTimer) {
      clearTimeout(broadcastTimer)
      broadcastTimer = 0
    }
    broadcastProgress()
    return
  }
  if (broadcastTimer) return
  broadcastTimer = setTimeout(() => {
    broadcastTimer = 0
    broadcastProgress()
  }, 120)
}

function markChunkSettled(url, bytes, failed) {
  if (!preloadState || !chunkSizes.has(url) || chunkDone.has(url)) return
  chunkDone.add(url)
  preloadState.done += 1
  preloadState.bytes += Number(bytes) > 0 ? Number(bytes) : 0
  if (failed) preloadState.failed += 1
  if (preloadState.done >= preloadState.total) preloadState.complete = true
  scheduleBroadcast(preloadState.complete)
}

async function readManifest() {
  // manifest.json 仅用于确定需预取的 chunk 列表，不写入缓存。
  const response = await fetch(new Request(MANIFEST_KEY, { cache: 'no-store' }))
  if (!response || !response.ok) throw new Error('manifest unavailable')
  return response.json()
}

/**
 * 开始（或复用）后台预加载进程。进程可被重复调用：已完成后再调用会快速扫描缓存并重新广播状态。
 * 页面侧的 PRELOAD_START / PRELOAD_STATE 会用 event.waitUntil 锚定它，避免 SW 在下载途中被回收。
 */
function startPreload() {
  if (preloadPromise) return preloadPromise

  preloadPromise = (async () => {
    const manifest = await readManifest()
    const assets = Array.isArray(manifest.assets) ? manifest.assets : []

    const chunks = []
    const seen = new Set()
    chunkSizes.clear()
    chunkDone.clear()
    for (const asset of assets) {
      if (!asset || typeof asset.u !== 'string') continue
      if (!isChunk(asset.u) || seen.has(asset.u)) continue
      seen.add(asset.u)
      const size = Number(asset.s) > 0 ? Number(asset.s) : 0
      chunkSizes.set(asset.u, size)
      chunks.push({ u: asset.u, s: size })
    }

    preloadState = {
      done: 0,
      total: chunks.length,
      bytes: 0,
      totalBytes: chunks.reduce((sum, asset) => sum + asset.s, 0),
      failed: 0,
      complete: chunks.length === 0,
    }
    scheduleBroadcast(true)

    const cache = await caches.open(STATIC_CACHE)
    const pending = []
    const hits = await Promise.all(
      chunks.map((asset) => cache.match(new Request(asset.u, { credentials: 'same-origin' }))),
    )
    hits.forEach((hit, index) => {
      if (hit) markChunkSettled(chunks[index].u, chunks[index].s, false)
      else pending.push(chunks[index])
    })

    if (pending.length === 0) {
      preloadState.complete = true
      scheduleBroadcast(true)
      return progressMessage()
    }

    await runPool(
      pending.map((asset) => async () => {
        await preloadAsset(asset, cache)
      }),
      PRELOAD_CONCURRENCY,
    )
    preloadState.complete = true
    scheduleBroadcast(true)
    return progressMessage()
  })()
    .catch(() => {
      if (!preloadState) {
        preloadState = { done: 0, total: 0, bytes: 0, totalBytes: 0, failed: 0, complete: true }
      }
      preloadState.complete = true
      scheduleBroadcast(true)
      return progressMessage()
    })
    .finally(() => {
      preloadPromise = null
    })

  return preloadPromise
}

async function preloadAsset(asset, cache) {
  const url = asset.u
  const request = new Request(url, { credentials: 'same-origin' })

  const cached = await cache.match(request)
  if (cached) {
    markChunkSettled(url, asset.s, false)
    return
  }

  // 页面已经开始下载同一资源：等它写完缓存即可，避免重复请求。
  const pageTask = pageTasks.get(url)
  if (pageTask) {
    await pageTask.catch(() => {})
    const hit = await cache.match(request)
    if (hit) {
      markChunkSettled(url, asset.s, false)
      return
    }
  }

  // 已有同资源的预加载在途（正常不会发生，runPool 已去重），直接复用。
  const inFlight = preloadTasks.get(url)
  if (inFlight) {
    await inFlight.catch(() => {})
    return
  }

  const task = (async () => {
    const response = await fetch(request)
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    await cache.put(request, response)
    markChunkSettled(url, asset.s, false)
  })()

  preloadTasks.set(url, task)
  try {
    await task
  } catch {
    markChunkSettled(url, asset.s, true)
  } finally {
    if (preloadTasks.get(url) === task) preloadTasks.delete(url)
  }
}

self.addEventListener('install', () => {
  // 不再预取任何页面或 manifest；/assets/* 仅在页面实际请求时按需缓存。
  // 不调用 skipWaiting：保留 waiting 状态，交给页面提示用户更新。
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys()
      // 清理历史版本遗留的页面 / manifest 缓存，之后不再缓存任何页面。
      await Promise.all(
        names
          .filter((name) => name.startsWith('tasaas-pages-'))
          .map((name) => caches.delete(name)),
      )
      await self.clients.claim()
    })(),
  )
  // 不主动预加载全部 chunk；页面需要时再发送 PRELOAD_START。
})

self.addEventListener('message', (event) => {
  const data = event.data || {}
  if (data.type === 'SKIP_WAITING') {
    self.skipWaiting()
    return
  }
  if (data.type === 'VERSION' && event.source && 'postMessage' in event.source) {
    event.source.postMessage({ type: 'VERSION', version: VERSION })
    return
  }
  if (data.type === 'PRELOAD_START') {
    event.waitUntil(startPreload().catch(() => {}))
    return
  }
  if (data.type === 'PRELOAD_STATE') {
    const message = progressMessage() || {
      type: 'CHUNK_PROGRESS',
      done: 0,
      total: 0,
      bytes: 0,
      totalBytes: 0,
      failed: 0,
      complete: false,
    }
    if (event.source && 'postMessage' in event.source) {
      try {
        event.source.postMessage(message)
      } catch {
        /* 客户端已关闭 */
      }
    }
    // 顺带恢复/保活后台进程（例如上一次事件结束后 SW 被回收）。
    event.waitUntil(startPreload().catch(() => {}))
  }
})

/**
 * 页面请求 /assets/*：命中缓存立即返回；否则立刻联网（流式返回给页面），
 * 同时写一份副本到缓存。若后台预加载正在下载同一资源，则复用它，避免重复下载。
 */
async function serveChunk(request) {
  const cache = await caches.open(STATIC_CACHE)
  const hit = await cache.match(request)
  if (hit) return hit

  const url = request.url

  const preloading = preloadTasks.get(url)
  if (preloading) {
    try {
      await preloading
    } catch {
      /* 预加载失败则回退到页面自己请求 */
    }
    const cached = await cache.match(request)
    if (cached) return cached
  }

  const pending = pageTasks.get(url)
  if (pending) {
    try {
      await pending
    } catch {
      /* 另一个页面请求失败则重试 */
    }
    const cached = await cache.match(request)
    if (cached) return cached
  }

  let resolveTask
  const task = new Promise((resolve) => {
    resolveTask = resolve
  })
  pageTasks.set(url, task)

  let response
  try {
    response = await fetch(request)
  } catch (error) {
    if (pageTasks.get(url) === task) pageTasks.delete(url)
    resolveTask()
    throw error
  }

  if (isCacheable(response)) {
    const copy = response.clone()
    cache
      .put(request, copy)
      .catch(() => false)
      .then((ok) => {
        const header = response.headers.get('content-length')
        const declared = Number(header)
        const size = chunkSizes.get(url) || (declared > 0 ? declared : 0)
        markChunkSettled(url, size, ok === false)
      })
      .finally(() => {
        if (pageTasks.get(url) === task) pageTasks.delete(url)
        resolveTask()
      })
  } else {
    if (pageTasks.get(url) === task) pageTasks.delete(url)
    resolveTask()
  }

  return response
}

self.addEventListener('fetch', (event) => {
  const request = event.request
  if (request.method !== 'GET') return

  let url
  try {
    url = new URL(request.url)
  } catch {
    return
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return

  // 页面导航一律交给网络，SW 不接管，避免缓存页面或拦截导航时报误导性错误。
  if (request.mode === 'navigate') return

  if (url.origin !== self.location.origin) return

  if (API_PREFIXES.some((prefix) => url.pathname === prefix || url.pathname.startsWith(`${prefix}/`))) {
    return
  }

  // 只缓存构建产物 /assets/*；manifest、sw.js、图标等其余同源请求一律放行。
  if (url.pathname.startsWith(ASSETS_PATH)) {
    event.respondWith(serveChunk(request))
  }
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
  const url =
    typeof payload.url === 'string' && payload.url.length > 0
      ? payload.url
      : 'student-console/scores'

  event.waitUntil(
    self.registration
      .showNotification(title, {
        body,
        icon: new URL('icon-192.png', SCOPE).href,
        badge: new URL('favicon-32x32.png', SCOPE).href,
        tag,
        data: { url },
      })
      .catch(() => {}),
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const data = event.notification.data || {}
  const rawUrl =
    typeof data.url === 'string' && data.url.length > 0 ? data.url : 'student-console/scores'
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
