import { motion } from 'motion/react'

import { Icon } from '@/components/ui/Icon'
import { cn } from '@/lib/utils'

const TONES = {
  brand: 'bg-brand-500/10 text-brand-600 dark:text-brand-300',
  amber: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
  success: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
  purple: 'bg-purple-500/10 text-purple-600 dark:text-purple-400',
} as const

export function StatCard({
  icon,
  label,
  value,
  suffix,
  tone = 'brand',
  index = 0,
}: {
  icon: string
  label: string
  value: number
  suffix?: string
  tone?: keyof typeof TONES
  index?: number
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, delay: index * 0.08, ease: [0.16, 1, 0.3, 1] }}
      className="rounded-2xl border border-line bg-elevated p-5 transition-shadow hover:shadow-lg hover:shadow-brand-500/5"
    >
      <div className={cn('flex h-10 w-10 items-center justify-center rounded-xl', TONES[tone])}>
        <Icon icon={icon} width={19} />
      </div>
      <div className="mt-3 text-xs font-semibold uppercase tracking-wider text-fg-subtle">
        {label}
      </div>
      <div className="mt-1 flex items-baseline gap-1">
        <span className="tabular text-3xl font-bold tracking-tight">{value}</span>
        {suffix && <span className="text-sm text-fg-muted">{suffix}</span>}
      </div>
    </motion.div>
  )
}
