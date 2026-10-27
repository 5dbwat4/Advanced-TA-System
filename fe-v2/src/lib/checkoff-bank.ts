import { ref } from 'vue'

const STORAGE_KEY = 'tasaas.checkoff.bankId'

function readInitial(): string | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw && raw.length > 0 ? raw : null
  } catch {
    return null
  }
}

/**
 * 验收「使用其它题目集」覆盖：仅保存在本地（当前设备），
 * 覆盖实验设定的题目集；null 表示跟随实验设置。
 */
export function useCheckoffBankOverride() {
  const bankId = ref<string | null>(readInitial())

  function save(next: string | null) {
    bankId.value = next
    try {
      if (next) localStorage.setItem(STORAGE_KEY, next)
      else localStorage.removeItem(STORAGE_KEY)
    } catch {
      // localStorage 不可用时仅保留内存态
    }
  }

  return { bankId, save }
}
