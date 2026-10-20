import { Tooltip } from '@heroui/react'

import ChevronUp from '~icons/lucide/chevron-up'
import LayoutGrid from '~icons/lucide/layout-grid'
import X from '~icons/lucide/x'
import { Markdown } from '@/components/ui/Markdown'
import type { MarkdownStyleId } from '@/lib/api'
import type { CustomCard, CustomCardSlot, CustomCards } from '@/lib/custom-cards'
import { cn } from '@/lib/utils'

function RailSlot({
  slot,
  card,
  active,
  markdownStyle,
  onShow,
  onCancel,
}: {
  slot: CustomCardSlot
  card: CustomCard
  active: boolean
  markdownStyle: MarkdownStyleId
  onShow: (slotId: string, card: CustomCard) => void
  onCancel: () => void
}) {
  return (
    <Tooltip delay={0}>
      <Tooltip.Trigger className="inline-flex">
        <button
          type="button"
          onClick={() => {
            if (active) onCancel()
            else onShow(slot.id, card)
          }}
          style={{ backgroundColor: card.backgroundColor, color: card.textColor }}
          className={cn(
            'flex h-10 w-10 cursor-pointer items-center justify-center rounded-full border border-black/10 text-sm font-bold shadow-sm transition-transform hover:scale-105 dark:border-white/15',
            active && 'ring-2 ring-brand-500 ring-offset-2 ring-offset-elevated',
          )}
          aria-label={active ? '取消自定义 Card' : '切换到自定义 Card'}
        >
          {active ? <X width={16} height={16} className="shrink-0" /> : card.text || '·'}
        </button>
      </Tooltip.Trigger>
      <Tooltip.Content placement="left" showArrow className="w-80 max-w-[80vw] p-3">
        <div className="max-h-64 overflow-y-auto text-left">
          {active ? (
            <p className="text-xs text-fg-muted">点击取消 Card</p>
          ) : card.content.trim() ? (
            <Markdown source={card.content} style={markdownStyle} />
          ) : (
            <p className="text-xs text-fg-subtle">暂无内容</p>
          )}
        </div>
      </Tooltip.Content>
    </Tooltip>
  )
}

export function CustomCardRail({
  customCards,
  open,
  activeSlotId,
  markdownStyle,
  onToggle,
  onShow,
  onCancel,
}: {
  customCards: CustomCards
  open: boolean
  activeSlotId: string | null
  markdownStyle: MarkdownStyleId
  onToggle: () => void
  onShow: (slotId: string, card: CustomCard) => void
  onCancel: () => void
}) {
  const cardById = new Map(customCards.cards.map((card) => [card.id, card]))
  const entries = customCards.slots.flatMap((slot) => {
    const card = slot.cardId ? cardById.get(slot.cardId) : null
    return card ? [{ slot, card }] : []
  })

  if (entries.length === 0) return null
  if (entries.length === 1) {
    const [{ slot, card }] = entries
    return (
      <div className="flex flex-col items-center rounded-full border border-line bg-elevated/85 p-1.5 shadow-xl backdrop-blur-xl">
        <RailSlot
          slot={slot}
          card={card}
          active={slot.id === activeSlotId}
          markdownStyle={markdownStyle}
          onShow={onShow}
          onCancel={onCancel}
        />
      </div>
    )
  }

  return (
    <div className="flex flex-col items-center gap-1.5 rounded-full border border-line bg-elevated/85 p-1.5 shadow-xl backdrop-blur-xl">
      <button
        type="button"
        onClick={onToggle}
        className={cn(
          'flex h-10 w-10 cursor-pointer items-center justify-center rounded-full border transition-colors',
          open
            ? 'border-brand-500/25 bg-brand-500/10 text-brand-600 dark:text-brand-300'
            : 'border-brand-600 bg-brand-600 text-white shadow-md shadow-brand-600/25',
        )}
        aria-label={open ? '收起自定义 Card' : '展开自定义 Card'}
        title={open ? '收起自定义 Card' : '展开自定义 Card'}
      >
        {open ? (
          <ChevronUp width={17} height={17} className="shrink-0" />
        ) : (
          <LayoutGrid width={16} height={16} className="shrink-0" />
        )}
      </button>

      {open && (
        <div className="flex flex-col items-center gap-1.5">
          {entries.map(({ slot, card }) => (
            <RailSlot
              key={slot.id}
              slot={slot}
              card={card}
              active={slot.id === activeSlotId}
              markdownStyle={markdownStyle}
              onShow={onShow}
              onCancel={onCancel}
            />
          ))}
        </div>
      )}
    </div>
  )
}
