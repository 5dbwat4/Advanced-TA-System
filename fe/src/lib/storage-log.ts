export function warnStorageFailure(scope: string, error: unknown): void {
  if (import.meta.env.DEV) console.warn(`[storage] ${scope}`, error)
}
