import { warnStorageFailure } from '@/lib/storage-log'

const STORAGE_KEY = 'tasaas.zjuam'

export type ZjuamCredential = {
  account: string
  password: string
}

export function getZjuamCredential(): ZjuamCredential | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<ZjuamCredential> | null
    if (!parsed || typeof parsed.account !== 'string' || typeof parsed.password !== 'string') {
      return null
    }
    return { account: parsed.account, password: parsed.password }
  } catch (error) {
    warnStorageFailure('read ZJUAM credential', error)
    return null
  }
}

export function setZjuamCredential(cred: ZjuamCredential): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(cred))
  } catch (error) {
    warnStorageFailure('save ZJUAM credential', error)
  }
}

export function clearZjuamCredential(): void {
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch (error) {
    warnStorageFailure('clear ZJUAM credential', error)
  }
}
