const STORAGE_KEY = 'tasaas.zjuam'

export type ZjuamCredential = {
  account: string
  password: string
}

export function getZjuamCredential(): ZjuamCredential | null {
  const raw = localStorage.getItem(STORAGE_KEY)
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as Partial<ZjuamCredential> | null
    if (!parsed || typeof parsed.account !== 'string' || typeof parsed.password !== 'string') {
      return null
    }
    return { account: parsed.account, password: parsed.password }
  } catch {
    return null
  }
}

export function setZjuamCredential(cred: ZjuamCredential): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(cred))
}

export function clearZjuamCredential(): void {
  localStorage.removeItem(STORAGE_KEY)
}
