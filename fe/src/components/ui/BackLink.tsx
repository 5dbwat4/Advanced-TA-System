import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'

import ArrowLeft from '~icons/lucide/arrow-left'

export function BackLink({ to, children }: { to: string; children: ReactNode }) {
  return (
    <Link
      to={to}
      className="mb-3 inline-flex items-center gap-1 text-xs font-semibold text-fg-subtle transition-colors hover:text-fg-muted"
    >
      <ArrowLeft width={14} height={14} className="shrink-0" />
      {children}
    </Link>
  )
}
