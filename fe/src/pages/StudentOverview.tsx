import { Spinner } from '@heroui/react'
import { graphic, type EChartsCoreOption } from 'echarts/core'
import { useTheme } from 'next-themes'
import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import CalendarRange from '~icons/lucide/calendar-range'
import { EChart } from '@/components/charts/EChart'
import { Card } from '@/components/ui/Card'
import {
  fetchStudentOverview,
  type StudentOverview,
  type StudentOverviewExperiment,
} from '@/lib/api'
import { getErrorMessage } from '@/lib/error'
import { formatDateTime } from '@/lib/format'

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

export default function StudentOverview() {
  const { resolvedTheme } = useTheme()
  const navigate = useNavigate()
  const [data, setData] = useState<StudentOverview | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    fetchStudentOverview()
      .then((result) => {
        if (!cancelled) setData(result)
      })
      .catch((err) => {
        if (!cancelled) setError(getErrorMessage(err, '加载失败'))
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  const chart = useMemo(() => {
    if (!data) return null
    return buildTimelineOption(data.experiments, resolvedTheme === 'dark')
  }, [data, resolvedTheme])

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <Spinner size="lg" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="rounded-3xl border border-line bg-elevated/80 p-8 text-center text-sm text-danger">
        {error}
      </div>
    )
  }

  if (!data) return null

  const scored = data.experiments.filter((experiment) => experiment.total != null)
  const chartHeight = Math.max(280, data.experiments.length * 52 + 96)

  return (
    <div className="mx-auto max-w-4xl">
      <section className="rounded-3xl border border-line bg-elevated/80 p-6 shadow-2xl backdrop-blur-xl">
        <div className="text-xs font-semibold tracking-widest text-fg-subtle">
          {data.class?.name ?? '未绑定班级'}
        </div>
        <h1 className="mt-2 text-2xl font-bold tracking-tight">{data.student.name}</h1>
        <div className="tabular mt-1 text-sm text-fg-subtle">{data.student.studentId || '—'}</div>
        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <Stat label="实验数" value={String(data.experiments.length)} />
          <Stat label="已出分" value={String(scored.length)} />
        </div>
      </section>

      <div className="mt-6">
        <Card index={0} className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-sm font-bold">
              <CalendarRange
                width={16}
                height={16}
                className="shrink-0 text-brand-600 dark:text-brand-300"
              />
              实验时间线
            </div>
            <div className="flex flex-wrap items-center gap-3 text-[10px] text-fg-subtle">
              <Legend className="bg-brand-500" label="实验区间" />
              <Legend className="bg-amber-500" label="验收截止" />
              <Legend className="bg-rose-500" label="报告截止" />
              <span className="inline-flex items-center gap-1.5">
                <span className="inline-block h-3 border-l border-dashed border-danger/60" />
                今天
              </span>
            </div>
          </div>

          {data.experiments.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-line py-12 text-center text-sm text-fg-subtle">
              暂无实验
            </div>
          ) : !chart || chart.isEmpty ? (
            <div className="rounded-2xl border border-dashed border-line py-12 text-center text-sm text-fg-subtle">
              实验尚未设置时间
            </div>
          ) : (
            <EChart
              option={chart.option}
              height={chartHeight}
              onEvents={{
                click: (params: any) => {
                  const id = params?.data?.id
                  if (typeof id === 'string') {
                    navigate(`/student-console/experiments/${id}`)
                  }
                },
              }}
            />
          )}
        </Card>
      </div>
    </div>
  )
}

function buildTimelineOption(
  experiments: StudentOverviewExperiment[],
  dark: boolean,
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
    today: dark ? 'rgba(248,113,113,0.65)' : 'rgba(239,68,68,0.55)',
  }

  const now = Date.now()
  const times = experiments
    .flatMap((experiment) => [
      parseTime(experiment.publishTime),
      parseTime(experiment.checkoffDeadline),
      parseTime(experiment.reportDeadline),
    ])
    .filter((time): time is number => time != null)

  const minTime = times.length > 0 ? Math.min(...times) : now
  const maxTime = times.length > 0 ? Math.max(...times) : now + 30 * DAY
  const padding = Math.max((maxTime - minTime) * 0.06, DAY)
  const rangeStart = minTime - padding
  const rangeEnd = maxTime + padding

  const data: TimelineDatum[] = []
  const checkoffPoints: Array<{ value: [number, number]; date: string; mark: string; id: string }> =
    []
  const reportPoints: Array<{ value: [number, number]; date: string; mark: string; id: string }> =
    []

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
      total: experiment.total,
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
  })

  const option: EChartsCoreOption = {
    animationDuration: 500,
    grid: { left: 8, right: 20, top: 36, bottom: 28, containLabel: true },
    tooltip: {
      trigger: 'item',
      backgroundColor: palette.tooltipBg,
      borderColor: palette.split,
      borderWidth: 1,
      textStyle: { color: palette.text, fontSize: 12 },
      formatter: (params: any) => {
        const item = params.data
        if (!item) return ''
        if (params.seriesName === '验收截止') {
          return `${escapeHtml(item.mark)} · 验收截止<br/>${formatDateTime(item.date)}`
        }
        if (params.seriesName === '报告截止') {
          return `${escapeHtml(item.mark)} · 报告截止<br/>${formatDateTime(item.date)}`
        }
        return [
          `<div style="font-weight:600;margin-bottom:4px">${escapeHtml(item.mark)} · ${escapeHtml(item.title)}</div>`,
          `发布：${formatDateTime(item.publishTime)}`,
          `验收截止：${formatDateTime(item.checkoffDeadline)}`,
          `报告截止：${formatDateTime(item.reportDeadline)}`,
          `总评：${item.total == null ? '—' : formatScore(item.total)}`,
        ].join('<br/>')
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
    dataZoom: [{ type: 'inside' }],
    series: [
      {
        type: 'custom',
        name: '实验',
        renderItem: (params: any, api: any) => {
          const categoryIndex = api.value(0)
          const start = api.coord([api.value(1), categoryIndex])
          const end = api.coord([api.value(2), categoryIndex])
          const height = api.size([0, 1])[1] * 0.42
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
    ],
  }

  return { option, isEmpty: data.length === 0 }
}

function Legend({ className, label }: { className: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={`inline-block h-2 w-4 rounded-full ${className}`} />
      {label}
    </span>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-line bg-sunken px-4 py-3">
      <div className="text-[10px] font-semibold uppercase tracking-widest text-fg-subtle">
        {label}
      </div>
      <div className="tabular mt-1 text-xl font-bold">{value}</div>
    </div>
  )
}

function parseTime(value: string | null): number | null {
  if (!value) return null
  const time = new Date(value).getTime()
  return Number.isNaN(time) ? null : time
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
