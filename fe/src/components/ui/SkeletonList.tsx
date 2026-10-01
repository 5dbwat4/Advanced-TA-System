import { Skeleton } from '@heroui/react'

export function SkeletonList({
  rows = 4,
  className = 'h-12 rounded-xl',
}: {
  rows?: number
  className?: string
}) {
  return (
    <div className="space-y-3">
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} className={className} />
      ))}
    </div>
  )
}
