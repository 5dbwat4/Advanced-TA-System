import { motion } from 'motion/react'
import type { ReactNode } from 'react'

import type { IconComponent } from '@/lib/icon'
import { cn } from '@/lib/utils'

export function Card({
  children,
  className,
  index = 0,
  hover = false,
}: {
  children: ReactNode
  className?: string
  index?: number
  hover?: boolean
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, delay: index * 0.06, ease: [0.16, 1, 0.3, 1] }}
      className={cn(
        'rounded-2xl border border-line bg-elevated p-5',
        hover && 'transition-shadow hover:shadow-lg hover:shadow-brand-500/5',
        className,
      )}
    >
      {children}
    </motion.div>
  )
}

export function EmptyState({
  icon: Ico,
  title,
  hint,
}: {
  icon: IconComponent
  title: string
  hint?: string
}) {
  return (
    <div className="rounded-2xl border border-dashed border-line p-12 text-center">
      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-sunken text-fg-subtle">
        <Ico width={20} height={20} className="shrink-0" />
      </div>
      <div className="mt-3 text-sm font-semibold text-fg">{title}</div>
      {hint && <div className="mt-1 text-xs text-fg-subtle">{hint}</div>}
    </div>
  )
}
