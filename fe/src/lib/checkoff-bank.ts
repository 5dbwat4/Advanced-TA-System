import { useCallback, useState } from 'react'

const STORAGE_KEY = 'tasaas.checkoff.bankId'

/**
 * 验收「使用其它题目集」覆盖：仅保存在本地（当前设备），
 * 覆盖实验设定的题目集；null 表示跟随实验设置。
 */
export function useCheckoffBankOverride() {
  const [bankId, setBankId] = useState<string | null>(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      return raw && raw.length > 0 ? raw : null
    } catch {
      return null
    }
  })

  const save = useCallback((next: string | null) => {
    setBankId(next)
    try {
      if (next) localStorage.setItem(STORAGE_KEY, next)
      else localStorage.removeItem(STORAGE_KEY)
    } catch {
      // localStorage 不可用时仅保留内存态
    }
  }, [])

  return { bankId, save }
}
