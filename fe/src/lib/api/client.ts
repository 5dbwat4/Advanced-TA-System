const TOKEN_KEY = 'tasaas.token'
const API_TIMEOUT_MS = 30_000
export const AUTH_UNAUTHORIZED_EVENT = 'tasaas:auth-unauthorized'
const PUBLIC_AUTH_PATHS = [
  '/api/auth/login',
  '/api/auth/zjuam/login',
  '/api/auth/zjuam/select-class',
  '/api/auth/select',
  '/api/auth/student/exchange',
  '/api/auth/passkey/authentication-verify',
  '/api/auth/passkey/authentication-options',
]

function isPublicAuthPath(path: string): boolean {
  return PUBLIC_AUTH_PATHS.some((prefix) => path.startsWith(prefix))
}

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY)
}

export function setToken(token: string | null) {
  if (token) localStorage.setItem(TOKEN_KEY, token)
  else localStorage.removeItem(TOKEN_KEY)
}

export class ApiError extends Error {
  status: number
  code: string

  constructor(status: number, code: string, message: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
  }
}

type ApiRequestInit = RequestInit & {
  /** 公开 token 接口的 401 描述链接本身，不代表当前登录已失效 */
  ignoreUnauthorizedEvent?: boolean
}

export async function apiFetch<T>(path: string, init: ApiRequestInit = {}): Promise<T> {
  const { ignoreUnauthorizedEvent = false, ...requestInit } = init
  const headers = new Headers(requestInit.headers)
  const token = getToken()
  if (requestInit.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json')
  if (token) headers.set('Authorization', `Bearer ${token}`)

  const controller = new AbortController()
  let timedOut = false
  const timer = setTimeout(() => {
    timedOut = true
    controller.abort()
  }, API_TIMEOUT_MS)
  const onAbort = () => controller.abort()
  if (requestInit.signal) {
    if (requestInit.signal.aborted) controller.abort()
    else requestInit.signal.addEventListener('abort', onAbort, { once: true })
  }

  let res: Response | null = null
  let text = ''
  try {
    res = await fetch(path, { ...requestInit, headers, signal: controller.signal })
    text = await res.text()
  } catch {
    if (timedOut) throw new ApiError(0, 'REQUEST_TIMEOUT', '请求超时，请稍后重试')
    if (requestInit.signal?.aborted) throw new ApiError(0, 'REQUEST_ABORTED', '请求已取消')
    throw new ApiError(0, 'NETWORK_ERROR', '网络错误，请检查连接后重试')
  } finally {
    clearTimeout(timer)
    requestInit.signal?.removeEventListener('abort', onAbort)
  }

  if (!res) throw new ApiError(0, 'NETWORK_ERROR', '网络错误，请检查连接后重试')

  let data: unknown = null
  let parseFailed = false
  if (text) {
    try {
      data = JSON.parse(text)
    } catch {
      parseFailed = true
    }
  }

  if (!res.ok) {
    const shaped = typeof data === 'object' && data !== null ? data : null
    const code =
      shaped !== null && 'error' in shaped && typeof shaped.error === 'string'
        ? shaped.error
        : 'UNKNOWN'
    const message =
      shaped !== null && 'message' in shaped && typeof shaped.message === 'string'
        ? shaped.message
        : parseFailed
          ? '请求失败，且响应不是有效的 JSON'
          : '请求失败，请稍后重试'
    if (
      res.status === 401 &&
      token &&
      !ignoreUnauthorizedEvent &&
      !isPublicAuthPath(path) &&
      typeof window !== 'undefined'
    ) {
      window.dispatchEvent(new Event(AUTH_UNAUTHORIZED_EVENT))
    }
    throw new ApiError(res.status, code, message)
  }

  if (parseFailed) {
    throw new ApiError(res.status, 'INVALID_RESPONSE', '服务器返回了无法解析的数据')
  }

  return (data ?? null) as T
}
