import { motion } from 'motion/react'

import { EmptyState } from '@/components/ui/Card'
import { Icon } from '@/components/ui/Icon'
import type { CheckoffExperiment } from '@/lib/api'

export function ExperimentPicker({
  experiments,
  onSelect,
}: {
  experiments: CheckoffExperiment[]
  onSelect: (experiment: CheckoffExperiment) => void
}) {
  if (experiments.length === 0) {
    return (
      <EmptyState
        icon="lucide:flask-conical"
        title="暂无可验收实验"
        hint="请先在实验页创建实验"
      />
    )
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {experiments.map((exp, i) => (
        <motion.button
          key={exp.id}
          type="button"
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: i * 0.06, ease: [0.16, 1, 0.3, 1] }}
          whileHover={{ y: -3 }}
          whileTap={{ scale: 0.98 }}
          onClick={() => onSelect(exp)}
          className="group relative overflow-hidden rounded-2xl border border-line bg-elevated p-5 text-left transition-shadow hover:shadow-xl hover:shadow-brand-500/5"
        >
          <div className="pointer-events-none absolute -right-10 -top-10 h-28 w-28 rounded-full bg-gradient-to-br from-brand-500/15 to-amber-500/10 opacity-0 blur-2xl transition-opacity group-hover:opacity-100" />
          <div className="relative">
            <span className="tabular rounded-lg bg-brand-500/10 px-2.5 py-1 text-xs font-bold text-brand-600 dark:text-brand-300">
              {exp.mark}
            </span>
            <h3 className="mt-3 truncate text-base font-bold leading-snug text-fg">{exp.title}</h3>
            <div className="mt-3 flex items-center gap-1.5 text-xs text-fg-muted">
              <Icon icon="lucide:help-circle" width={13} />
              <span className="tabular">{exp.questionCount} 题</span>
            </div>
          </div>
        </motion.button>
      ))}
    </div>
  )
}
