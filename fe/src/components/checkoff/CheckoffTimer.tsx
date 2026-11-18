import { useEffect, useState } from 'react'

import Clock from '~icons/lucide/clock'
import { cn } from '@/lib/utils'

/**
 * 答题计时：把「开始时间戳」换算成已经过的毫秒数，每秒刷新一次。
 * `startedAt` 为 null 时返回 0 并停止计时（订阅会随 startedAt 变化重建）。
 */
export function useElapsedMs(startedAt: number | null | undefined): number {
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    if (startedAt == null) return
    setNow(Date.now())
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [startedAt])

  if (startedAt == null) return 0
  const elapsed = now - startedAt
  return elapsed > 0 ? elapsed : 0
}

/** 用时文案：`mm:ss`，满 1 小时改用 `h:mm:ss`（分钟仍两位补零） */
export function formatElapsed(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000))
  const hours = Math.floor(total / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  const seconds = total % 60
  const pad = (n: number) => String(n).padStart(2, '0')
  if (hours > 0) return `${hours}:${pad(minutes)}:${pad(seconds)}`
  return `${pad(minutes)}:${pad(seconds)}`
}

/**
 * 答题计时芯片：显示从选中学生开始到现在的用时。
 * `compact` 用于评分页学生信息条（更小、更淡）；`startedAt` 为空时不渲染。
 */
export function CheckoffTimer({
  startedAt,
  compact = false,
  className,
}: {
  /** 开始答题的时间戳（毫秒）；null 表示未在验收中 */
  startedAt: number | null
  /** 紧凑模式：更小的字号与内边距，用于学生信息条等窄处 */
  compact?: boolean
  className?: string
}) {
  const elapsed = useElapsedMs(startedAt)
  if (startedAt == null) return null

  return (
    <span
      aria-label={`答题用时 ${formatElapsed(elapsed)}`}
      className={cn(
        'tabular inline-flex shrink-0 items-center gap-1 rounded-md bg-sunken font-semibold text-fg-muted',
        compact ? 'px-1.5 py-0.5 text-[11px]' : 'px-2 py-1 text-xs',
        className,
      )}
    >
      <Clock width={compact ? 11 : 13} height={compact ? 11 : 13} className="shrink-0" />
      {formatElapsed(elapsed)}
    </span>
  )
}
