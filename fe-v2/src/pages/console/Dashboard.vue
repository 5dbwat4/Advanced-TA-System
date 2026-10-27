<script setup lang="ts">
import type { DropdownMenuItem } from '@nuxt/ui'
import type { EChartsOption } from 'echarts'
import { BarChart } from 'echarts/charts'
import * as echarts from 'echarts/core'
import { computed, ref, watch } from 'vue'
import { RouterLink } from 'vue-router'

import EChart from '@/components/charts/EChart.vue'
import Card from '@/components/ui/Card.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import {
  fetchClassTables,
  fetchExperimentsWithCurrent,
  fetchXzzdPushPreview,
  type ClassTables,
  type Experiment,
} from '@/lib/api'
import { useAuthStore } from '@/lib/auth'
import { NAV_ITEMS } from '@/lib/nav'
import { useCurrentClassComputed } from '@/lib/store'
import { cn } from '@/lib/utils'
import { UButton, UDropdownMenu, UIcon } from '@/ui'

echarts.use([BarChart])

const DAY_MS = 24 * 60 * 60 * 1000

const TONES = {
  brand: 'bg-brand-500/10 text-brand-600 dark:text-brand-300',
  amber: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
  success: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
  purple: 'bg-purple-500/10 text-purple-600 dark:text-purple-400',
} as const

type DeadlineInfo = { label: string; days: number; past: boolean }

const auth = useAuthStore()
const currentClass = useCurrentClassComputed()
const classId = computed(() => currentClass.value?.id ?? null)
const myUserId = computed(() => auth.user?.id ?? null)

const hour = new Date().getHours()
const greeting = hour < 12 ? '早上好' : hour < 18 ? '下午好' : '晚上好'

const loading = ref(true)
const experiments = ref<Experiment[]>([])
const tables = ref<ClassTables | null>(null)
const selectedId = ref<string | null>(null)
const myReports = ref<number | null>(null)
const myCheckoffs = ref<number | null>(null)

const reportLoading = ref(false)
const submitted = ref<number | null>(null)
const ungraded = ref<number | null>(null)

let loadSeq = 0

async function loadData() {
  const id = classId.value
  if (!id) {
    loading.value = false
    experiments.value = []
    tables.value = null
    selectedId.value = null
    myReports.value = null
    myCheckoffs.value = null
    return
  }
  const seq = ++loadSeq
  loading.value = true
  try {
    const [withCurrent, classTables] = await Promise.all([
      fetchExperimentsWithCurrent(id),
      fetchClassTables(id),
    ])
    if (seq !== loadSeq) return
    experiments.value = withCurrent.experiments
    tables.value = classTables
    const current =
      withCurrent.currentMark != null
        ? (withCurrent.experiments.find((item) => item.mark === withCurrent.currentMark) ?? null)
        : null
    selectedId.value = current?.id ?? null

    if (myUserId.value) {
      const startOfToday = new Date()
      startOfToday.setHours(0, 0, 0, 0)
      const todayStart = startOfToday.getTime()
      const reportKeys = new Set<string>()
      const checkoffKeys = new Set<string>()
      for (const score of classTables.scores) {
        if (score.graderId !== myUserId.value) continue
        if (new Date(score.updatedAt).getTime() < todayStart) continue
        if (score.type === 2) reportKeys.add(`${score.indId}:${score.userId}`)
        else if (score.type === 0) checkoffKeys.add(`${score.indId}:${score.userId}`)
      }
      myReports.value = reportKeys.size
      myCheckoffs.value = checkoffKeys.size
    }
  } catch {
    if (seq !== loadSeq) return
    experiments.value = []
    tables.value = null
    selectedId.value = null
  } finally {
    if (seq === loadSeq) loading.value = false
  }
}

watch([classId, myUserId], () => void loadData(), { immediate: true })

let reportSeq = 0

async function loadReportPreview() {
  const sid = selectedId.value
  const currentTables = tables.value
  if (!sid || !currentTables) {
    submitted.value = null
    ungraded.value = null
    reportLoading.value = false
    return
  }
  const seq = ++reportSeq
  reportLoading.value = true
  try {
    const preview = await fetchXzzdPushPreview(sid, 'report')
    if (seq !== reportSeq) return
    const userIdByNo = new Map(
      currentTables.students.map((student) => [student.studentId, student.userId]),
    )
    const noByPerson = new Map(preview.students.map((student) => [student.id, student.studentId]))
    const gradedStuIds = new Set(
      currentTables.scores
        .filter((score) => score.type === 2 && score.indId === sid)
        .map((score) => score.userId),
    )
    const personIds = new Set<number>()
    let graded = 0
    for (const row of preview.submissions) {
      const personId = row.created_by?.id
      if (personId == null) continue
      personIds.add(personId)
      const studentId = noByPerson.get(personId)
      const userId = studentId ? userIdByNo.get(studentId) : undefined
      if (userId && gradedStuIds.has(userId)) graded += 1
    }
    submitted.value = personIds.size
    ungraded.value = personIds.size - graded
  } catch {
    if (seq === reportSeq) {
      submitted.value = null
      ungraded.value = null
    }
  } finally {
    if (seq === reportSeq) reportLoading.value = false
  }
}

