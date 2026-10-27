export type RuntimeInfo = {
  dev: boolean
}

let runtimePromise: Promise<RuntimeInfo | null> | null = null

/** 当前页面是否通过 localhost / 回环地址访问 */
export function isLocalhostHost(): boolean {
  const hostname = window.location.hostname.toLowerCase()
  return (
    hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    hostname === '[::1]' ||
    hostname === '::1' ||
    hostname.endsWith('.localhost')
  )
}

/** 读取后端运行状态（缓存）；失败时返回 null */
export function getRuntimeInfo(): Promise<RuntimeInfo | null> {
  if (!runtimePromise) {
    runtimePromise = fetch('/api/health', {
      headers: { accept: 'application/json' },
    })
      .then(async (response) => {
        if (!response.ok) return null
        const data = (await response.json().catch(() => null)) as { dev?: unknown } | null
        return typeof data?.dev === 'boolean' ? { dev: data.dev } : null
      })
      .catch(() => null)
  }
  return runtimePromise
}

/** localhost + 后端 dev 时视为本地开发环境 */
export async function isLocalDev(): Promise<boolean> {
  if (!isLocalhostHost()) return false
  const info = await getRuntimeInfo()
  return info?.dev === true
}
