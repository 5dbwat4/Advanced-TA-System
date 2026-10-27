<script setup lang="ts">
import type {
  CustomSeriesRenderItemAPI,
  CustomSeriesRenderItemParams,
  CustomSeriesRenderItemReturn,
  EChartsOption,
  TooltipComponentFormatterCallbackParams,
} from 'echarts'
import { graphic } from 'echarts/core'
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'

import EChart from '@/components/charts/EChart.vue'
import Card from '@/components/ui/Card.vue'
import Spinner from '@/components/ui/Spinner.vue'
import {
  fetchStudentOverview,
  type StudentOverview,
  type StudentOverviewExperiment,
} from '@/lib/api'
import { getErrorMessage } from '@/lib/error'
import { formatDateTime } from '@/lib/format'
import { useTheme } from '@/lib/theme'
import { UIcon } from '@/ui'

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

const router = useRouter()
const { isDark } = useTheme()

const data = ref<StudentOverview | null>(null)
const error = ref<string | null>(null)
const loading = ref(true)

const chart = computed(() =>
  data.value ? buildTimelineOption(data.value.experiments, isDark.value) : null,
)
const chartHeight = computed(() =>
  Math.max(280, (data.value?.experiments.length ?? 0) * 52 + 96),
)
const scored = computed(
  () => data.value?.experiments.filter((experiment) => experiment.total != null) ?? [],
)

const legendItems = [
  { className: 'bg-brand-500', label: '实验区间' },
  { className: 'bg-amber-500', label: '验收截止' },
  { className: 'bg-rose-500', label: '报告截止' },
]

function handleChartClick(params: unknown) {
  if (!params || typeof params !== 'object' || !('data' in params)) return
  const item = (params as { data?: unknown }).data
  if (!item || typeof item !== 'object' || !('id' in item)) return
  const id = (item as { id?: unknown }).id
  if (typeof id === 'string') void router.push(`/student-console/experiments/${id}`)
}

const chartEvents = { click: handleChartClick }

onMounted(async () => {
  try {
    data.value = await fetchStudentOverview()
  } catch (err) {
    error.value = getErrorMessage(err, '加载失败')
  } finally {
    loading.value = false
  }
})