watch([selectedId, tables], () => void loadReportPreview(), { immediate: true })

const experiment = computed(
  () => experiments.value.find((item) => item.id === selectedId.value) ?? null,
)
const total = computed(() => tables.value?.students.length ?? null)

const checkedOff = computed(() => {
  if (!tables.value || !selectedId.value) return null
  const ids = new Set(
    tables.value.scores
      .filter(
        (score) =>
          score.indId === selectedId.value && (score.type === 0 || score.type === 1),
      )
      .map((score) => score.userId),
  )
  return ids.size
})

const reportHref = computed(() =>
  experiment.value ? `/console/reports/${experiment.value.id}` : null,
)
const pushHref = computed(() =>
  experiment.value ? `/console/experiments/${experiment.value.id}/xzzd-push` : null,
)
const deadline = computed(() => (experiment.value ? deadlineInfo(experiment.value) : null))

const experimentMenuItems = computed<DropdownMenuItem[][]>(() => [
  experiments.value.map((item) => ({
    label: `${item.mark} · ${item.title}`,
    onSelect: () => {
      selectedId.value = item.id
    },
  })),
])

const quickLinks = computed(() =>
  NAV_ITEMS.filter((item) => item.to !== '/console' && item.to !== '/console/more').slice(0, 6),
)

const hasChart = computed(
  () =>
    Boolean(experiment.value && tables.value) &&
    (submitted.value != null || checkedOff.value != null),
)

const chartOption = computed<EChartsOption>(() => {
  if (!hasChart.value) return {}
  const categories: string[] = []
  const values: number[] = []
  if (submitted.value != null) {
    categories.push('报告提交')
    values.push(submitted.value)
  }
  if (checkedOff.value != null) {
    categories.push('当前验收')
    values.push(checkedOff.value)
  }
  return {
    grid: { left: 8, right: 40, top: 16, bottom: 8, containLabel: true },
    tooltip: { trigger: 'axis' },
    xAxis: {
      type: 'value',
      max: total.value ?? undefined,
      axisLabel: { show: false },
      splitLine: { show: false },
      axisLine: { show: false },
      axisTick: { show: false },
    },
    yAxis: {
      type: 'category',
      data: categories,
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: { color: '#94a3b8' },
    },
    series: [
      {
        type: 'bar',
        data: values,
        barWidth: 14,
        itemStyle: { borderRadius: [0, 7, 7, 0], color: '#3b82f6' },
        label: { show: true, position: 'right' },
      },
    ],
  }
})

function deadlineInfo(value: Experiment): DeadlineInfo | null {
  const now = Date.now()
  const parsed = [
    { label: '报告提交截止', time: value.reportDeadline },
    { label: '验收截止', time: value.checkoffDeadline },
  ]
    .map((item) => ({
      label: item.label,
      t: item.time == null ? Number.NaN : Date.parse(item.time),
    }))
    .filter((item) => Number.isFinite(item.t))
  if (parsed.length === 0) return null
  const future = parsed.filter((item) => item.t > now)
  if (future.length > 0) {
    const nearest = future.reduce((a, b) => (a.t < b.t ? a : b))
    return {
      label: nearest.label,
      days: Math.max(1, Math.ceil((nearest.t - now) / DAY_MS)),
      past: false,
    }
  }
  const latest = parsed.reduce((a, b) => (a.t > b.t ? a : b))
  return {
    label: latest.label,
    days: Math.max(1, Math.ceil((now - latest.t) / DAY_MS)),
    past: true,
  }
}

function display(value: number | null, isLoading: boolean): number | string {
  return isLoading ? '—' : (value ?? '—')
}
</script>

