import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
  type Modifier,
} from '@dnd-kit/core'
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { useCallback, useEffect, useRef, useState } from 'react'
import type { KeyboardEvent, MouseEvent } from 'react'

import Bell from '~icons/lucide/bell'
import GripVertical from '~icons/lucide/grip-vertical'
import { IconAction } from '@/components/ui/IconAction'
import { cn } from '@/lib/utils'

const restrictToVerticalAxis: Modifier = ({ transform }) => ({ ...transform, x: 0 })

const AUTO_SCROLL_DELAY = 10000
const PROGRAMMATIC_SCROLL_GUARD = 1200

function findScrollParent(start: HTMLElement | null): HTMLElement | null {
  let node = start?.parentElement ?? null
  while (node) {
    const style = window.getComputedStyle(node)
    if (/(auto|scroll)/.test(style.overflowY) && node.scrollHeight > node.clientHeight + 1) {
      return node
    }
    node = node.parentElement
  }
  return null
}

export type QueueTimelineEntry = {
  userId: string
  name: string
  experimentMark: string
  experimentTitle: string
  status: 'waiting' | 'notified' | 'called' | 'finished'
  joinedAt: string
  notifiedAt: string | null
  notifiedBy: string | null
  startedAt: string | null
  checkedBy: string | null
  finishedAt: string | null
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

function finishedTime(entry: QueueTimelineEntry): number {
  if (!entry.finishedAt) return Number.POSITIVE_INFINITY
  const time = Date.parse(entry.finishedAt)
  return Number.isNaN(time) ? Number.POSITIVE_INFINITY : time
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
  const experimentText = [entry.experimentMark, entry.experimentTitle]
    .filter(Boolean)
    .join(' · ')
  return (
    <>
      <div className="truncate text-sm font-semibold">{entry.name}</div>
      {experimentText ? (
        <div className="mt-0.5 truncate text-xs text-fg-muted">
          将验收 {experimentText}
        </div>
      ) : null}
      {current ? (
        <div className="mt-1 text-[11px] font-medium text-brand-600 dark:text-brand-300">
          正在验收
          {entry.startedAt ? `，已经过 ${formatElapsed(entry.startedAt, now)}` : ''}
        </div>
      ) : entry.status === 'notified' ? (
        <>
          <div className="mt-1 text-[11px] font-medium text-warning">
            {entry.notifiedBy
              ? `由 ${entry.notifiedBy} 预叫，请做好准备`
              : '已预叫，请做好准备'}
          </div>
          {entry.notifiedAt && (
            <div className="mt-1 text-[11px] text-fg-subtle">
              已预叫 {formatElapsed(entry.notifiedAt, now)}
            </div>
          )}
        </>
      ) : entry.status === 'called' ? (
        <>
          <div className="mt-1 text-[11px] font-medium text-brand-600 dark:text-brand-300">
            {entry.checkedBy
              ? `由 ${entry.checkedBy} 开始验收`
              : '已开始验收'}
          </div>
          {entry.startedAt && (
            <div className="mt-1 text-[11px] text-fg-subtle">
              已进行 {formatElapsed(entry.startedAt, now)}
            </div>
          )}
        </>
      ) : entry.status === 'finished' ? (
        <div className="mt-1 text-[11px] font-medium text-success">已完成验收</div>
      ) : null}
    </>
  )
}

function FinishedQueueItem({
  entry,
  queueIndex,
  now,
  selected,
  interactive,
  onToggle,
}: {
  entry: QueueTimelineEntry
  queueIndex: number
  now: number
  selected: boolean
  interactive: boolean
  onToggle?: (userId: string, index: number, shiftKey: boolean) => void
}) {
  return (
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
        selected && 'border-brand-500/70 bg-brand-500/10 ring-2 ring-brand-500/20',
        interactive &&
          'cursor-pointer hover:border-brand-500/40 hover:bg-sunken/30 focus-visible:ring-2 focus-visible:ring-brand-500/40',
      )}
    >
      <CardBody entry={entry} now={now} />
    </div>
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
  onPrecall,
  onDoubleClick,
}: {
  entry: QueueTimelineEntry
  displayIndex: number
  queueIndex: number
  now: number
  selected: boolean
  interactive: boolean
  canDrag: boolean
  onToggle?: (userId: string, index: number, shiftKey: boolean) => void
  onPrecall?: (userId: string) => void
  onDoubleClick?: (userId: string) => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: entry.userId,
    disabled: !canDrag,
  })
  const showPrecall = Boolean(onPrecall && entry.status === 'waiting')
  const showActions = canDrag || showPrecall

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
        onDoubleClick={onDoubleClick ? () => onDoubleClick(entry.userId) : undefined}
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
          showActions && (canDrag && showPrecall ? 'pr-20' : 'pr-12'),
          selected && 'border-brand-500/70 bg-brand-500/10 ring-2 ring-brand-500/20',
          onDoubleClick && 'cursor-pointer',
          interactive &&
            'cursor-pointer hover:border-brand-500/40 hover:bg-sunken/30 focus-visible:ring-2 focus-visible:ring-brand-500/40',
        )}
      >
        <span className="absolute -left-7 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-full border border-line bg-elevated text-[11px] font-bold text-fg-muted">
          {displayIndex + 1}
        </span>
        <CardBody entry={entry} now={now} />
        {showActions && (
          <div className="absolute right-2 top-1/2 flex -translate-y-1/2 items-center gap-0.5">
            {showPrecall && (
              <span
                onClick={(event) => event.stopPropagation()}
                onDoubleClick={(event) => event.stopPropagation()}
              >
                <IconAction
                  label="进行预叫号"
                  tooltip="进行预叫号"
                  placement="left"
                  onPress={() => onPrecall?.(entry.userId)}
                >
                  <Bell width={15} height={15} className="shrink-0" />
                </IconAction>
              </span>
            )}
            {canDrag && (
              <button
                type="button"
                aria-label="拖动排序"
                {...attributes}
                {...listeners}
                onClick={(event) => event.stopPropagation()}
                onDoubleClick={(event) => event.stopPropagation()}
                className="flex h-7 w-7 cursor-grab touch-none items-center justify-center rounded-lg text-fg-subtle transition-colors hover:bg-sunken hover:text-fg active:cursor-grabbing"
              >
                <GripVertical width={16} height={16} className="shrink-0" />
              </button>
            )}
          </div>
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
  onPrecall,
  onDoubleClick,
  canDrag,
  canReorder,
  onReorder,
}: {
  entries: QueueTimelineEntry[]
  className?: string
  selectedIds?: Set<string>
  onToggle?: (userId: string, index: number, shiftKey: boolean) => void
  onPrecall?: (userId: string) => void
  onDoubleClick?: (userId: string) => void
  canDrag?: (entry: QueueTimelineEntry) => boolean
  canReorder?: (
    activeId: string,
    overId: string,
    fromIndex: number,
    toIndex: number,
  ) => boolean
  onReorder?: (
    activeId: string,
    overId: string,
    fromIndex: number,
    toIndex: number,
  ) => boolean | void | Promise<boolean>
}) {
  const [now, setNow] = useState(() => Date.now())
  const [optimisticWaiting, setOptimisticWaiting] = useState<string[] | null>(null)
  const [dragActiveId, setDragActiveId] = useState<string | null>(null)
  const [dragOverId, setDragOverId] = useState<string | null>(null)
  const topRef = useRef<HTMLDivElement>(null)
  const boundaryRef = useRef<HTMLDivElement>(null)
  const previousFinishedKey = useRef<string | null>(null)
  const manualScrollTimer = useRef<number | null>(null)
  const programmaticScrollUntil = useRef(0)
  const entriesKey = entries
    .map((entry) => `${entry.userId}:${entry.status}:${entry.finishedAt ?? ''}`)
    .join('|')
  const finishedKey = entries
    .filter((entry) => entry.status === 'finished')
    .map((entry) => `${entry.userId}:${entry.finishedAt ?? ''}`)
    .sort()
    .join('|')
  const previousEntriesKey = useRef(entriesKey)
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
  )

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30000)
    return () => window.clearInterval(timer)
  }, [])

  useEffect(() => {
    if (previousEntriesKey.current === entriesKey) return
    previousEntriesKey.current = entriesKey
    setOptimisticWaiting(null)
  }, [entriesKey])

  const scrollToBoundary = useCallback(() => {
    programmaticScrollUntil.current = Date.now() + PROGRAMMATIC_SCROLL_GUARD
    ;(boundaryRef.current ?? topRef.current)?.scrollIntoView({
      block: 'start',
      behavior: 'smooth',
    })
  }, [])

  const scheduleReturnToBoundary = useCallback(() => {
    if (manualScrollTimer.current !== null) {
      window.clearTimeout(manualScrollTimer.current)
    }
    manualScrollTimer.current = window.setTimeout(() => {
      manualScrollTimer.current = null
      scrollToBoundary()
    }, AUTO_SCROLL_DELAY)
  }, [scrollToBoundary])

  useEffect(() => {
    const handleScroll = (event: Event) => {
      if (Date.now() < programmaticScrollUntil.current) return
      const anchor = boundaryRef.current ?? topRef.current
      if (!anchor || !(event.target instanceof Node)) return
      const scroller = findScrollParent(anchor)
      if (!scroller || event.target !== scroller) return
      scheduleReturnToBoundary()
    }
    document.addEventListener('scroll', handleScroll, true)
    return () => {
      document.removeEventListener('scroll', handleScroll, true)
      if (manualScrollTimer.current !== null) {
        window.clearTimeout(manualScrollTimer.current)
        manualScrollTimer.current = null
      }
    }
  }, [scheduleReturnToBoundary])

  useEffect(() => {
    if (previousFinishedKey.current !== finishedKey && manualScrollTimer.current === null) {
      scrollToBoundary()
    }
    previousFinishedKey.current = finishedKey
  }, [finishedKey, scrollToBoundary])

  if (entries.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-line px-4 py-8 text-center text-xs text-fg-subtle">
        队列暂无同学
      </div>
    )
  }

  const finished = entries
    .filter((entry) => entry.status === 'finished')
    .sort((a, b) => finishedTime(a) - finishedTime(b))
  const current = entries.find((entry) => entry.status === 'called') ?? null
  const baseWaiting = entries.filter(
    (entry) => entry.status !== 'finished' && entry !== current,
  )
  let waiting = baseWaiting
  if (optimisticWaiting) {
    const byId = new Map(baseWaiting.map((entry) => [entry.userId, entry] as const))
    const ordered = optimisticWaiting
      .map((id) => byId.get(id))
      .filter((entry): entry is QueueTimelineEntry => entry !== undefined)
    const seen = new Set(ordered.map((entry) => entry.userId))
    for (const entry of baseWaiting) {
      if (!seen.has(entry.userId)) ordered.push(entry)
    }
    waiting = ordered
  }
  let previewOrder = waiting.map((entry) => entry.userId)
  if (dragActiveId && dragOverId && dragActiveId !== dragOverId) {
    const fromIndex = previewOrder.indexOf(dragActiveId)
    const toIndex = previewOrder.indexOf(dragOverId)
    if (fromIndex >= 0 && toIndex >= 0) {
      const next = [...previewOrder]
      const [moved] = next.splice(fromIndex, 1)
      if (moved) {
        next.splice(toIndex, 0, moved)
        previewOrder = next
      }
    }
  }
  const displayIndexById = new Map(previewOrder.map((id, index) => [id, index] as const))
  const interactive = Boolean(onToggle)
  const currentIndex = current ? entries.indexOf(current) : -1
  const currentSelected = current ? selectedIds?.has(current.userId) ?? false : false

  const handleDragStart = (event: DragStartEvent) => {
    setDragActiveId(String(event.active.id))
    setDragOverId(null)
  }

  const handleDragOver = (event: DragOverEvent) => {
    setDragOverId(event.over ? String(event.over.id) : null)
  }

  const handleDragCancel = () => {
    setDragActiveId(null)
    setDragOverId(null)
  }

  const handleDragEnd = (event: DragEndEvent) => {
    setDragActiveId(null)
    setDragOverId(null)
    const { active, over } = event
    if (!over || active.id === over.id || !onReorder) return
    const fromIndex = waiting.findIndex((entry) => entry.userId === String(active.id))
    const toIndex = waiting.findIndex((entry) => entry.userId === String(over.id))
    if (fromIndex < 0 || toIndex < 0) return
    if (canReorder && !canReorder(String(active.id), String(over.id), fromIndex, toIndex)) {
      return
    }

    const next = [...waiting]
    const [moved] = next.splice(fromIndex, 1)
    if (!moved) return
    next.splice(toIndex, 0, moved)

    const result = onReorder(String(active.id), String(over.id), fromIndex, toIndex)
    if (result === false) return
    setOptimisticWaiting(next.map((entry) => entry.userId))
    if (result && typeof (result as Promise<boolean>).then === 'function') {
      void (result as Promise<boolean>).then((ok) => {
        if (!ok) setOptimisticWaiting(null)
      })
    }
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      modifiers={[restrictToVerticalAxis]}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragCancel={handleDragCancel}
      onDragEnd={handleDragEnd}
    >
      <div className={cn('max-h-[26rem] overflow-x-hidden overflow-y-auto pe-1', className)}>
        <div ref={topRef} className="relative flex flex-col gap-3 pl-10">
          <div className="pointer-events-none absolute bottom-0 left-2 top-0 w-px bg-line" />

          {finished.map((entry) => (
            <FinishedQueueItem
              key={entry.userId}
              entry={entry}
              queueIndex={entries.indexOf(entry)}
              now={now}
              selected={selectedIds?.has(entry.userId) ?? false}
              interactive={interactive}
              onToggle={onToggle}
            />
          ))}

          {finished.length > 0 && (current || waiting.length > 0) ? (
            <div ref={boundaryRef} aria-hidden className="-mt-3 h-0" />
          ) : null}

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
              onDoubleClick={
                onDoubleClick ? () => onDoubleClick(current.userId) : undefined
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
                onDoubleClick && 'cursor-pointer',
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
                displayIndex={displayIndexById.get(entry.userId) ?? index}
                queueIndex={entries.indexOf(entry)}
                now={now}
                selected={selectedIds?.has(entry.userId) ?? false}
                interactive={interactive}
                canDrag={canDrag?.(entry) ?? false}
                onToggle={onToggle}
                onPrecall={onPrecall}
                onDoubleClick={onDoubleClick}
              />
            ))}
          </SortableContext>
        </div>
      </div>
    </DndContext>
  )
}
