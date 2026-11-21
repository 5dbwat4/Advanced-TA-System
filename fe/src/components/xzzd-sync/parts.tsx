import { Input } from '@heroui/react'

import { cn } from '@/lib/utils'

export function SummaryStat({
  label,
  value,
  tone,
}: {
  label: string
  value: number
  tone?: 'brand' | 'warning'
}) {
  return (
    <div className="rounded-xl border border-line bg-sunken px-3 py-2">
      <div className="text-[10px] font-semibold text-fg-subtle">{label}</div>
      <div
        className={cn(
          'tabular mt-0.5 text-lg font-bold',
          tone === 'brand' && 'text-brand-600 dark:text-brand-300',
          tone === 'warning' && 'text-warning',
        )}
      >
        {value}
      </div>
    </div>
  )
}

export function MappingField({
  label,
  value,
  onChange,
}: {
  label: string
  value: string
  onChange: (value: string) => void
}) {
  return (
    <div>
      <label className="mb-1 block text-[10px] font-semibold text-fg-subtle">{label}</label>
      <Input
        fullWidth
        type="number"
        step={0.1}
        value={value}
        aria-label={label}
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  )
}
