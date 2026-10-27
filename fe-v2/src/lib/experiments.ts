import type { Experiment } from '@/lib/api'

/** 截止后的缓冲展示期（天） */
export const TIMELINE_BUFFER_DAYS = 5

const DAY = 24 * 60 * 60 * 1000

export type ExperimentTimelineEvent = {
  label: string
  /** 时间戳（毫秒） */
  time: number
  /** 是否已经过去 */
  past: boolean
  /** 是否为「今天」标记 */
  today?: boolean
}

export type ExperimentTimelineStatus = {
  label: '未设置' | '未发布' | '进行中' | '已结束'
  color: 'default' | 'warning' | 'success'
}

export type ExperimentTimelineInfo = {
  status: ExperimentTimelineStatus
  events: ExperimentTimelineEvent[]
  /** 最后一个时间线事件的时间（无截止时间时为 null） */
  end: number | null
}

function timestamp(value: string | null | undefined): number | null {
  if (!value) return null
  const time = new Date(value).getTime()
  return Number.isFinite(time) ? time : null
}

/** 根据三个时间字段推导实验状态与时间线事件（过去/未来） */
export function experimentTimeline(
  experiment: Pick<Experiment, 'publishTime' | 'checkoffDeadline' | 'reportDeadline'>,
  now: number = Date.now(),
): ExperimentTimelineInfo {
  const publish = timestamp(experiment.publishTime)
  const checkoff = timestamp(experiment.checkoffDeadline)
  const report = timestamp(experiment.reportDeadline)

  const raw: { label: string; time: number }[] = []
  if (publish !== null) raw.push({ label: '发布', time: publish })
  if (checkoff !== null) {
    raw.push({ label: '验收截止', time: checkoff })
    raw.push({ label: `验收截止+${TIMELINE_BUFFER_DAYS}d`, time: checkoff + TIMELINE_BUFFER_DAYS * DAY })
  }
  if (report !== null) {
    raw.push({ label: '报告提交截止', time: report })
    raw.push({ label: `报告截止+${TIMELINE_BUFFER_DAYS}d`, time: report + TIMELINE_BUFFER_DAYS * DAY })
  }
  raw.sort((a, b) => a.time - b.time)

  const deadlines = [checkoff, report].filter((value): value is number => value !== null)
  const end = deadlines.length > 0 ? Math.max(...deadlines) + TIMELINE_BUFFER_DAYS * DAY : null

  let status: ExperimentTimelineStatus
  if (publish === null && checkoff === null && report === null) {
    status = { label: '未设置', color: 'default' }
  } else if (publish !== null && now < publish) {
    status = { label: '未发布', color: 'warning' }
  } else if (end !== null && now > end) {
    status = { label: '已结束', color: 'default' }
  } else {
    status = { label: '进行中', color: 'success' }
  }

  const items: ExperimentTimelineEvent[] = raw.map((event) => ({ ...event, past: event.time <= now }))
  if (items.length > 0) {
    const today: ExperimentTimelineEvent = { label: '今天', time: now, past: false, today: true }
    const index = items.findIndex((event) => event.time > now)
    if (index === -1) items.push(today)
    else items.splice(index, 0, today)
  }

  return { status, events: items, end }
}

/** 时间线时间展示：2026/07/01 08:00 */
export function formatTimelineTime(time: number): string {
  return new Date(time).toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
}
