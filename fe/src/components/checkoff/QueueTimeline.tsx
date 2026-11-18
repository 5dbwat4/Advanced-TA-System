import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
  type Modifier,
} from '@dnd-kit/core'
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { useEffect, useState } from 'react'
import type { KeyboardEvent, MouseEvent } from 'react'

import GripVertical from '~icons/lucide/grip-vertical'
import { cn } from '@/lib/utils'

const restrictToVerticalAxis: Modifier = ({ transform }) => ({ ...transform, x: 0 })

export type QueueTimelineEntry = {
  userId: string
  name: string
  experimentMark: string
  experimentTitle: string
  status: 'waiting' | 'called'
  calledByName?: string | null
  calledAt?: string | null
  joinedAt: string
}

function formatElapsed(from: string | null | undefined, now: number): string {
  if (!from) return ''
  const start = Date.parse(from)
  if (Number.isNaN(start)) return ''
  const minutes = Math.floor(Math.max(0, now - start) / 60000)
  if (minutes < 1) return '不到 1 分钟'
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  if (hours > 0) return rest > 0 ? `${hours} 小时 ${rest} 分钟` : `${hours} 小时`
  return `${minutes} 分钟`
}

function CardBody({
  entry,
  now,
  current,
}: {
  entry: QueueTimelineEntry
  now: number
  current?: boolean
}) {
  return (
    <>
      <div className="truncate text-sm font-semibold">{entry.name}</div>
      <div className="mt-0.5 truncate text-xs text-fg-muted">
        期望验收 {entry.experimentMark}
        {entry.experimentTitle ? ` · ${entry.experimentTitle}` : ''}
      </div>
      {current ? (
        <div className="mt-1 text-[11px] font-medium text-brand-600 dark:text-brand-300">
          正在验收
          {entry.calledAt ? `，已经过 ${formatElapsed(entry.calledAt, now)}` : ''}
        </div>
      ) : entry.status === 'called' ? (
        <>
          <div className="mt-1 text-[11px] font-medium text-brand-600 dark:text-brand-300">
            {entry.calledByName
              ? `由 ${entry.calledByName} 叫号，请做好准备`
              : '已叫号，请做好准备'}
          </div>
          {entry.calledAt && (
            <div className="mt-1 text-[11px] text-fg-subtle">
              已等待 {formatElapsed(entry.calledAt, now)}
            </div>
          )}
        </>
      ) : null}
    </>
  )
}

function SortableQueueItem({
  entry,
  displayIndex,
  queueIndex,
  now,
  selected,
  interactive,
  canDrag,
  onToggle,
}: {
  entry: QueueTimelineEntry
  displayIndex: number
  queueIndex: number
  now: number
  selected: boolean
  interactive: boolean
  canDrag: boolean
  onToggle?: (userId: string, index: number, shiftKey: boolean) => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: entry.userId,
    disabled: !canDrag,
  })

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn('relative', isDragging && 'z-20 opacity-80')}
    >
      <div
        role={interactive ? 'button' : undefined}
        tabIndex={interactive ? 0 : undefined}
        aria-pressed={interactive ? selected : undefined}
        onClick={
          interactive
            ? (event: MouseEvent<HTMLDivElement>) =>
                onToggle?.(entry.userId, queueIndex, event.shiftKey)
            : undefined
        }
        onKeyDown={
          interactive
            ? (event: KeyboardEvent<HTMLDivElement>) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault()
                  onToggle?.(entry.userId, queueIndex, event.shiftKey)
                }
              }
            : undefined
        }
        className={cn(
          'relative rounded-2xl border border-line bg-elevated px-3.5 py-3 transition-colors outline-none',
          canDrag && 'pr-10',
          selected && 'border-brand-500/70 bg-brand-500/10 ring-2 ring-brand-500/20',
          interactive &&
            'cursor-pointer hover:border-brand-500/40 hover:bg-sunken/30 focus-visible:ring-2 focus-visible:ring-brand-500/40',
        )}
      >
        <span className="absolute -left-7 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-full border border-line bg-elevated text-[11px] font-bold text-fg-muted">
          {displayIndex + 1}
        </span>
        <CardBody entry={entry} now={now} />
        {canDrag && (
          <button
            type="button"
            aria-label="拖动排序"
            {...attributes}
            {...listeners}
            onClick={(event) => event.stopPropagation()}
            className="absolute right-2 top-1/2 flex h-7 w-7 -translate-y-1/2 cursor-grab touch-none items-center justify-center rounded-lg text-fg-subtle transition-colors hover:bg-sunken hover:text-fg active:cursor-grabbing"
          >
            <GripVertical width={16} height={16} className="shrink-0" />
          </button>
        )}
      </div>
    </div>
  )
}

