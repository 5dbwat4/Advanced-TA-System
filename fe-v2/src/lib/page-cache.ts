const STATIC_CACHE = 'tasaas-static'
const PAGE_CACHE_PREFIX = 'tasaas-pages-'

function isAppCache(name: string): boolean {
  return name === STATIC_CACHE || name.startsWith(PAGE_CACHE_PREFIX)
}

async function responseBytes(response: Response): Promise<number> {
  const declared = Number(response.headers.get('content-length'))
  if (Number.isFinite(declared) && declared > 0) return declared
  try {
    return (await response.clone().blob()).size
  } catch {
    return 0
  }
}

function supportsPageCache(): boolean {
  return typeof caches !== 'undefined'
}

export async function getPageCacheBytes(): Promise<number> {
  if (!supportsPageCache()) return 0
  try {
    const names = (await caches.keys()).filter(isAppCache)
    let total = 0
    for (const name of names) {
      const cache = await caches.open(name)
      const requests = await cache.keys()
      for (const request of requests) {
        const response = await cache.match(request)
        if (response) total += await responseBytes(response)
      }
    }
    return total
  } catch {
    return 0
  }
}

export async function clearPageCache(): Promise<void> {
  if (!supportsPageCache()) return
  const names = (await caches.keys()).filter(isAppCache)
  await Promise.all(names.map((name) => caches.delete(name)))
}
