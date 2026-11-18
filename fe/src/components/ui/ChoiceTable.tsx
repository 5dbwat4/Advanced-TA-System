import type { ReactNode } from 'react'

import { cn } from '@/lib/utils'

export type ChoiceTableOption = {
  value: string
  label: ReactNode
  preferred?: boolean
  badge?: ReactNode
}

export function ChoiceTable({
  name,
  value,
  options,
  onChange,
  isDisabled,
  className,
}: {
  name: string
  value: string
  options: ChoiceTableOption[]
  onChange: (value: string) => void
  isDisabled?: boolean
  className?: string
}) {
  return (
    <div role="radiogroup" aria-disabled={isDisabled || undefined} className={className}>
      {options.map((option, index) => {
        const selected = option.value === value
        return (
          <label
            key={option.value}
            className={cn(
              'relative flex cursor-pointer items-center gap-3 border border-line px-4 py-3 transition-colors',
              index === 0 && 'rounded-t-2xl',
              index === options.length - 1 && 'rounded-b-2xl',
              index > 0 && '-mt-px',
              selected
                ? 'z-10 border-brand-500/60 bg-brand-500/10'
                : option.preferred
                  ? 'bg-brand-500/5'
                  : 'bg-elevated',
              !selected && !isDisabled && 'hover:bg-sunken/40',
              isDisabled && 'cursor-not-allowed opacity-60',
            )}
          >
            <input
              type="radio"
              name={name}
              value={option.value}
              checked={selected}
              disabled={isDisabled}
              onChange={() => onChange(option.value)}
              className="peer sr-only"
            />
            <span
              aria-hidden
              className={cn(
                'flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2 border-line bg-elevated transition-colors',
                'peer-focus-visible:ring-2 peer-focus-visible:ring-brand-500/40',
                selected && 'border-brand-500',
              )}
            >
              {selected && <span className="h-2 w-2 rounded-full bg-brand-500" />}
            </span>
            <span className="min-w-0 flex-1">{option.label}</span>
            {option.badge}
          </label>
        )
      })}
    </div>
  )
}
