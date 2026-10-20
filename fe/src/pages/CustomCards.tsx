import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  pointerWithin,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
  type DragStartEvent,
  type Modifier,
} from '@dnd-kit/core'
import {
  SortableContext,
  rectSortingStrategy,
  sortableKeyboardCoordinates,
  useSortable,
} from '@dnd-kit/sortable'
import { CSS, getEventCoordinates } from '@dnd-kit/utilities'
import { Button, Input, Modal, Spinner, useOverlayState } from '@heroui/react'
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'

import ArrowLeft from '~icons/lucide/arrow-left'
import Pencil from '~icons/lucide/pencil'
import Plus from '~icons/lucide/plus'
import Save from '~icons/lucide/save'
import Trash2 from '~icons/lucide/trash-2'
import { Markdown } from '@/components/ui/Markdown'
import { MarkdownEditor } from '@/components/ui/MarkdownEditor'
import { PageHeader } from '@/components/ui/PageHeader'
import { useAuth } from '@/lib/auth'
import {
  CUSTOM_CARD_COLORS,
  CUSTOM_CARD_CONTENT_MAX,
  CUSTOM_CARD_COUNT_MAX,
  CUSTOM_CARD_TEXT_MAX,
  createDefaultCustomCards,
  readSingleText,
  type CustomCard,
  type CustomCardSlot,
} from '@/lib/custom-cards'
import { getErrorMessage } from '@/lib/error'
import { cn } from '@/lib/utils'

const snapOverlayCenterToPointer: Modifier = ({
  activatorEvent,
  overlayNodeRect,
  transform,
}) => {
  if (!activatorEvent || !overlayNodeRect) return transform
  const point = getEventCoordinates(activatorEvent)
  if (!point) return transform
  return {
    ...transform,
    x: transform.x + point.x - overlayNodeRect.left - overlayNodeRect.width / 2,
    y: transform.y + point.y - overlayNodeRect.top - overlayNodeRect.height / 2,
  }
}

const collisionDetection: CollisionDetection = (args) => {
  if (!args.pointerCoordinates) return closestCenter(args)
  const collisions = pointerWithin(args)
  const slots = collisions.filter(
    (collision) =>
      collision.data?.droppableContainer.data.current?.type === 'slot',
  )
  return slots.length > 0 ? slots : collisions
}

