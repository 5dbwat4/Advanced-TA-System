import type { ReactNode } from 'react'

import Rows3 from '~icons/lucide/rows-3'
import { cn } from '@/lib/utils'

import type { CriterionCard, CriterionItem } from './types'

export function CriteriaPreview({ items }: { items: CriterionItem[] }) {
  if (items.length === 0) {
    return <p className="py-8 text-center text-xs text-fg-subtle">评分标准为空</p>
  }

  return (
    <div className="flex max-h-[50vh] flex-col gap-3 overflow-auto">
      {items.map((item) =>
        item.type === 'section' ? (
          <div key={item.id} className="rounded-xl border border-line bg-sunken p-3">
            <div className="flex flex-wrap items-center gap-2 text-xs font-semibold">
              <Rows3
                width={13}
                height={13}
                className="shrink-0 text-brand-600 dark:text-brand-300"
              />
              <span className="min-w-0 flex-1 truncate">{item.title || '未命名小节'}</span>
              {item.init.trim() !== '' && <SectionBadge>初始分 {item.init}</SectionBadge>}
              {item.cap.trim() !== '' && <SectionBadge>上限 {item.cap}</SectionBadge>}
            </div>
            <div className="mt-2 flex flex-col gap-1.5 border-s border-line ps-3">
              {item.children.map((card) => (
                <CriterionCardPreview key={card.id} card={card} />
              ))}
            </div>
          </div>
        ) : (
          <CriterionCardPreview key={item.id} card={item} />
        ),
      )}
    </div>
  )
}

function SectionBadge({ children }: { children: ReactNode }) {
  return (
    <span className="rounded bg-brand-500/10 px-1.5 py-0.5 text-[10px] font-normal text-brand-600 dark:text-brand-300">
      {children}
    </span>
  )
}

function CriterionCardPreview({ card }: { card: CriterionCard }) {
  const isAdd = card.mode === 'add'
  const value = card.score.trim() === '' ? '?' : card.score.trim()
  const range = card.scoreMax.trim() === '' ? value : `${value}~${card.scoreMax.trim()}`

  return (
    <div className="flex items-start gap-2 rounded-lg border border-line bg-elevated px-2.5 py-2">
      <span
        className={cn(
          'tabular shrink-0 rounded px-1.5 py-0.5 text-[11px] font-semibold',
          isAdd
            ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
            : 'bg-danger/10 text-danger',
        )}
      >
        {isAdd ? `+${range}` : `−${range}`}
      </span>
      <div className="min-w-0 flex-1">
        <div className="text-xs font-medium">{card.rule || '（未填写规则）'}</div>
        {card.detail.trim() !== '' && (
          <div className="mt-0.5 whitespace-pre-wrap text-[11px] text-fg-subtle">{card.detail}</div>
        )}
      </div>
      {card.defaultSelected && (
        <span className="shrink-0 rounded bg-brand-500/10 px-1.5 py-0.5 text-[10px] text-brand-600 dark:text-brand-300">
          默认
        </span>
      )}
    </div>
  )
}
