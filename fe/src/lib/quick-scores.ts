import { useCallback, useState } from 'react'

const STORAGE_KEY = 'tasaas.quickScores'

/** 默认快捷分值 */
export const DEFAULT_QUICK_SCORES = [100, 50, 0]

/** 过滤非法 / 越界 / 重复值；为空时回退默认 */
function sanitize(values: unknown): number[] {
  if (!Array.isArray(values)) return [...DEFAULT_QUICK_SCORES]
  const seen = new Set<number>()
  const out: number[] = []
  for (const value of values) {
    const num = typeof value === 'number' ? value : Number(value)
    if (!Number.isFinite(num) || num < -1000 || num > 1000 || seen.has(num)) continue
    seen.add(num)
    out.push(num)
  }
  return out.length > 0 ? out : [...DEFAULT_QUICK_SCORES]
}

/** 快捷分值（本地持久化，跨设备不同步） */
export function useQuickScores() {
  const [values, setValues] = useState<number[]>(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      return raw ? sanitize(JSON.parse(raw)) : [...DEFAULT_QUICK_SCORES]
    } catch {
      return [...DEFAULT_QUICK_SCORES]
    }
  })

  const save = useCallback((next: number[]) => {
    const clean = sanitize(next)
    setValues(clean)
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(clean))
    } catch {
      // localStorage 不可用时仅保留内存态
    }
  }, [])

  return { values, save }
}
