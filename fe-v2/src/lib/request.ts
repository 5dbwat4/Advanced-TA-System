import { ref, watch, type Ref, type WatchSource } from 'vue'

import { getErrorMessage } from '@/lib/error'

export function useAsyncData<T>(
  fetcher: () => Promise<T>,
  deps: WatchSource[] = [],
): {
  data: Ref<T | null>
  error: Ref<string | null>
  loading: Ref<boolean>
  reload: () => Promise<void>
} {
  const data = ref<T | null>(null) as Ref<T | null>
  const error = ref<string | null>(null)
  const loading = ref(true)
  const nonce = ref(0)
  let current = 0

  async function load() {
    const run = ++current
    loading.value = true
    try {
      const result = await fetcher()
      if (run !== current) return
      data.value = result
      error.value = null
    } catch (err: unknown) {
      if (run !== current) return
      error.value = getErrorMessage(err, '加载失败')
    } finally {
      if (run === current) loading.value = false
    }
  }

  watch(
    [...deps, nonce],
    () => {
      void load()
    },
    { immediate: true },
  )

  return {
    data,
    error,
    loading,
    reload: async () => {
      nonce.value += 1
      await new Promise<void>((resolve) => {
        const stop = watch(loading, (value) => {
          if (!value) {
            stop()
            resolve()
          }
        })
      })
    },
  }
}
