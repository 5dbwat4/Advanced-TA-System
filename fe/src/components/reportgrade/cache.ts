import { createStore, del, entries, get, set } from 'idb-keyval'

import { fetchBytesWithProgress, type FetchProgress } from './shared'

/** 缓存总容量上限 512 MiB */
const MAX_TOTAL_BYTES = 512 * 1024 * 1024
/** 淘汰后回落到上限的 80% */
const TARGET_BYTES = MAX_TOTAL_BYTES * 0.8

type CachedAttachment = {
  id: number
  name: string
  size: number
  blob: Blob
  updatedAt: number
}

const store = createStore('tasaas', 'report-attachments')

let persistRequested = false

/** 尽力申请持久化存储（防浏览器自动清理），失败不影响缓存 */
function requestPersistOnce(): void {
  if (persistRequested || !navigator.storage?.persist) return
  persistRequested = true
  void navigator.storage.persist().catch(() => {})
}

async function readCachedAttachment(id: number, size: number): Promise<Uint8Array | null> {
  try {
    const cached = await get<CachedAttachment>(id, store)
    if (!cached) return null
    if (size > 0 && cached.size !== size) {
      void del(id, store).catch(() => {})
      return null
    }
    return new Uint8Array(await cached.blob.arrayBuffer())
  } catch {
    return null
  }
}

/** 判断是否已缓存（不读取字节） */
export async function isAttachmentCached(id: number, size: number): Promise<boolean> {
  try {
    const cached = await get<CachedAttachment>(id, store)
    if (!cached) return false
    return size <= 0 || cached.size === size
  } catch {
    return false
  }
}

async function writeCachedAttachment(id: number, name: string, bytes: Uint8Array): Promise<void> {
  const copy = Uint8Array.from(bytes)
  const record: CachedAttachment = {
    id,
    name,
    size: copy.length,
    blob: new Blob([copy.buffer]),
    updatedAt: Date.now(),
  }
  try {
    await set(id, record, store)
  } catch {
    try {
      await pruneCache(MAX_TOTAL_BYTES * 0.4)
      await set(id, record, store)
    } catch {
      return
    }
  }
  requestPersistOnce()
  void pruneCache().catch(() => {})
}

/** 按写入时间淘汰旧缓存，直到总量不超过 targetBytes */
async function pruneCache(targetBytes = TARGET_BYTES): Promise<void> {
  const all = await entries<number, CachedAttachment>(store)
  let total = all.reduce((sum, [, record]) => sum + record.size, 0)
  if (total <= targetBytes) return
  all.sort((a, b) => a[1].updatedAt - b[1].updatedAt)
  for (const [key, record] of all) {
    if (total <= targetBytes) break
    await del(key, store)
    total -= record.size
  }
}

/** 优先读本地缓存，未命中则流式下载并写入缓存 */
export async function loadAttachmentBytes(
  attachment: { id: number; name: string; size: number; url: string },
  onProgress: (progress: FetchProgress) => void,
): Promise<{ bytes: Uint8Array; fromCache: boolean }> {
  const cached = await readCachedAttachment(attachment.id, attachment.size)
  if (cached) {
    onProgress({ loaded: cached.length, total: cached.length })
    return { bytes: cached, fromCache: true }
  }
  const bytes = await fetchBytesWithProgress(attachment.url, onProgress)
  void writeCachedAttachment(attachment.id, attachment.name, bytes)
  return { bytes, fromCache: false }
}
