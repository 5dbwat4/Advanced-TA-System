import { Link } from 'react-router-dom'
import type { ReactNode } from 'react'

import ArrowLeft from '~icons/lucide/arrow-left'

export function CheckoffLayout({
  children,
  actions,
  title = '验收',
}: {
  children: ReactNode
  actions?: ReactNode
  title?: string
}) {
  return (
    <div className="flex h-dvh flex-col overflow-hidden">
      <header className="flex h-14 shrink-0 items-center gap-3 border-b border-line bg-elevated/60 px-4 backdrop-blur-xl">
        <Link
          to="/console"
          className="inline-flex items-center gap-1 text-xs font-semibold text-fg-subtle transition-colors hover:text-fg"
        >
          <ArrowLeft width={14} height={14} className="shrink-0" />
          返回
        </Link>
        <div className="h-5 w-px bg-line" />
        <div className="min-w-0 flex-1 truncate text-sm font-bold">{title}</div>
        {actions && <div className="flex shrink-0 items-center gap-1">{actions}</div>}
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-4xl px-4 py-6">{children}</div>
      </div>
    </div>
  )
}
