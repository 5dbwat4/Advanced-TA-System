import { lazy, type ComponentType } from 'react'

const ROUTE_LOAD_TIMEOUT_MS = 20000

export function lazyRoute<T extends object>(loader: () => Promise<{ default: ComponentType<T> }>) {
  return lazy(async () => {
    let timer = 0
    const timeout = new Promise<never>((_, reject) => {
      timer = window.setTimeout(() => reject(new Error('ROUTE_LOAD_TIMEOUT')), ROUTE_LOAD_TIMEOUT_MS)
    })
    try {
      return await Promise.race([loader(), timeout])
    } finally {
      window.clearTimeout(timer)
    }
  })
}