export function QueueTimeline({
  entries,
  className,
  selectedIds,
  onToggle,
  canDrag,
  onReorder,
}: {
  entries: QueueTimelineEntry[]
  className?: string
  selectedIds?: Set<string>
  onToggle?: (userId: string, index: number, shiftKey: boolean) => void
  canDrag?: (entry: QueueTimelineEntry) => boolean
  onReorder?: (
    activeId: string,
    overId: string,
    fromIndex: number,
    toIndex: number,
  ) => void
}) {
  const [now, setNow] = useState(() => Date.now())
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
  )

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30000)
    return () => window.clearInterval(timer)
  }, [])

  if (entries.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-line px-4 py-8 text-center text-xs text-fg-subtle">
        队列暂无同学
      </div>
    )
  }

  const current = entries.find((entry) => entry.status === 'called') ?? null
  const waiting = entries.filter((entry) => entry !== current)
  const interactive = Boolean(onToggle)
  const currentIndex = current ? entries.indexOf(current) : -1
  const currentSelected = current ? selectedIds?.has(current.userId) ?? false : false

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id || !onReorder) return
    const fromIndex = waiting.findIndex((entry) => entry.userId === String(active.id))
    const toIndex = waiting.findIndex((entry) => entry.userId === String(over.id))
    if (fromIndex < 0 || toIndex < 0) return
    onReorder(String(active.id), String(over.id), fromIndex, toIndex)
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      modifiers={[restrictToVerticalAxis]}
      onDragEnd={handleDragEnd}
    >
      <div className={cn('max-h-[26rem] overflow-y-auto pe-1', className)}>
        <div className="relative flex flex-col gap-3 pl-10">
          <div className="pointer-events-none absolute bottom-0 left-2 top-0 w-px bg-line" />

          {current && (
            <div
              role={interactive ? 'button' : undefined}
              tabIndex={interactive ? 0 : undefined}
              aria-pressed={interactive ? currentSelected : undefined}
              onClick={
                interactive
                  ? (event: MouseEvent<HTMLDivElement>) =>
                      onToggle?.(current.userId, currentIndex, event.shiftKey)
                  : undefined
              }
              onKeyDown={
                interactive
                  ? (event: KeyboardEvent<HTMLDivElement>) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault()
                        onToggle?.(current.userId, currentIndex, event.shiftKey)
                      }
                    }
                  : undefined
              }
              className={cn(
                'relative rounded-2xl border border-brand-500/40 bg-brand-500/10 px-3.5 py-3 transition-colors outline-none',
                currentSelected && 'ring-2 ring-brand-500/30',
                interactive &&
                  'cursor-pointer hover:bg-brand-500/15 focus-visible:ring-2 focus-visible:ring-brand-500/40',
              )}
            >
              <CardBody entry={current} now={now} current />
            </div>
          )}

          <SortableContext
            items={waiting.map((entry) => entry.userId)}
            strategy={verticalListSortingStrategy}
          >
            {waiting.map((entry, index) => (
              <SortableQueueItem
                key={entry.userId}
                entry={entry}
                displayIndex={index}
                queueIndex={entries.indexOf(entry)}
                now={now}
                selected={selectedIds?.has(entry.userId) ?? false}
                interactive={interactive}
                canDrag={canDrag?.(entry) ?? false}
                onToggle={onToggle}
              />
            ))}
          </SortableContext>
        </div>
      </div>
    </DndContext>
  )
}
