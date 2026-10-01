import { useCallback, useEffect, useState } from 'react'
import { getErrorMessage } from '@/lib/error'

export function useAsyncData<T>(
  fetcher: () => Promise<T>,
  deps: readonly unknown[],
): { data: T | null; error: string | null; loading: boolean; reload: () => void } {
  const [data, setData] = useState<T | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [nonce, setNonce] = useState(0)

  const reload = useCallback(() => setNonce((n) => n + 1), [])

  useEffect(() => {
    let current = true
    setLoading(true)
    fetcher()
      .then((result) => {
        if (!current) return
        setData(result)
        setError(null)
      })
      .catch((err: unknown) => {
        if (!current) return
        setError(getErrorMessage(err, '加载失败'))
      })
      .finally(() => {
        if (current) setLoading(false)
      })
    return () => {
      current = false
    }
  }, [...deps, nonce])

  return { data, error, loading, reload }
}