<template>
  <div class="mx-auto max-w-6xl">
    <div class="mb-8 animate-fade-up">
      <h1 class="text-2xl font-bold tracking-tight md:text-3xl">
        {{ greeting }}，{{ auth.user?.username ?? auth.user?.name ?? '助教' }}
      </h1>
      <p v-if="currentClass" class="mt-1 text-sm text-fg-muted">
        当前课程：{{ currentClass.name }}
      </p>
    </div>

    <EmptyState
      v-if="!currentClass"
      icon="i-lucide-school"
      title="尚未绑定班级"
      hint="请先在设置中绑定班级"
    />

    <template v-else>
      <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Card :index="0" class="flex h-full flex-col">
          <div class="flex items-start justify-between gap-2">
            <div
              :class="
                cn('flex h-10 w-10 items-center justify-center rounded-xl', TONES.success)
              "
            >
              <UIcon name="i-lucide-flask-conical" class="h-[19px] w-[19px] shrink-0" />
            </div>
            <UDropdownMenu :items="experimentMenuItems">
              <UButton
                size="sm"
                color="secondary"
                variant="soft"
                :disabled="experiments.length === 0"
              >
                选择其它实验
              </UButton>
            </UDropdownMenu>
          </div>
          <div class="mt-3 text-xs font-semibold uppercase tracking-wider text-fg-subtle">
            当前最近实验
          </div>
          <div class="mt-1 text-lg font-bold">
            {{ loading ? '加载中…' : (experiment?.mark ?? '暂无实验') }}
          </div>
          <div v-if="experiment" class="mt-0.5 text-sm text-fg-muted">{{ experiment.title }}</div>
        </Card>

        <component
          :is="reportHref ? RouterLink : 'div'"
          :to="reportHref ?? undefined"
          class="group block"
        >
          <Card :index="1" :hover="reportHref != null" class="flex h-full flex-col">
            <div
              :class="cn('flex h-10 w-10 items-center justify-center rounded-xl', TONES.brand)"
            >
              <UIcon name="i-lucide-clipboard-check" class="h-[19px] w-[19px] shrink-0" />
            </div>
            <div class="mt-3 text-xs font-semibold uppercase tracking-wider text-fg-subtle">
              报告提交
            </div>
            <div class="mt-1 flex items-baseline gap-1">
              <span class="tabular text-3xl font-bold tracking-tight">
                {{ display(submitted, loading || reportLoading) }}
              </span>
              <span class="text-sm text-fg-muted">
                / {{ display(total, loading) }}
              </span>
            </div>
            <div
              v-if="!loading && !reportLoading && ungraded != null"
              class="mt-0.5 text-xs text-fg-subtle"
            >
              未批改 {{ ungraded }} 份
            </div>
            <div class="mt-auto flex items-center gap-1 pt-3 text-xs font-semibold">
              <span
                v-if="reportHref != null"
                class="inline-flex items-center gap-1 text-brand-600 dark:text-brand-300"
              >
                点击批改报告
                <UIcon
                  name="i-lucide-arrow-up-right"
                  class="h-[13px] w-[13px] shrink-0 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
                />
              </span>
              <span v-else class="text-fg-subtle">暂无可批改的实验</span>
            </div>
          </Card>
        </component>

        <RouterLink to="/console/checkoff" class="group block">
          <Card :index="2" hover class="flex h-full flex-col">
            <div :class="cn('flex h-10 w-10 items-center justify-center rounded-xl', TONES.amber)">
              <UIcon name="i-lucide-shield-check" class="h-[19px] w-[19px] shrink-0" />
            </div>
            <div class="mt-3 text-xs font-semibold uppercase tracking-wider text-fg-subtle">
              当前验收
            </div>
            <div class="mt-1 flex items-baseline gap-1">
              <span class="tabular text-3xl font-bold tracking-tight">
                {{ display(checkedOff, loading) }}
              </span>
              <span class="text-sm text-fg-muted">/ {{ display(total, loading) }}</span>
            </div>
            <div class="mt-auto flex items-center gap-1 pt-3 text-xs font-semibold">
              <span class="inline-flex items-center gap-1 text-brand-600 dark:text-brand-300">
                点击进行验收
                <UIcon
                  name="i-lucide-arrow-up-right"
                  class="h-[13px] w-[13px] shrink-0 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
                />
              </span>
            </div>
          </Card>
        </RouterLink>
      </div>

      <div class="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <component
          :is="pushHref ? RouterLink : 'div'"
          :to="pushHref ?? undefined"
          class="group block"
        >
          <Card :index="0" :hover="pushHref != null" class="flex h-full items-center gap-4">
            <div
              :class="
                cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-xl', TONES.purple)
              "
            >
              <UIcon name="i-lucide-upload" class="h-[19px] w-[19px] shrink-0" />
            </div>
            <div class="min-w-0 flex-1">
              <div class="text-sm font-bold">去推送成绩</div>
              <div class="truncate text-xs text-fg-subtle">
                {{ pushHref != null ? '将成绩推送至学在浙大' : '暂无可推送的实验' }}
              </div>
            </div>
            <UIcon
              v-if="pushHref != null"
              name="i-lucide-arrow-up-right"
              class="h-4 w-4 shrink-0 text-fg-subtle transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
            />
          </Card>
        </component>

        <Card :index="1" class="flex h-full flex-col">
          <div :class="cn('flex h-10 w-10 items-center justify-center rounded-xl', TONES.brand)">
            <UIcon name="i-lucide-user-check" class="h-[19px] w-[19px] shrink-0" />
          </div>
          <div class="mt-3 text-xs font-semibold uppercase tracking-wider text-fg-subtle">
            今日完成
          </div>
          <div class="mt-2 flex flex-1 flex-col justify-center gap-2">
            <div class="flex items-baseline justify-between gap-2">
              <span class="text-xs text-fg-muted">批改报告</span>
              <span class="tabular text-xl font-bold tracking-tight">
                {{ display(myReports, loading) }}
                <span class="ms-0.5 text-xs font-normal text-fg-subtle">份</span>
              </span>
            </div>
            <div class="flex items-baseline justify-between gap-2">
              <span class="text-xs text-fg-muted">验收</span>
              <span class="tabular text-xl font-bold tracking-tight">
                {{ display(myCheckoffs, loading) }}
                <span class="ms-0.5 text-xs font-normal text-fg-subtle">人</span>
              </span>
            </div>
          </div>
        </Card>

        <Card :index="2" class="flex h-full flex-col">
          <div :class="cn('flex h-10 w-10 items-center justify-center rounded-xl', TONES.amber)">
            <UIcon name="i-lucide-calendar-clock" class="h-[19px] w-[19px] shrink-0" />
          </div>
          <div class="mt-3 text-xs font-semibold uppercase tracking-wider text-fg-subtle">
            截止提醒
          </div>
          <div v-if="loading" class="mt-1 text-sm text-fg-subtle">加载中…</div>
          <div v-else-if="deadline == null" class="mt-1 text-sm text-fg-subtle">
            暂无截止时间
          </div>
          <template v-else>
            <div class="mt-1 text-xs text-fg-muted">
              {{ deadline.past ? '该实验' : `距离该实验${deadline.label}` }}
            </div>
            <div class="mt-1 text-2xl font-bold tracking-tight">
              {{ deadline.past ? `已截止 ${deadline.days} 天` : `还有 ${deadline.days} 天` }}
            </div>
          </template>
        </Card>
      </div>

      <div class="mt-4 grid gap-4 lg:grid-cols-5">
        <Card :index="3" class="flex flex-col lg:col-span-3">
          <div class="flex items-center gap-2">
            <UIcon
              name="i-lucide-bar-chart-3"
              class="h-4 w-4 shrink-0 text-brand-600 dark:text-brand-300"
            />
            <h2 class="text-sm font-bold">实验概览</h2>
            <span v-if="experiment" class="ms-auto text-xs text-fg-subtle">
              {{ experiment.mark }} · 共 {{ total ?? '—' }} 人
            </span>
          </div>
          <EChart v-if="hasChart" :option="chartOption" :height="160" class="mt-3" />
          <div v-else class="flex flex-1 items-center justify-center py-10 text-xs text-fg-subtle">
            {{ loading ? '加载中…' : '暂无可视化数据' }}
          </div>
        </Card>

        <Card :index="4" class="flex h-full flex-col lg:col-span-2">
          <div class="flex items-center gap-2">
            <UIcon
              name="i-lucide-zap"
              class="h-4 w-4 shrink-0 text-brand-600 dark:text-brand-300"
            />
            <h2 class="text-sm font-bold">快捷入口</h2>
          </div>
          <div class="mt-3 grid grid-cols-2 gap-2">
            <RouterLink
              v-for="item in quickLinks"
              :key="item.to"
              :to="item.to"
              class="flex items-center gap-2 rounded-xl border border-line px-3 py-2 text-sm transition-colors hover:border-brand-500/40 hover:bg-sunken/40"
            >
              <UIcon
                :name="item.icon"
                class="h-4 w-4 shrink-0 text-brand-600 dark:text-brand-300"
              />
              <span class="truncate font-semibold">{{ item.label }}</span>
            </RouterLink>
          </div>
        </Card>
      </div>
    </template>
  </div>
</template>
