import { Button, Input, Slider } from '@heroui/react'

import Plus from '~icons/lucide/plus'
import Rows3 from '~icons/lucide/rows-3'
import { cn } from '@/lib/utils'

import { sectionScore } from './scoring'
import type {
  CriterionCard,
  CriterionCardState,
  CriterionExtras,
  CriterionItem,
  CriterionSection,
} from './types'

export function CriteriaGrading({
  items,
  states,
  extras,
  onToggle,
  onScoreChange,
  onAppendixChange,
  onAdd,
}: {
  items: CriterionItem[]
  states: Record<string, CriterionCardState>
  extras: CriterionExtras
  onToggle: (cardId: string) => void
  onScoreChange: (cardId: string, score: string) => void
  onAppendixChange: (cardId: string, appendix: string) => void
  onAdd: (sectionId: string | null) => void
}) {
  const cardProps = { states, onToggle, onScoreChange, onAppendixChange }

  return (
    <div className="flex flex-col gap-3">
      {items.map((item) =>
        item.type === 'section' ? (
          <GradingSection key={item.id} section={item} extras={extras} onAdd={onAdd} {...cardProps} />
        ) : (
          <GradingCard key={item.id} card={item} state={states[item.id]} {...cardProps} />
        ),
      )}
      {(extras.root ?? []).map((card) => (
        <GradingCard key={card.id} card={card} state={states[card.id]} {...cardProps} />
      ))}
      <Button size="sm" variant="secondary" className="self-start" onPress={() => onAdd(null)}>
        <Plus width={14} height={14} className="shrink-0" />
        添加卡片
      </Button>
    </div>
  )
}

function GradingSection({
  section,
  states,
  extras,
  onToggle,
  onScoreChange,
  onAppendixChange,
  onAdd,
}: {
  section: CriterionSection
  states: Record<string, CriterionCardState>
  extras: CriterionExtras
  onToggle: (cardId: string) => void
  onScoreChange: (cardId: string, score: string) => void
  onAppendixChange: (cardId: string, appendix: string) => void
  onAdd: (sectionId: string | null) => void
}) {
  const cards = [...section.children, ...(extras[section.id] ?? [])]

  return (
    <div className="rounded-2xl border border-line bg-sunken p-3">
      <div className="flex items-center gap-2 text-xs font-semibold">
        <Rows3 width={13} height={13} className="shrink-0 text-brand-600 dark:text-brand-300" />
        <span className="min-w-0 flex-1 truncate">{section.title || '未命名小节'}</span>
        <span className="tabular shrink-0 text-brand-600 dark:text-brand-300">
          {formatScore(sectionScore(section, states, extras))} 分
        </span>
      </div>
      <div className="mt-2 flex flex-col gap-2 border-s border-line ps-3">
        {cards.map((card) => (
          <GradingCard
            key={card.id}
            card={card}
            state={states[card.id]}
            states={states}
            onToggle={onToggle}
            onScoreChange={onScoreChange}
            onAppendixChange={onAppendixChange}
          />
        ))}
        <Button
          size="sm"
          variant="secondary"
          className="self-start"
          onPress={() => onAdd(section.id)}
        >
          <Plus width={14} height={14} className="shrink-0" />
          添加
        </Button>
      </div>
    </div>
  )
}

function GradingCard({
  card,
  state,
  onToggle,
  onScoreChange,
  onAppendixChange,
}: {
  card: CriterionCard
  state: CriterionCardState | undefined
  states: Record<string, CriterionCardState>
  onToggle: (cardId: string) => void
  onScoreChange: (cardId: string, score: string) => void
  onAppendixChange: (cardId: string, appendix: string) => void
}) {
  const selected = state?.selected ?? false
  const isRange = card.scoreMax.trim() !== ''
  const min = Number(card.score) || 0
  const max = isRange ? Number(card.scoreMax) || min : min
  const chosen =
    state && state.score.trim() !== '' && Number.isFinite(Number(state.score))
      ? clamp(Number(state.score), Math.min(min, max), Math.max(min, max))
      : min
  const display = isRange ? chosen : min

  return (
    <div
      role="button"
      tabIndex={0}
      aria-pressed={selected}
      onClick={() => onToggle(card.id)}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          onToggle(card.id)
        }
      }}
      className={cn(
        'cursor-pointer rounded-xl border border-line bg-elevated p-3 transition-all',
        selected ? 'border-brand-500/40 bg-brand-500/5' : 'opacity-45 hover:opacity-70',
      )}
    >
      <div className="flex items-start gap-2">
        <span
          className={cn(
            'tabular shrink-0 rounded px-1.5 py-0.5 text-[11px] font-semibold',
            card.mode === 'add'
              ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
              : 'bg-danger/10 text-danger',
          )}
        >
          {card.mode === 'add' ? `+${formatScore(display)}` : `−${formatScore(display)}`}
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-xs font-medium">{card.rule || '（未填写规则）'}</div>
          {card.detail.trim() !== '' && (
            <div className="mt-0.5 whitespace-pre-wrap text-[11px] text-fg-subtle">
              {card.detail}
            </div>
          )}
        </div>
      </div>

      {selected && isRange && (
        <div
          className="mt-2 flex items-center gap-2"
          onClick={(event) => event.stopPropagation()}
        >
          {max > min && (
            <Slider
              aria-label="分值"
              className="flex-1"
              minValue={min}
              maxValue={max}
              step={0.5}
              value={chosen}
              onChange={(value) => {
                if (typeof value === 'number') onScoreChange(card.id, String(value))
              }}
            >
              <Slider.Track>
                <Slider.Fill />
                <Slider.Thumb />
              </Slider.Track>
            </Slider>
          )}
          <Input
            type="number"
            min={min}
            max={max}
            step="0.5"
            className="w-20 shrink-0"
            value={state?.score ?? ''}
            onChange={(event) => onScoreChange(card.id, event.target.value)}
            aria-label="分值"
          />
        </div>
      )}

      {selected && (
        <div className="mt-2" onClick={(event) => event.stopPropagation()}>
          <Input
            className="w-full"
            placeholder="附注（可选）"
            value={state?.appendix ?? ''}
            onChange={(event) => onAppendixChange(card.id, event.target.value)}
            aria-label="附注"
          />
        </div>
      )}
    </div>
  )
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function formatScore(value: number): string {
  return Number.isInteger(value) ? String(value) : String(Math.round(value * 10) / 10)
}
