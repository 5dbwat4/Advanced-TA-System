import { Button } from '@heroui/react'
import { motion } from 'motion/react'

import Check from '~icons/lucide/check'
import FlaskConical from '~icons/lucide/flask-conical'
import HelpCircle from '~icons/lucide/help-circle'
import MonitorPlay from '~icons/lucide/monitor-play'
import PenLine from '~icons/lucide/pen-line'
import UserSearch from '~icons/lucide/user-search'
import type { IconComponent } from '@/lib/icon'
import { cn } from '@/lib/utils'

const STEPS: { label: string; icon: IconComponent }[] = [
  { label: '选择实验', icon: FlaskConical },
  { label: '定位学生', icon: UserSearch },
  { label: '展示 demo', icon: MonitorPlay },
  { label: '现场抽题', icon: HelpCircle },
  { label: '录入成绩', icon: PenLine },
]

export function StepIndicator({
  step,
  onStep,
  hasExperiment,
  hasStudent,
}: {
  step: number
  onStep: (step: number) => void
  hasExperiment: boolean
  hasStudent: boolean
}) {
  const canGo = (target: number) => {
    if (target === 0) return true
    if (target === 1) return hasExperiment
    return hasExperiment && hasStudent
  }

  return (
    <div className="flex items-center gap-1 overflow-x-auto rounded-2xl border border-line bg-elevated p-1.5 sm:gap-2">
      {STEPS.map((meta, i) => {
        const active = step === i
        const done = step > i
        const allowed = canGo(i)
        return (
          <Button
            key={meta.label}
            type="button"
            variant="ghost"
            isDisabled={!allowed}
            onPress={() => onStep(i)}
            className={cn(
              'relative h-auto flex-1 justify-center gap-2 whitespace-nowrap rounded-xl px-3 py-2 text-xs font-semibold sm:text-sm',
              active
                ? 'text-white hover:bg-transparent'
                : done
                  ? 'text-brand-600 hover:bg-brand-500/10 dark:text-brand-300'
                  : allowed
                    ? 'text-fg-muted hover:bg-sunken'
                    : 'cursor-not-allowed text-fg-subtle/50',
            )}
          >
            {active && (
              <motion.span
                layoutId="checkoff-step-pill"
                className="absolute inset-0 rounded-xl bg-gradient-to-r from-brand-600 to-brand-700 shadow-md shadow-brand-600/25"
                transition={{ type: 'spring', stiffness: 450, damping: 35 }}
              />
            )}
            {done && !active ? (
              <Check width={15} height={15} className="shrink-0 relative" />
            ) : (
              <meta.icon width={15} height={15} className="shrink-0 relative" />
            )}
            <span className="relative hidden sm:inline">{meta.label}</span>
          </Button>
        )
      })}
    </div>
  )
}
