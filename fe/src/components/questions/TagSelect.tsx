import { Input, Popover } from '@heroui/react'
import { useState } from 'react'

import Check from '~icons/lucide/check'
import ChevronDown from '~icons/lucide/chevron-down'
import { useTags } from '@/lib/query'
import { cn } from '@/lib/utils'

const PAGE_SIZE = 10

export function TagSelect({
  value,
  onChange,
  placeholder = '选择标签…',
}: {
  value: string[]
  onChange: (value: string[]) => void
  placeholder?: string
}) {
  const { data: tags = [] } = useTags()

  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [limit, setLimit] = useState(PAGE_SIZE)

  const selected = tags.filter((tag) => value.includes(tag.id))
  const keyword = query.trim().toLowerCase()
  const filtered = keyword
    ? tags.filter((tag) => tag.name.toLowerCase().includes(keyword))
    : tags
  const visible = filtered.slice(0, limit)
  const hasMore = filtered.length > visible.length

  const toggle = (id: string) => {
    onChange(value.includes(id) ? value.filter((item) => item !== id) : [...value, id])
  }

  return (
    <Popover
      isOpen={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (!next) {
          setQuery('')
          setLimit(PAGE_SIZE)
        }
      }}
    >
      <Popover.Trigger
        aria-label="选择标签"
        className={cn(
          'flex min-h-10 w-full cursor-pointer flex-wrap items-center gap-1.5 rounded-xl border border-line bg-sunken px-2.5 py-1.5 text-left text-sm transition-colors',
          open && 'border-brand-500',
        )}
      >
        {selected.length === 0 ? (
          <span className="text-fg-subtle">{placeholder}</span>
        ) : (
          selected.map((tag) => (
            <span
              key={tag.id}
              className="rounded-md bg-brand-500/10 px-1.5 py-0.5 text-[11px] text-brand-600 dark:text-brand-300"
            >
              {tag.name}
            </span>
          ))
        )}
        <ChevronDown width={14} height={14} className="ml-auto shrink-0 text-fg-muted" />
      </Popover.Trigger>

      <Popover.Content placement="bottom" className="w-[var(--trigger-width)] p-0">
        <Popover.Dialog className="flex flex-col gap-2 p-2">
          <Input
            fullWidth
            value={query}
            onChange={(event) => {
              setQuery(event.target.value)
              setLimit(PAGE_SIZE)
            }}
            placeholder="搜索标签…"
            aria-label="搜索标签"
            autoFocus
          />

          <div className="flex max-h-64 flex-col gap-0.5 overflow-y-auto">
            {visible.length === 0 ? (
              <p className="py-4 text-center text-xs text-fg-subtle">
                {tags.length === 0 ? '暂无标签，请先在标签管理中创建' : '没有匹配的标签'}
              </p>
            ) : (
              visible.map((tag) => {
                const active = value.includes(tag.id)
                return (
                  <button
                    key={tag.id}
                    type="button"
                    onClick={() => toggle(tag.id)}
                    className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm transition-colors hover:bg-sunken"
                  >
                    <span
                      className={cn(
                        'flex h-4 w-4 shrink-0 items-center justify-center rounded border',
                        active
                          ? 'border-brand-500 bg-brand-500 text-white'
                          : 'border-line',
                      )}
                    >
                      {active && <Check width={11} height={11} />}
                    </span>
                    <span className="truncate">{tag.name}</span>
                  </button>
                )
              })
            )}

            {hasMore && (
              <button
                type="button"
                onClick={() => setLimit((prev) => prev + PAGE_SIZE)}
                className="rounded-lg px-2 py-1.5 text-left text-xs text-brand-600 transition-colors hover:bg-sunken dark:text-brand-300"
              >
                查看更多
              </button>
            )}
          </div>
        </Popover.Dialog>
      </Popover.Content>
    </Popover>
  )
}