function createId(prefix: string): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`
}

function moveItem<T>(items: T[], fromIndex: number, toIndex: number): T[] {
  if (fromIndex < 0 || toIndex < 0 || fromIndex === toIndex) return items
  const next = [...items]
  const [item] = next.splice(fromIndex, 1)
  next.splice(toIndex, 0, item)
  return next
}

function defaultColors(index: number): { backgroundColor: string; textColor: string } {
  const [backgroundColor, textColor] = CUSTOM_CARD_COLORS[index] ?? CUSTOM_CARD_COLORS[0]
  return { backgroundColor, textColor }
}

function SortableSlot({
  slot,
  index,
  card,
  onEdit,
}: {
  slot: CustomCardSlot
  index: number
  card: CustomCard | null
  onEdit: (card: CustomCard) => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging, isOver } =
    useSortable({ id: slot.id, data: { type: 'slot', slot } })

  return (
    <button
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      onClick={() => {
        if (card) onEdit(card)
      }}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        ...(card
          ? { backgroundColor: card.backgroundColor, color: card.textColor }
          : undefined),
      }}
      className={cn(
        'flex h-10 w-10 touch-none items-center justify-center rounded-full border border-black/10 text-sm font-bold shadow-sm transition-all dark:border-white/15',
        card ? 'cursor-grab active:cursor-grabbing' : 'bg-sunken text-fg-subtle',
        isDragging && 'opacity-30',
        isOver && 'ring-2 ring-brand-500/50',
        card && 'ring-2 ring-brand-500/30',
      )}
      title={card ? '编辑 Card' : '空 Slot'}
    >
      {card?.text || index + 1}
    </button>
  )
}

function DraggableCard({
  card,
  slotIndex,
  markdownStyle,
  onEdit,
}: {
  card: CustomCard
  slotIndex: number | undefined
  markdownStyle: 'github' | 'prose'
  onEdit: (card: CustomCard) => void
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: card.id,
    data: { type: 'card', card },
  })

  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      style={{ transform: CSS.Translate.toString(transform) }}
      className={cn(
        'relative flex min-h-48 touch-none cursor-grab flex-col rounded-2xl border border-line bg-elevated p-4 pt-10 shadow-sm transition-colors hover:border-brand-500/40 active:cursor-grabbing',
        isDragging && 'opacity-30',
      )}
    >
      <span
        className={cn(
          'absolute left-3 top-3 rounded-full px-2 py-0.5 text-[10px] font-semibold',
          slotIndex == null
            ? 'bg-sunken text-fg-subtle'
            : 'bg-brand-500/10 text-brand-600 dark:text-brand-300',
        )}
      >
        {slotIndex == null ? '未进入 Slot' : `已进入 Slot ${slotIndex + 1}`}
      </span>
      <button
        type="button"
        onPointerDown={(event) => event.stopPropagation()}
        onClick={() => onEdit(card)}
        className="absolute right-3 top-3 flex h-7 w-7 cursor-pointer items-center justify-center rounded-full border border-line bg-elevated text-fg-muted transition-colors hover:bg-sunken hover:text-fg"
        aria-label="编辑 Card"
        title="编辑 Card"
      >
        <Pencil width={13} height={13} className="shrink-0" />
      </button>
      <div className="max-h-80 overflow-y-auto">
        {card.content.trim() ? (
          <Markdown source={card.content} style={markdownStyle} />
        ) : (
          <p className="py-8 text-center text-xs text-fg-subtle">暂无内容</p>
        )}
      </div>
    </div>
  )
}

export default function CustomCards() {
  const { user, loading, updatePreferences } = useAuth()
  const navigate = useNavigate()
  const initial = user?.preferences?.customCards ?? createDefaultCustomCards()
  const [slots, setSlots] = useState<CustomCardSlot[]>(() =>
    initial.slots.map((slot) => ({ ...slot })),
  )
  const [cards, setCards] = useState<CustomCard[]>(() =>
    initial.cards.map((card) => ({ ...card })),
  )
  const [saving, setSaving] = useState(false)
  const [activeDrag, setActiveDrag] = useState<
    { type: 'slot'; slot: CustomCardSlot } | { type: 'card'; card: CustomCard } | null
  >(null)
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )
  const { setNodeRef: setSlotAreaRef } = useDroppable({
    id: 'slot-area',
    data: { type: 'slot-area' },
  })

  const cardModal = useOverlayState()
  const [editingCardId, setEditingCardId] = useState<string | null>(null)
  const [cardDraft, setCardDraft] = useState('')
  const [slotTextDraft, setSlotTextDraft] = useState('')
  const [slotBackgroundDraft, setSlotBackgroundDraft] = useState('#dbeafe')
  const [slotTextColorDraft, setSlotTextColorDraft] = useState('#1e3a8a')

  const saved = user?.preferences?.customCards ?? createDefaultCustomCards()
  const dirty = useMemo(
    () => JSON.stringify({ slots, cards }) !== JSON.stringify({ slots: saved.slots, cards: saved.cards }),
    [cards, saved.cards, saved.slots, slots],
  )
  const markdownStyle = user?.preferences?.markdownStyle ?? 'github'
  const cardById = useMemo(() => new Map(cards.map((card) => [card.id, card])), [cards])
  const slotIndexByCard = useMemo(() => {
    const map = new Map<string, number>()
    slots.forEach((slot, index) => {
      if (slot.cardId) map.set(slot.cardId, index)
    })
    return map
  }, [slots])

  const openAddCard = () => {
    if (cards.length >= CUSTOM_CARD_COUNT_MAX) {
      toast.error(`最多配置 ${CUSTOM_CARD_COUNT_MAX} 张 Card`)
      return
    }
    const colors = defaultColors(cards.length)
    setEditingCardId(null)
    setCardDraft('')
    setSlotTextDraft('')
    setSlotBackgroundDraft(colors.backgroundColor)
    setSlotTextColorDraft(colors.textColor)
    cardModal.open()
  }

  const openEditCard = (card: CustomCard) => {
    setEditingCardId(card.id)
    setCardDraft(card.content)
    setSlotTextDraft(card.text)
    setSlotBackgroundDraft(card.backgroundColor)
    setSlotTextColorDraft(card.textColor)
    cardModal.open()
  }

  const saveCard = () => {
    if (!cardDraft.trim()) {
      toast.error('请先填写 Card 内容')
      return
    }
    const next = {
      content: cardDraft.slice(0, CUSTOM_CARD_CONTENT_MAX),
      text: readSingleText(slotTextDraft),
      backgroundColor: slotBackgroundDraft,
      textColor: slotTextColorDraft,
    }
    if (editingCardId) {
      setCards((prev) =>
        prev.map((card) => (card.id === editingCardId ? { ...card, ...next } : card)),
      )
    } else {
      setCards((prev) => [...prev, { id: createId('card'), ...next }])
    }
    cardModal.close()
  }

  const deleteCard = () => {
    if (!editingCardId) return
    setCards((prev) => prev.filter((card) => card.id !== editingCardId))
    setSlots((prev) =>
      prev.map((slot) =>
        slot.cardId === editingCardId ? { ...slot, cardId: null } : slot,
      ),
    )
    cardModal.close()
    toast.success('Card 已删除')
  }

  const assignCardToSlot = (cardId: string, slotId: string) => {
    setSlots((prev) =>
      prev.map((slot) => {
        if (slot.id === slotId) return { ...slot, cardId }
        if (slot.cardId === cardId) return { ...slot, cardId: null }
        return slot
      }),
    )
  }

  const handleDragStart = (event: DragStartEvent) => {
    const data = event.active.data.current as
      | { type?: string; slot?: CustomCardSlot; card?: CustomCard }
      | undefined
    if (data?.type === 'slot' && data.slot) setActiveDrag({ type: 'slot', slot: data.slot })
    if (data?.type === 'card' && data.card) setActiveDrag({ type: 'card', card: data.card })
  }

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    setActiveDrag(null)
    const activeData = active.data.current as
      | { type?: string; slot?: CustomCardSlot; card?: CustomCard }
      | undefined
    const overData = over?.data.current as
      | { type?: string; slot?: CustomCardSlot }
      | undefined

    if (activeData?.type === 'slot') {
      const dragged = slots.find((slot) => slot.id === active.id)
      if (overData?.type === 'slot') {
        const from = slots.findIndex((item) => item.id === active.id)
        const to = slots.findIndex((item) => item.id === over?.id)
        setSlots((prev) => moveItem(prev, from, to))
        return
      }
      if (overData?.type === 'slot-area') return
      if (dragged?.cardId) {
        setSlots((prev) =>
          prev.map((slot) =>
            slot.id === dragged.id ? { ...slot, cardId: null } : slot,
          ),
        )
      }
      return
    }

    if (!over) return
    if (
      activeData?.type === 'card' &&
      activeData.card &&
      overData?.type === 'slot' &&
      overData.slot
    ) {
      assignCardToSlot(activeData.card.id, overData.slot.id)
    }
  }

  const save = async () => {
    if (!user) return
    setSaving(true)
    try {
      await updatePreferences({
        device: user.preferences?.device ?? 'single',
        draw: user.preferences?.draw ?? 'random',
        markdownEditor: user.preferences?.markdownEditor ?? 'uiw',
        markdownStyle: user.preferences?.markdownStyle ?? 'github',
        drawCount: user.preferences?.drawCount ?? 3,
        customCards: { slots, cards },
      })
      toast.success('自定义 Card 已保存')
    } catch (error) {
      toast.error(getErrorMessage(error, '保存失败'))
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Spinner />
      </div>
    )
  }

  if (!user) return null

  const activeSlotCard =
    activeDrag?.type === 'card'
      ? activeDrag.card
      : activeDrag?.type === 'slot' && activeDrag.slot.cardId
        ? (cardById.get(activeDrag.slot.cardId) ?? null)
        : null
  const activeSlotIndex =
    activeDrag?.type === 'slot'
      ? slots.findIndex((slot) => slot.id === activeDrag.slot.id)
      : -1

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title="自定义 Card"
        subtitle="配置会跟随偏好保存到后端。"
        actions={
          <>
            <Button variant="secondary" onPress={() => navigate('/console/checkoff')}>
              <ArrowLeft width={15} height={15} className="shrink-0" />
              返回验收
            </Button>
            <Button variant="primary" isPending={saving} isDisabled={!dirty} onPress={save}>
              <Save width={15} height={15} className="shrink-0" />
              保存
            </Button>
          </>
        }
      />

      <DndContext
        sensors={sensors}
        collisionDetection={collisionDetection}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        onDragCancel={() => setActiveDrag(null)}
      >
        <section className="mb-5 rounded-2xl border border-line bg-elevated p-4">
          <SortableContext
            items={slots.map((slot) => slot.id)}
            strategy={rectSortingStrategy}
          >
            <div ref={setSlotAreaRef} className="flex flex-wrap items-center gap-2">
              {slots.map((slot, index) => (
                <SortableSlot
                  key={slot.id}
                  slot={slot}
                  index={index}
                  card={slot.cardId ? (cardById.get(slot.cardId) ?? null) : null}
                  onEdit={openEditCard}
                />
              ))}
              <Button
                className="ml-auto"
                size="sm"
                variant="primary"
                onPress={openAddCard}
              >
                <Plus width={14} height={14} className="shrink-0" />
                添加
              </Button>
            </div>
          </SortableContext>
        </section>

        <section>
          {cards.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-line py-16 text-center text-sm text-fg-subtle">
              还没有 Card，点击上方「添加」创建
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {cards.map((card) => (
                <DraggableCard
                  key={card.id}
                  card={card}
                  slotIndex={slotIndexByCard.get(card.id)}
                  markdownStyle={markdownStyle}
                  onEdit={openEditCard}
                />
              ))}
            </div>
          )}
        </section>

        <DragOverlay modifiers={[snapOverlayCenterToPointer]}>
          {activeDrag ? (
            <div
              style={
                activeSlotCard
                  ? {
                      backgroundColor: activeSlotCard.backgroundColor,
                      color: activeSlotCard.textColor,
                    }
                  : undefined
              }
              className={cn(
                'flex h-10 w-10 items-center justify-center rounded-full border border-black/10 text-sm font-bold shadow-xl dark:border-white/15',
                !activeSlotCard && 'bg-sunken text-fg-subtle',
              )}
            >
              {activeSlotCard?.text ||
                (activeDrag.type === 'slot' ? activeSlotIndex + 1 : '·')}
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>

      <Modal state={cardModal}>
        <Modal.Backdrop>
          <Modal.Container>
            <Modal.Dialog className="sm:max-w-2xl">
              <Modal.CloseTrigger />
              <Modal.Header>
                <Modal.Heading>{editingCardId ? '编辑 Card' : '添加 Card'}</Modal.Heading>
              </Modal.Header>
              <Modal.Body className="flex flex-col gap-3">
                <div className="grid grid-cols-3 gap-3">
                  <label className="flex flex-col gap-1.5 text-xs font-medium text-fg-muted">
                    Slot 文本
                    <Input
                      fullWidth
                      maxLength={CUSTOM_CARD_TEXT_MAX}
                      value={slotTextDraft}
                      placeholder="A"
                      onChange={(event) =>
                        setSlotTextDraft(readSingleText(event.target.value))
                      }
                    />
                  </label>
                  <label className="flex items-center gap-2 rounded-xl border border-line px-3 py-2 text-xs text-fg-muted">
                    <span className="flex-1">背景色</span>
                    <input
                      type="color"
                      value={slotBackgroundDraft}
                      onChange={(event) => setSlotBackgroundDraft(event.target.value)}
                      className="h-7 w-9 cursor-pointer rounded border border-line bg-transparent p-0.5"
                    />
                  </label>
                  <label className="flex items-center gap-2 rounded-xl border border-line px-3 py-2 text-xs text-fg-muted">
                    <span className="flex-1">文字色</span>
                    <input
                      type="color"
                      value={slotTextColorDraft}
                      onChange={(event) => setSlotTextColorDraft(event.target.value)}
                      className="h-7 w-9 cursor-pointer rounded border border-line bg-transparent p-0.5"
                    />
                  </label>
                </div>
                <MarkdownEditor
                  value={cardDraft}
                  height={320}
                  onChange={(value) => setCardDraft(value.slice(0, CUSTOM_CARD_CONTENT_MAX))}
                />
              </Modal.Body>
              <Modal.Footer>
                {editingCardId && (
                  <Button variant="ghost" onPress={deleteCard}>
                    <Trash2 width={14} height={14} className="shrink-0" />
                    删除
                  </Button>
                )}
                <Button slot="close" variant="secondary">
                  取消
                </Button>
                <Button variant="primary" onPress={saveCard}>
                  保存
                </Button>
              </Modal.Footer>
            </Modal.Dialog>
          </Modal.Container>
        </Modal.Backdrop>
      </Modal>
    </div>
  )
}
