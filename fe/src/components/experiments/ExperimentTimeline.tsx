import { Chip, Tooltip } from '@heroui/react'

import type { Experiment } from '@/lib/api'
import {
  experimentTimeline,
  formatTimelineTime,
  type ExperimentTimelineEvent,
} from '@/lib/experiments'
import { cn } from '@/lib/utils'

/** 竖向时间线：上面是事件，下面是时间；过去/未来用颜色区分 */
export function ExperimentTimeline({ events }: { events: ExperimentTimelineEvent[] }) {
  return (
    <ol className="relative flex flex-col">
      {events.map((event, index) => (
        <li key={`${event.label}-${event.time}`} className="relative flex gap-2.5 pb-3 last:pb-0">
          {index < events.length - 1 && (
            <span
              aria-hidden
              className="absolute left-[4.5px] top-3.5 h-[calc(100%-10px)] w-px bg-line"
            />
          )}
          <span
            aria-hidden
            className={cn(
              'relative mt-1 h-2.5 w-2.5 shrink-0 rounded-full',
              event.today
                ? 'bg-amber-500 ring-2 ring-amber-500/25'
                : event.past
                  ? 'bg-fg-subtle/40'
                  : 'bg-brand-500',
            )}
          />
          <span className="flex min-w-0 flex-col">
            <span
              className={cn(
                'text-xs font-semibold',
                event.today
                  ? 'text-amber-600 dark:text-amber-400'
                  : event.past
                    ? 'text-fg-subtle'
                    : 'text-fg',
              )}
            >
              {event.label}
            </span>
            <span
              className={cn(
                'tabular text-[11px]',
                event.today ? 'text-fg-muted' : event.past ? 'text-fg-subtle' : 'text-fg-muted',
              )}
            >
              {formatTimelineTime(event.time)}
            </span>
          </span>
        </li>
      ))}
    </ol>
  )
}

/** 实验状态标签：hover 显示完整时间线 */
export function ExperimentStatusChip({ experiment }: { experiment: Experiment }) {
  const { status, events } = experimentTimeline(experiment)

  return (
    <Tooltip delay={150} closeDelay={100}>
      <Tooltip.Trigger className="inline-flex">
        <Chip size="sm" variant="soft" color={status.color}>
          {status.label}
        </Chip>
      </Tooltip.Trigger>
      <Tooltip.Content placement="left" showArrow className="max-w-[16rem] p-3">
        <div className="flex flex-col gap-2">
          <div className="text-xs font-bold">实验时间线</div>
          {events.length === 0 ? (
            <div className="text-[11px] text-fg-subtle">尚未设置时间线，可在实验详情页设置</div>
          ) : (
            <ExperimentTimeline events={events} />
          )}
        </div>
      </Tooltip.Content>
    </Tooltip>
  )
}
