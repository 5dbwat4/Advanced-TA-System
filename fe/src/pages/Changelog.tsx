import { useState } from 'react'

import ChevronDown from '~icons/lucide/chevron-down'
import { BackLink } from '@/components/ui/BackLink'
import { Card } from '@/components/ui/Card'
import { PageHeader } from '@/components/ui/PageHeader'
import { cn } from '@/lib/utils'

export default function Changelog() {
  const [expanded, setExpanded] = useState<string[]>([])

  const toggle = (hash: string) => {
    setExpanded((current) =>
      current.includes(hash) ? current.filter((item) => item !== hash) : [...current, hash],
    )
  }

  return (
    <div className="mx-auto max-w-4xl">
      <BackLink to="/console/settings">返回设置</BackLink>
      <PageHeader title="Changelog" />
      <Card index={0} className="flex flex-col gap-2">
        {__BUILD_CHANGELOG__.length === 0 ? (
          <div className="rounded-xl border border-dashed border-line py-10 text-center text-xs text-fg-subtle">
            无法读取提交记录
          </div>
        ) : (
          __BUILD_CHANGELOG__.map((entry) => {
            const open = expanded.includes(entry.hash)
            const hasBody = entry.body.length > 0
            return (
              <button
                key={entry.hash}
                type="button"
                onClick={hasBody ? () => toggle(entry.hash) : undefined}
                className={cn(
                  'flex w-full flex-col gap-2 rounded-xl border border-line bg-sunken px-3 py-2.5 text-left',
                  hasBody && 'transition-colors hover:border-brand-500/40',
                )}
              >
                <span className="flex w-full items-center gap-3">
                  <span className="tabular shrink-0 rounded-lg bg-elevated px-2 py-0.5 text-[11px] font-semibold text-fg-muted">
                    {entry.hash}
                  </span>
                  <span className="tabular shrink-0 text-[11px] text-fg-subtle">{entry.date}</span>
                  <span className="min-w-0 flex-1 truncate text-xs text-fg-muted">
                    {entry.subject}
                  </span>
                  {hasBody && (
                    <ChevronDown
                      width={14}
                      height={14}
                      className={cn(
                        'shrink-0 text-fg-subtle transition-transform',
                        open && 'rotate-180',
                      )}
                    />
                  )}
                </span>
                {open && (
                  <span className="w-full whitespace-pre-wrap border-t border-line pt-2 font-mono text-xs leading-relaxed text-fg-muted">
                    {entry.body}
                  </span>
                )}
              </button>
            )
          })
        )}
      </Card>
    </div>
  )
}
