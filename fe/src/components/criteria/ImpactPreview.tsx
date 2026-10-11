import Rows3 from '~icons/lucide/rows-3'

import { cn } from '@/lib/utils'

import type { CriteriaImpactChange, CriteriaImpactItem } from './impact'
import { cardValue } from './scoring'
import type { CriterionCard, CriterionItem } from './types'

function formatScore(value: number): string {
  return Number.isInteger(value) ? String(value) : String(Math.round(value * 10) / 10)
}

/** 只读渲染某个学生的原始完整评分，并高亮受编辑影响的卡片/小节（新增卡片追加在末尾） */
export function ImpactPreview({
  item,
  oldItems,
}: {
  item: CriteriaImpactItem
  oldItems: CriterionItem[]
}) {
  const cardChange = new Map<string, CriteriaImpactChange>()
  const sectionChange = new Map<string, CriteriaImpactChange>()
  const addedCards: CriterionCard[] = []
  for (const change of item.changes) {
    if (change.kind === 'section') sectionChange.set(change.cardId, change)
    else {
      cardChange.set(change.cardId, change)
      if (change.kind === 'added' && change.afterCard) addedCards.push(change.afterCard)
    }
  }

  const renderCard = (card: CriterionCard) => {
    const state = item.states[card.id]
    const selected = state?.selected ?? false
    const change = cardChange.get(card.id)
    const value = cardValue(card, state)
    const isAdd = card.mode === 'add'
    const appendix = state?.appendix.trim() ?? ''

    return (
      <div
        key={card.id}
        className={cn(
          'rounded-xl border bg-elevated p-2.5',
          change ? 'border-amber-500/60 ring-1 ring-amber-500/30' : 'border-line',
          !selected && 'opacity-50',
        )}
      >
        <div className="flex items-start gap-2">
          <span
            className={cn(
              'tabular shrink-0 rounded px-1.5 py-0.5 text-[11px] font-semibold',
              !selected
                ? 'bg-sunken text-fg-subtle'
                : isAdd
                  ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                  : 'bg-danger/10 text-danger',
            )}
          >
            {selected
              ? isAdd
                ? `+${formatScore(value)}`
                : `−${formatScore(Math.abs(value))}`
              : '未选'}
          </span>
          <div className="min-w-0 flex-1">
            <div className="text-xs font-medium">{card.rule || '（未填写规则）'}</div>
            {card.detail.trim() !== '' && (
              <div className="mt-0.5 whitespace-pre-wrap text-[11px] text-fg-subtle">
                {card.detail}
              </div>
            )}
            {appendix !== '' && (
              <div className="mt-1 whitespace-pre-wrap text-[11px] text-fg-muted">
                附注：{appendix}
              </div>
            )}
          </div>
        </div>
        {change && (
          <div className="mt-1.5">
            <div className="text-[11px] font-medium text-amber-600 dark:text-amber-400">
              {change.message}
            </div>
            {(change.beforeCard || change.afterCard) && (
              <div className="mt-2 flex flex-col gap-1.5">
                {change.beforeCard && <CardDefBlock label="原先评分标准" card={change.beforeCard} />}
                {change.afterCard && (
                  <CardDefBlock label="更改后评分标准" card={change.afterCard} />
                )}
              </div>
            )}
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <div className="text-sm font-semibold text-fg">
          {item.name}
          <span className="tabular ml-2 text-[11px] font-normal text-fg-subtle">
            {item.studentNo}
          </span>
        </div>
        <div className="text-xs text-fg-muted">
          {item.experimentMark} · {item.experimentTitle}
        </div>
      </div>

      <div className="flex flex-col gap-3">
        {oldItems.map((node) =>
          node.type === 'section' ? (
            <div key={node.id} className="rounded-2xl border border-line bg-sunken p-3">
              <div className="flex flex-wrap items-center gap-2 text-xs font-semibold">
                <Rows3
                  width={13}
                  height={13}
                  className="shrink-0 text-brand-600 dark:text-brand-300"
                />
                <span className="min-w-0 flex-1 truncate">{node.title || '未命名小节'}</span>
                {sectionChange.get(node.id) && (
                  <span className="text-[11px] font-medium text-amber-600 dark:text-amber-400">
                    {sectionChange.get(node.id)?.message}
                  </span>
                )}
              </div>
              <div className="mt-2 flex flex-col gap-1.5 border-s border-line ps-3">
                {node.children.map(renderCard)}
                {(item.extras[node.id] ?? []).map(renderCard)}
              </div>
            </div>
          ) : (
            renderCard(node)
          ),
        )}
        {(item.extras.root ?? []).map(renderCard)}

        {addedCards.length > 0 && (
          <div className="flex flex-col gap-1.5">{addedCards.map(renderCard)}</div>
        )}
      </div>
    </div>
  )
}

function ScoreBadge({ card }: { card: CriterionCard }) {
  const isAdd = card.mode === 'add'
  const range = card.scoreMax.trim() === '' ? card.score : `${card.score}~${card.scoreMax}`
  return (
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
  )
}

function CardDefBlock({ label, card }: { label: string; card: CriterionCard }) {
  return (
    <div className="rounded-lg border border-line bg-elevated p-2">
      <div className="text-[10px] font-semibold text-fg-subtle">{label}</div>
      <div className="mt-1 flex items-start gap-2">
        <ScoreBadge card={card} />
        <div className="min-w-0 flex-1">
          <div className="text-[11px] font-medium">{card.rule || '（未填写规则）'}</div>
          {card.detail.trim() !== '' && (
            <div className="mt-0.5 whitespace-pre-wrap text-[10px] text-fg-subtle">
              {card.detail}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
