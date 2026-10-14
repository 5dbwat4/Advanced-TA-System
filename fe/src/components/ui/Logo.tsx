import { cn } from '@/lib/utils'

/** 应用图标（芯片 + A）：直接引用 favicon 矢量图，作为站点 logo 使用。 */
export function Logo({ size = 32, className }: { size?: number; className?: string }) {
  return (
    <img
      src={`${import.meta.env.BASE_URL}favicon.svg`}
      width={size}
      height={size}
      alt=""
      aria-hidden
      draggable={false}
      className={cn('shrink-0 select-none', className)}
    />
  )
}
