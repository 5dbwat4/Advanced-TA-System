import { iconRegistry } from './icon-registry'

import { cn } from '@/lib/utils'

export function Icon({
  icon,
  className,
  width = 18,
}: {
  icon: string
  className?: string
  width?: number
}) {
  const name = icon.slice(icon.indexOf(':') + 1)
  const Component = iconRegistry[name]
  if (!Component) return null
  return <Component width={width} height={width} className={cn('shrink-0', className)} />
}
