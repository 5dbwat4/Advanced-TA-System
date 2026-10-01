export function formatDateTime(value: string | null, fallback?: string): string {
  if (!value) return fallback ?? '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return fallback ?? '—'
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}/${pad(date.getMonth() + 1)}/${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

export function formatLocaleDateTime(value: string | null, fallback?: string): string {
  if (!value) return fallback ?? '—'
  return new Date(value).toLocaleString('zh-CN', {
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
}

export function formatBytes(value: number | undefined, fallback?: string): string {
  if (value == null) return fallback ?? '—'
  if (value < 1024) return `${value} B`
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`
  return `${(value / 1024 / 1024).toFixed(1)} MB`
}
