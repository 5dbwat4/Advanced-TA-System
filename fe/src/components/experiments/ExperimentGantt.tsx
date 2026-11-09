import { graphic, type EChartsCoreOption } from 'echarts/core'
import { useTheme } from 'next-themes'
import { useMemo } from 'react'

import CalendarRange from '~icons/lucide/calendar-range'
import { EChart } from '@/components/charts/EChart'
import { Card } from '@/components/ui/Card'
import { formatDateTime } from '@/lib/format'
import { TIMELINE_BUFFER_DAYS, type ExperimentGanttItem } from '@/lib/experiments'

const DAY = 86_400_000

type TimelineDatum = {
  value: [number, number, number]
  id: string
  mark: string
  title: string
  total: number | null
  publishTime: string | null
  checkoffDeadline: string | null
  reportDeadline: string | null
  itemStyle: { color: string }
}

type TimelinePointDatum = {
  value: [number, number]
  date: string
  mark: string
  id: string
}

export function ExperimentGantt({
  experiments,
  showTotal = false,
  clickable = false,
  title = '实验时间线',
  showBuffer = false,
  onSelect,
}: {
  experiments: ExperimentGanttItem[]
  showTotal?: boolean
  clickable?: boolean
  title?: string
  /** 助教 / 教师视角额外展示报告批阅结束（报告截止 +5d）节点 */
  showBuffer?: boolean
  onSelect?: (id: string) => void
}) {
  const { resolvedTheme } = useTheme()
  const dark = resolvedTheme === 'dark'

  const chart = useMemo(
    () => buildTimelineOption(experiments, dark, showTotal, showBuffer),
    [experiments, dark, showTotal, showBuffer],
  )

  const chartHeight = Math.max(200, experiments.length * 36 + 64)

  const handleClick = (params: { data?: unknown }) => {
    if (!clickable) return
    const item = params?.data
    if (!item || typeof item !== 'object' || !('id' in item)) return
    const id = (item as { id?: unknown }).id
    if (typeof id === 'string') onSelect?.(id)
  }

  return (
    <Card className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm font-bold">
          <CalendarRange
            width={16}
            height={16}
            className="shrink-0 text-brand-600 dark:text-brand-300"
          />
          {title}
        </div>
        <div className="flex flex-wrap items-center gap-3 text-[10px] text-fg-subtle">
          <Legend className="bg-brand-500" label="实验区间" />
          <Legend className="bg-amber-500" label="验收截止" />
          <Legend className="bg-rose-500" label="报告截止" />
          {showBuffer && <Legend className="bg-violet-500" label="报告批阅结束" />}
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block h-3 border-l border-dashed border-danger/60" />
            今天
          </span>
        </div>
      </div>

      {experiments.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-line py-12 text-center text-sm text-fg-subtle">
          暂无实验
        </div>
      ) : chart.isEmpty ? (
        <div className="rounded-2xl border border-dashed border-line py-12 text-center text-sm text-fg-subtle">
          实验尚未设置时间
        </div>
      ) : (
        <EChart
          option={chart.option}
          height={chartHeight}
          className={clickable ? 'cursor-pointer' : undefined}
          onEvents={{ click: handleClick }}
        />
      )}
    </Card>
  )
}

function Legend({ className, label }: { className: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={`inline-block h-2 w-4 rounded-full ${className}`} />
      {label}
    </span>
  )
}

