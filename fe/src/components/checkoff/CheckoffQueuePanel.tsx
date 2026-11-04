import { Spinner } from '@heroui/react'
import { motion } from 'motion/react'
import { useEffect, useMemo, useState, type ReactNode } from 'react'

import ChevronRight from '~icons/lucide/chevron-right'
import RefreshCw from '~icons/lucide/refresh-cw'
import { AvatarImage } from '@/components/ui/AvatarImage'
import { IconAction } from '@/components/ui/IconAction'
import type { CheckoffQueueEntry } from '@/lib/api'
import { cn } from '@/lib/utils'

/** 同一实验下的排队条目（保持加入顺序，序号在本组内 1-based） */
type QueueGroup = {
  experimentId: string
  mark: string
  title: string
  entries: CheckoffQueueEntry[]
}

/** 按实验分组：组顺序沿用条目首次出现顺序，不重排组内顺序 */
function groupByExperiment(entries: CheckoffQueueEntry[]): QueueGroup[] {
  const order: string[] = []
  const map = new Map<string, QueueGroup>()
  for (const entry of entries) {
    let group = map.get(entry.experimentId)
    if (!group) {
      group = {
        experimentId: entry.experimentId,
        mark: entry.experimentMark,
        title: entry.experimentTitle,
        entries: [],
      }
      map.set(entry.experimentId, group)
      order.push(entry.experimentId)
    }
    group.entries.push(entry)
  }
  return order.map((id) => map.get(id)).filter((group): group is QueueGroup => group != null)
}

/** 等待时长文案：按分钟粒度展示，超过 1 小时补上小时 */
function waitedLabel(joinedAt: string, now: number): string {
  const joined = new Date(joinedAt).getTime()
  if (Number.isNaN(joined)) return '—'
  const minutes = Math.floor(Math.max(0, now - joined) / 60_000)
  if (minutes < 1) return '刚刚加入'
  if (minutes < 60) return `已等待 ${minutes} 分钟`
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  return rest > 0 ? `已等待 ${hours} 小时 ${rest} 分钟` : `已等待 ${hours} 小时`
}

/**
 * 排队情况面板：按实验分组展示全班共享队列，当前已选实验排在最前并高亮；
 * 点击任意一条 → onPick（由页面负责切实验 + 预填搜索），等待时长每 30s 刷新。
 */
export function CheckoffQueuePanel({
  entries,
  loading,
  currentExperimentId,
  onPick,
  onRefresh,
}: {
  entries: CheckoffQueueEntry[]
  loading: boolean
  currentExperimentId: string | null
  onPick: (entry: CheckoffQueueEntry) => void
  onRefresh: () => void
}): ReactNode {
  // 等待时长按分钟展示，30s 刷新一次即可（面板随 Modal 打开时挂载，初值即打开时间）
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30_000)
    return () => window.clearInterval(timer)
  }, [])

  const groups = useMemo(() => {
    const list = groupByExperiment(entries)
    // 当前已选实验排到最前，方便助教优先处理手头的实验
    if (currentExperimentId) {
      const index = list.findIndex((group) => group.experimentId === currentExperimentId)
      if (index > 0) list.unshift(...list.splice(index, 1))
    }
    return list
  }, [entries, currentExperimentId])

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <span className="text-sm font-bold text-fg">排队情况</span>
        <span className="tabular rounded-md bg-sunken px-1.5 py-0.5 text-[11px] font-semibold text-fg-subtle">
          {entries.length} 人
        </span>
        <div className="ml-auto">
          <IconAction
            label="刷新排队情况"
            isPending={loading && entries.length > 0}
            onPress={onRefresh}
          >
            <RefreshCw width={15} height={15} className="shrink-0" />
          </IconAction>
        </div>
      </div>

      {loading && entries.length === 0 ? (
        <div className="flex justify-center py-8">
          <Spinner size="sm" />
        </div>
      ) : entries.length === 0 ? (
        <p className="rounded-xl border border-dashed border-line py-6 text-center text-xs text-fg-subtle">
          暂无学生排队
        </p>
      ) : (
        groups.map((group) => (
          <section key={group.experimentId} className="flex flex-col gap-2">
            <div className="flex items-center gap-2 px-1">
              <span className="min-w-0 truncate text-xs font-semibold text-fg">
                {group.mark} {group.title}
              </span>
              <span className="tabular ml-auto shrink-0 text-[11px] text-fg-subtle">
                {group.entries.length} 人
              </span>
            </div>
            {group.entries.map((entry, index) => {
              const isCurrent = entry.experimentId === currentExperimentId
              return (
                <motion.button
                  key={entry.id}
                  type="button"
                  layout
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
                  onClick={() => onPick(entry)}
                  className={cn(
                    'flex w-full items-center gap-3 rounded-xl border px-3 py-2 text-left transition-all',
                    isCurrent
                      ? 'border-brand-500/40 bg-brand-500/5 hover:border-brand-500/60'
                      : 'border-line bg-sunken hover:border-brand-500/40',
                  )}
                >
                  <span className="tabular w-7 shrink-0 text-[11px] font-semibold text-fg-subtle">
                    #{index + 1}
                  </span>
                  <AvatarImage id={entry.avatar} size={32} fallback={entry.name.slice(0, 1)} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-semibold text-fg">{entry.name}</div>
                    <div className="tabular mt-0.5 truncate text-[11px] text-fg-muted">
                      {entry.studentId}
                    </div>
                  </div>
                  <span className="tabular shrink-0 text-[11px] text-fg-subtle">
                    {waitedLabel(entry.joinedAt, now)}
                  </span>
                  <ChevronRight width={16} height={16} className="shrink-0 text-fg-subtle" />
                </motion.button>
              )
            })}
          </section>
        ))
      )}

      <p className="text-[11px] leading-relaxed text-fg-subtle">
        队列为全班共享；助教会线下叫人，请在现场留意。
      </p>
    </div>
  )
}
