import { useEffect, useState, type ReactNode } from 'react'

import Clock from '~icons/lucide/clock'
import { cn } from '@/lib/utils'

/** 每秒刷新的用时（毫秒）；startedAt 为 null 时返回 0 */
export function useElapsedMs(startedAt: number | null): number {
  const [elapsed, setElapsed] = useState(() => (startedAt == null ? 0 : Date.now() - startedAt))

  useEffect(() => {
    if (startedAt == null) {
      setElapsed(0)
      return
    }
    // startedAt 变化（选中学生 / 清零）时立即刷新一次，再交给 1s 定时器推进
    setElapsed(Date.now() - startedAt)
    const timer = window.setInterval(() => setElapsed(Date.now() - startedAt), 1000)
    return () => window.clearInterval(timer)
  }, [startedAt])

  return elapsed
}

/** 把毫秒格式化为 mm:ss（>= 1 小时用 h:mm:ss） */
export function formatElapsed(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000))
  const hours = Math.floor(total / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  const seconds = total % 60
  const pad = (value: number) => String(value).padStart(2, '0')
  return hours > 0 ? `${hours}:${pad(minutes)}:${pad(seconds)}` : `${pad(minutes)}:${pad(seconds)}`
}

/**
 * 答题计时芯片：图标 Clock + 文案「答题时间」+ 等宽数字。
 * compact 为 true 时只显示图标 + 时间（用于卡片头部等窄空间）。
 */
export function CheckoffTimer({
  startedAt,
  compact = false,
  className,
}: {
  startedAt: number | null
  compact?: boolean
  className?: string
}): ReactNode {
  const elapsed = useElapsedMs(startedAt)

  if (startedAt == null) return null

  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-line bg-elevated px-2.5 py-1 text-xs font-semibold text-fg-muted',
        className,
      )}
    >
      <Clock width={13} height={13} className="shrink-0 text-brand-600 dark:text-brand-300" />
      {!compact && <span>答题时间</span>}
      <span className="tabular text-brand-600 dark:text-brand-300">{formatElapsed(elapsed)}</span>
    </span>
  )
}
