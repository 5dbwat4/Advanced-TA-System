/* Service Worker：缓存前端静态资源（Cache Storage），不缓存 API。
 * 由 fe/plugins/loading.ts 在构建时注入 __BUILD_VERSION__（每次部署版本变化以触发更新提示）。
 *
 * 缓存布局：
 * - tasaas-static（不含版本，长期复用）：内容哈希的 /assets/*、字体等，cache-first，
 *   实现增量更新——未改动的 chunk hash 不变、直接命中缓存。
 * - tasaas-pages-<VERSION>（按版本隔离）：index.html 与 manifest.json，cache-first。
 *   install 时预取本版本两者；activate 时清理旧版本。这样页面与 manifest 始终同版本，
 *   应用只在用户点“刷新”（新 SW 接管）后升级，而不是静默更新。
 *
 * 预缓存：页面加载器通过 postMessage 发送 { type: 'PRECACHE', assets }，
 *   SW 逐条 fetch（流式读取并统计字节）写入 STATIC_CACHE，并通过 MessagePort 上报
 *   progress / done / error，最后发送 complete；命中缓存时直接上报 done。
 * /api、/socket.io、/mcp：直接放行，绝不缓存。
 * 更新：默认不 skipWaiting，等待页面提示用户后发送 SKIP_WAITING 再接管。
 */
const VERSION = '__BUILD_VERSION__'

const STATIC_CACHE = 'tasaas-static'
const PAGE_CACHE = `tasaas-pages-${VERSION}`

const SCOPE = self.registration.scope
const PAGE_KEY = new URL('index.html', SCOPE).href
const MANIFEST_PATH = new URL('manifest.json', SCOPE).pathname
const MANIFEST_KEY = new URL('manifest.json', SCOPE).href

const API_PREFIXES = ['/api', '/socket.io', '/mcp']
const FONT_CSS_ORIGIN = 'https://fonts.googleapis.com'
const FONT_FILE_ORIGIN = 'https://fonts.gstatic.com'
const PRECACHE_CONCURRENCY = 6

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

self.addEventListener('install', (event) => {
  // 预取本版本的 index.html 与 manifest.json，供刷新后由新 SW 直接命中；
  // 具体资源由页面加载器按需预缓存。
  event.waitUntil(
    (async () => {
      const cache = await caches.open(PAGE_CACHE)
      const [page, manifest] = await Promise.all([
        fetch(new Request(SCOPE, { cache: 'reload' })),
        fetch(new Request(MANIFEST_KEY, { cache: 'reload' })),
      ])
      if (isCacheable(page)) await cache.put(PAGE_KEY, page)
      if (isCacheable(manifest)) await cache.put(MANIFEST_KEY, manifest)
    })().catch(() => {}),
  )
  // 不调用 skipWaiting：保留 waiting 状态，交给页面提示用户更新。
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys()
      await Promise.all(
        names
          .filter((name) => name.startsWith('tasaas-pages-') && name !== PAGE_CACHE)
          .map((name) => caches.delete(name)),
      )
      await self.clients.claim()
    })(),
  )
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
  if (data.type === 'PRECACHE') {
    const port = event.ports && event.ports[0]
    const assets = Array.isArray(data.assets) ? data.assets : []
    event.waitUntil(handlePrecache(assets, port))
  }
})

async function handlePrecache(assets, port) {
  const cache = await caches.open(STATIC_CACHE)

  // 先算出有哪些资源需要更新（未命中缓存），只下载这些。
  const pending = []
  await Promise.all(
    assets.map(async (asset) => {
      if (!asset || !asset.u) return
      const cached = await cache.match(new Request(asset.u, { credentials: 'same-origin' }))
      if (!cached) pending.push(asset)
    }),
  )
  if (port) port.postMessage({ type: 'plan', pending: pending.map((asset) => ({ u: asset.u, s: asset.s })) })
  if (pending.length === 0) {
    if (port) port.postMessage({ type: 'complete', ok: true })
    return
  }

  let failed = false
  await runPool(
    pending.map((asset) => async () => {
      const ok = await precacheAsset(asset, cache, port)
      if (!ok) failed = true
    }),
    PRECACHE_CONCURRENCY,
  )
  if (port) port.postMessage({ type: 'complete', ok: !failed })
}

async function precacheAsset(asset, cache, port) {
  const url = asset && asset.u
  if (!url) return true
  const request = new Request(url, { credentials: 'same-origin' })

  try {
    const response = await fetch(request)
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    const header = response.headers.get('content-length')
    const declared = Number(asset.s) > 0 ? Number(asset.s) : header && !isNaN(+header) ? +header : 0
    const copy = response.clone()

    if (response.body && typeof response.body.getReader === 'function') {
      const reader = response.body.getReader()
      let received = 0
      for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        received += value.length
        port?.postMessage({ type: 'progress', url, received, total: declared })
      }
      await cache.put(request, copy)
      port?.postMessage({ type: 'done', url, bytes: received, total: declared || received })
      return true
    }

    const buffer = await response.arrayBuffer()
    await cache.put(request, copy)
    port?.postMessage({ type: 'done', url, bytes: buffer.byteLength, total: declared || buffer.byteLength })
    return true
  } catch (error) {
    port?.postMessage({ type: 'error', url, message: String((error && error.message) || error) })
    return false
  }
}

async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName)
  const cached = await cache.match(request)
  if (cached) return cached
  const response = await fetch(request)
  if (isCacheable(response)) cache.put(request, response.clone())
  return response
}

async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName)
  const cached = await cache.match(request)
  const network = fetch(request)
    .then((response) => {
      if (isCacheable(response)) cache.put(request, response.clone())
      return response
    })
    .catch(() => undefined)
  return cached || network || Response.error()
}

/** 页面 / manifest：从当前版本的 PAGE_CACHE 命中；未命中再联网并缓存。 */
async function pageAsset(key, request) {
  const cache = await caches.open(PAGE_CACHE)
  const cached = await cache.match(key)
  if (cached) return cached
  const response = await fetch(request)
  if (isCacheable(response)) cache.put(key, response.clone())
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

  const sameOrigin = url.origin === self.location.origin

  if (sameOrigin && API_PREFIXES.some((prefix) => url.pathname === prefix || url.pathname.startsWith(`${prefix}/`))) {
    return
  }

  if (request.mode === 'navigate') {
    event.respondWith(pageAsset(PAGE_KEY, request))
    return
  }

  if (sameOrigin && url.pathname === MANIFEST_PATH) {
    event.respondWith(pageAsset(MANIFEST_KEY, request))
    return
  }

  if (sameOrigin && url.pathname.startsWith('/assets/')) {
    event.respondWith(cacheFirst(request, STATIC_CACHE))
    return
  }

  if (url.origin === FONT_CSS_ORIGIN) {
    event.respondWith(staleWhileRevalidate(request, STATIC_CACHE))
    return
  }
  if (url.origin === FONT_FILE_ORIGIN) {
    event.respondWith(cacheFirst(request, STATIC_CACHE))
    return
  }

  if (sameOrigin) {
    event.respondWith(staleWhileRevalidate(request, STATIC_CACHE))
  }
})