function buildTimelineOption(
  experiments: StudentOverviewExperiment[],
  dark: boolean,
): { option: EChartsOption; isEmpty: boolean } {
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
  const checkoffPoints: TimelinePointDatum[] = []
  const reportPoints: TimelinePointDatum[] = []

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

  const option: EChartsOption = {
    animationDuration: 500,
    grid: { left: 8, right: 20, top: 36, bottom: 28, containLabel: true },
    tooltip: {
      trigger: 'item',
      backgroundColor: palette.tooltipBg,
      borderColor: palette.split,
      borderWidth: 1,
      textStyle: { color: palette.text, fontSize: 12 },
      formatter: (params: TooltipComponentFormatterCallbackParams) => {
        const single = Array.isArray(params) ? params[0] : params
        if (!single) return ''
        const item = single.data as TimelineDatum | TimelinePointDatum | undefined
        if (!item) return ''
        if (single.seriesName === '验收截止') {
          const point = item as TimelinePointDatum
          return `${escapeHtml(point.mark)} · 验收截止<br/>${formatDateTime(point.date)}`
        }
        if (single.seriesName === '报告截止') {
          const point = item as TimelinePointDatum
          return `${escapeHtml(point.mark)} · 报告截止<br/>${formatDateTime(point.date)}`
        }
        const bar = item as TimelineDatum
        return [
          `<div style="font-weight:600;margin-bottom:4px">${escapeHtml(bar.mark)} · ${escapeHtml(bar.title)}</div>`,
          `发布：${formatDateTime(bar.publishTime)}`,
          `验收截止：${formatDateTime(bar.checkoffDeadline)}`,
          `报告截止：${formatDateTime(bar.reportDeadline)}`,
          `总评：${bar.total == null ? '—' : formatScore(bar.total)}`,
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
        renderItem: (
          params: CustomSeriesRenderItemParams,
          api: CustomSeriesRenderItemAPI,
        ): CustomSeriesRenderItemReturn => {
          const categoryIndex = api.value(0) as number
          const start = api.coord([api.value(1), categoryIndex])
          const end = api.coord([api.value(2), categoryIndex])
          const size = api.size?.([0, 1])
          const rowHeight = Array.isArray(size) ? (size[1] ?? 0) : (size ?? 0)
          const height = rowHeight * 0.42
          const coordSys = params.coordSys as unknown as {
            x: number
            y: number
            width: number
            height: number
          }
          const shape = graphic.clipRectByRect(
            {
              x: start[0]!,
              y: start[1]! - height / 2,
              width: Math.max(end[0]! - start[0]!, 3),
              height,
            },
            {
              x: coordSys.x,
              y: coordSys.y,
              width: coordSys.width,
              height: coordSys.height,
            },
          )
          if (!shape) return
          return {
            type: 'rect',
            transition: ['shape'],
            shape: { ...shape, r: height / 2 },
            style: api.style(),
          } as CustomSeriesRenderItemReturn
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
</script>

<template>
  <div class="mx-auto max-w-4xl">
    <div v-if="loading" class="flex justify-center py-20">
      <Spinner size="lg" />
    </div>

    <div
      v-else-if="error"
      class="rounded-3xl border border-line bg-elevated/80 p-8 text-center text-sm text-danger"
    >
      {{ error }}
    </div>

    <template v-else-if="data">
      <section class="rounded-3xl border border-line bg-elevated/80 p-6 shadow-2xl backdrop-blur-xl">
        <div class="text-xs font-semibold tracking-widest text-fg-subtle">
          {{ data.class?.name ?? '未绑定班级' }}
        </div>
        <h1 class="mt-2 text-2xl font-bold tracking-tight">{{ data.student.name }}</h1>
        <div class="tabular mt-1 text-sm text-fg-subtle">{{ data.student.studentId || '—' }}</div>
        <div class="mt-5 grid gap-3 sm:grid-cols-2">
          <div class="rounded-2xl border border-line bg-sunken px-4 py-3">
            <div class="text-[10px] font-semibold uppercase tracking-widest text-fg-subtle">
              实验数
            </div>
            <div class="tabular mt-1 text-xl font-bold">{{ data.experiments.length }}</div>
          </div>
          <div class="rounded-2xl border border-line bg-sunken px-4 py-3">
            <div class="text-[10px] font-semibold uppercase tracking-widest text-fg-subtle">
              已出分
            </div>
            <div class="tabular mt-1 text-xl font-bold">{{ scored.length }}</div>
          </div>
        </div>
      </section>

      <div class="mt-6">
        <Card :index="0" class="flex flex-col gap-4">
          <div class="flex flex-wrap items-center justify-between gap-3">
            <div class="flex items-center gap-2 text-sm font-bold">
              <UIcon
                name="i-lucide-calendar-range"
                class="size-4 shrink-0 text-brand-600 dark:text-brand-300"
              />
              实验时间线
            </div>
            <div class="flex flex-wrap items-center gap-3 text-[10px] text-fg-subtle">
              <span
                v-for="item in legendItems"
                :key="item.label"
                class="inline-flex items-center gap-1.5"
              >
                <span :class="['inline-block h-2 w-4 rounded-full', item.className]" />
                {{ item.label }}
              </span>
              <span class="inline-flex items-center gap-1.5">
                <span class="inline-block h-3 border-l border-dashed border-danger/60" />
                今天
              </span>
            </div>
          </div>

          <div
            v-if="data.experiments.length === 0"
            class="rounded-2xl border border-dashed border-line py-12 text-center text-sm text-fg-subtle"
          >
            暂无实验
          </div>
          <div
            v-else-if="!chart || chart.isEmpty"
            class="rounded-2xl border border-dashed border-line py-12 text-center text-sm text-fg-subtle"
          >
            实验尚未设置时间
          </div>
          <EChart
            v-else
            :option="chart.option"
            :height="chartHeight"
            :on-events="chartEvents"
          />
        </Card>
      </div>
    </template>
  </div>
</template>
