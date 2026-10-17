import type { ReactNode } from 'react'
import { avatarSprite } from 'avatars'

import { cn } from '@/lib/utils'

/**
 * 头像显示：按内置头像 id 从精灵图（atlas）中裁切；未选择 / 未登记时回退 fallback（如首字母）。
 */
export function AvatarImage({
  id,
  size,
  className,
  fallback,
}: {
  id: number | null | undefined
  size: number
  className?: string
  fallback: ReactNode
}) {
  const sprite = avatarSprite(id)

  if (!sprite) {
    return (
      <div
        aria-hidden
        className={cn(
          'flex shrink-0 items-center justify-center rounded-full bg-amber-500/15 text-sm font-bold text-amber-600 dark:text-amber-400',
          className,
        )}
        style={{ width: size, height: size }}
      >
        {fallback}
      </div>
    )
  }

  return (
    <div
      role="img"
      aria-label={sprite.name}
      className={cn('shrink-0 rounded-full bg-no-repeat', className)}
      style={{
        width: size,
        height: size,
        backgroundImage: `url("${sprite.atlas}")`,
        backgroundSize: `${size * sprite.columns}px ${size * sprite.rows}px`,
        backgroundPosition: `-${sprite.col * size}px -${sprite.row * size}px`,
      }}
    />
  )
}
