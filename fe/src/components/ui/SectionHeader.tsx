import { Spinner } from '@heroui/react'
import type { ReactNode } from 'react'

import type { IconComponent } from '@/lib/icon'

export function SectionHeader({
  icon: Icon,
  children,
  busy,
}: {
  icon: IconComponent
  children: ReactNode
  busy?: boolean
}) {
  return (
    <div className="flex items-center gap-2">
      <Icon width={16} height={16} className="shrink-0 text-brand-600 dark:text-brand-300" />
      <span className="text-sm font-bold">{children}</span>
      {busy && <Spinner size="sm" />}
    </div>
  )
}