function buildTimelineOption(
  experiments: ExperimentGanttItem[],
  dark: boolean,
  showTotal: boolean,
  showBuffer: boolean,
): { option: EChartsCoreOption; isEmpty: boolean } {
  const palette = {
    text: dark ? '#e2e8f0' : '#334155',
    muted: dark ? '#94a3b8' : '#64748b',
    split: dark ? 'rgba(148,163,184,0.16)' : 'rgba(148,163,184,0.28)',
    tooltipBg: dark ? '#1e293b' : '#ffffff',
    bar: '#3b82f6',
    barMuted: dark ? 'rgba(148,163,184,0.28)' : 'rgba(148,163,184,0.38)',
    upcoming: 'rgba(59,130,246,0.28)',
    checkoff: '#f59e0b',
    report: '#f43f5e',
    buffer: '#8b5cf6',
    today: dark ? 'rgba(248,113,113,0.65)' : 'rgba(239,68,68,0.55)',
  }

  const now = Date.now()
  const times = experiments
    .flatMap((experiment) => [
      parseTime(experiment.publishTime),
      parseTime(experiment.checkoffDeadline),
      parseTime(experiment.reportDeadline),
      showBuffer ? bufferTime(experiment.reportDeadline) : null,
    ])
    .filter((time): time is number => time != null)

  const minTime = times.length > 0 ? Math.min(...times) : now
  const maxTime = times.length > 0 ? Math.max(...times) : now + 30 * DAY
  const padding = Math.max((maxTime - minTime) * 0.06, DAY)
  const rangeStart = minTime - padding
  const rangeEnd = maxTime + padding

  const data: TimelineDatum[] = []
  const checkoffPoints: TimelinePointDatum[] = []
  const reportPoints: TimelinePointDatum[] = []
  const gradingEndPoints: TimelinePointDatum[] = []

  experiments.forEach((experiment, index) => {
    const published = parseTime(experiment.publishTime)
    const checkoff = parseTime(experiment.checkoffDeadline)
    const report = parseTime(experiment.reportDeadline)
    const barStart = published ?? checkoff ?? report
    const barEnd = report ?? checkoff ?? published
    if (barStart == null || barEnd == null) return

    const ended = report != null && now > report
    const upcoming = published != null && now < published
    data.push({
      value: [index, barStart, barEnd],
      id: experiment.id,
      mark: experiment.mark,
      title: experiment.title,
      total: experiment.total ?? null,
      publishTime: experiment.publishTime,
      checkoffDeadline: experiment.checkoffDeadline,
      reportDeadline: experiment.reportDeadline,
      itemStyle: {
        color: ended ? palette.barMuted : upcoming ? palette.upcoming : palette.bar,
      },
    })
    if (checkoff != null) {
      checkoffPoints.push({
        value: [checkoff, index],
        date: experiment.checkoffDeadline ?? '',
        mark: experiment.mark,
        id: experiment.id,
      })
    }
    if (report != null) {
      reportPoints.push({
        value: [report, index],
        date: experiment.reportDeadline ?? '',
        mark: experiment.mark,
        id: experiment.id,
      })
    }
    if (showBuffer && report != null) {
      gradingEndPoints.push({
        value: [report + TIMELINE_BUFFER_DAYS * DAY, index],
        date: toIso(report + TIMELINE_BUFFER_DAYS * DAY),
        mark: experiment.mark,
        id: experiment.id,
      })
    }
  })

  const option: EChartsCoreOption = {
    animationDuration: 500,
    grid: { left: 8, right: 20, top: 28, bottom: 16, containLabel: true },
    tooltip: {
      trigger: 'item',
      backgroundColor: palette.tooltipBg,
      borderColor: palette.split,
      borderWidth: 1,
      textStyle: { color: palette.text, fontSize: 12 },
      formatter: (params: unknown) => {
        const single = (Array.isArray(params) ? params[0] : params) as {
          seriesName?: string
          data?: unknown
        } | null
        if (!single?.data) return ''
        const item = single.data as TimelineDatum | TimelinePointDatum
        if (single.seriesName === '报告批阅结束') {
          const point = item as TimelinePointDatum
          return `${escapeHtml(point.mark)} · 报告批阅结束<br/>${formatDateTime(point.date)}`
        }
        if (single.seriesName === '验收截止') {
          const point = item as TimelinePointDatum
          return `${escapeHtml(point.mark)} · 验收截止<br/>${formatDateTime(point.date)}`
        }
        if (single.seriesName === '报告截止') {
          const point = item as TimelinePointDatum
          return `${escapeHtml(point.mark)} · 报告截止<br/>${formatDateTime(point.date)}`
        }
        const bar = item as TimelineDatum
        const lines = [
          `<div style="font-weight:600;margin-bottom:4px">${escapeHtml(bar.mark)} · ${escapeHtml(bar.title)}</div>`,
          `发布：${formatDateTime(bar.publishTime)}`,
          `验收截止：${formatDateTime(bar.checkoffDeadline)}`,
          `报告截止：${formatDateTime(bar.reportDeadline)}`,
        ]
        if (showTotal) {
          lines.push(`总评：${bar.total == null ? '—' : formatScore(bar.total)}`)
        }
        return lines.join('<br/>')
      },
    },
    xAxis: {
      type: 'time',
      min: rangeStart,
      max: rangeEnd,
      axisLabel: {
        color: palette.muted,
        fontSize: 10,
        formatter: (value: number) => formatAxis(value),
      },
      axisLine: { lineStyle: { color: palette.split } },
      axisTick: { show: false },
      splitLine: { show: true, lineStyle: { color: palette.split } },
    },
    yAxis: {
      type: 'category',
      inverse: true,
      data: experiments.map((experiment) => `${experiment.mark} ${experiment.title}`),
      axisLabel: {
        color: palette.text,
        fontSize: 11,
        width: 120,
        overflow: 'truncate',
      },
      axisLine: { show: false },
      axisTick: { show: false },
      splitLine: { show: true, lineStyle: { color: palette.split } },
    },
    dataZoom: [{ type: 'inside', filterMode: 'none' }],
    series: [
      {
        type: 'custom',
        name: '实验',
        renderItem: (params: any, api: any) => {
          const categoryIndex = api.value(0)
          const start = api.coord([api.value(1), categoryIndex])
          const end = api.coord([api.value(2), categoryIndex])
          const size = api.size([0, 1])
          const rowHeight = Array.isArray(size) ? size[1] : size
          const height = rowHeight * 0.5
          const shape = graphic.clipRectByRect(
            {
              x: start[0],
              y: start[1] - height / 2,
              width: Math.max(end[0] - start[0], 3),
              height,
            },
            {
              x: params.coordSys.x,
              y: params.coordSys.y,
              width: params.coordSys.width,
              height: params.coordSys.height,
            },
          )
          if (!shape) return
          return {
            type: 'rect',
            transition: ['shape'],
            shape: { ...shape, r: height / 2 },
            style: api.style(),
          }
        },
        encode: { x: [1, 2], y: 0 },
        data,
        markLine: {
          silent: true,
          symbol: 'none',
          label: {
            show: true,
            formatter: '今天',
            color: palette.today,
            fontSize: 10,
          },
          lineStyle: { color: palette.today, type: 'dashed', width: 1 },
          data: [{ xAxis: now }],
        },
        z: 3,
      },
      {
        type: 'scatter',
        name: '验收截止',
        data: checkoffPoints,
        symbol: 'circle',
        symbolSize: 8,
        itemStyle: {
          color: palette.checkoff,
          borderColor: dark ? '#0f172a' : '#ffffff',
          borderWidth: 2,
        },
        z: 5,
      },
      {
        type: 'scatter',
        name: '报告截止',
        data: reportPoints,
        symbol: 'circle',
        symbolSize: 8,
        itemStyle: {
          color: palette.report,
          borderColor: dark ? '#0f172a' : '#ffffff',
          borderWidth: 2,
        },
        z: 5,
      },
      ...(showBuffer
        ? [
            {
              type: 'scatter' as const,
              name: '报告批阅结束',
              data: gradingEndPoints,
              symbol: 'circle',
              symbolSize: 9,
              itemStyle: {
                color: palette.buffer,
                borderColor: dark ? '#0f172a' : '#ffffff',
                borderWidth: 2,
              },
              z: 5,
            },
          ]
        : []),
    ],
  }

  return { option, isEmpty: data.length === 0 }
}

function parseTime(value: string | null): number | null {
  if (!value) return null
  const time = new Date(value).getTime()
  return Number.isNaN(time) ? null : time
}

function bufferTime(value: string | null): number | null {
  const time = parseTime(value)
  return time == null ? null : time + TIMELINE_BUFFER_DAYS * DAY
}

function toIso(time: number): string {
  return new Date(time).toISOString()
}

function formatAxis(time: number): string {
  const date = new Date(time)
  return `${date.getMonth() + 1}/${date.getDate()}`
}

function formatScore(value: number): string {
  return Number.isInteger(value) ? String(value) : String(Math.round(value * 10) / 10)
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => {
    switch (char) {
      case '&':
        return '&amp;'
      case '<':
        return '&lt;'
      case '>':
        return '&gt;'
      case '"':
        return '&quot;'
      default:
        return '&#39;'
    }
  })
}
