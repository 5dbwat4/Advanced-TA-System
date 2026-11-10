import type { Tag } from '@/lib/api'
import { cn } from '@/lib/utils'

const MAX_VISIBLE_TAGS = 10

export function TagFilter({
  tags,
  value,
  onChange,
  onOpenTag,
}: {
  tags: Tag[]
  value: string | null
  onChange: (value: string | null) => void
  onOpenTag?: (id: string) => void
}) {
  if (tags.length === 0) return null

  const latest = [...tags]
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, MAX_VISIBLE_TAGS)

  if (value) {
    const selected = tags.find((tag) => tag.id === value)
    if (selected && !latest.some((tag) => tag.id === selected.id)) {
      latest.push(selected)
    }
  }

  const chip = (active: boolean) =>
    cn(
      'rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors',
      active
        ? 'border-brand-500 bg-brand-500/10 text-brand-600 dark:text-brand-300'
        : 'border-line bg-sunken text-fg-muted hover:border-brand-500/40',
    )

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <button type="button" onClick={() => onChange(null)} className={chip(value === null)}>
        全部
      </button>
      {latest.map((tag) => (
        <button
          key={tag.id}
          type="button"
          onClick={() => {
            if (value === tag.id) {
              onOpenTag?.(tag.id)
              return
            }
            onChange(tag.id)
          }}
          className={chip(value === tag.id)}
        >
          {tag.name}
        </button>
      ))}
    </div>
  )
}
