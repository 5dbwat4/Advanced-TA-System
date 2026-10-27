<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { RouterLink } from 'vue-router'

import PageHeader from '@/components/ui/PageHeader.vue'
import Spinner from '@/components/ui/Spinner.vue'
import {
  fetchStudentOverview,
  type StudentOverview,
  type StudentOverviewExperiment,
} from '@/lib/api'
import { getErrorMessage } from '@/lib/error'
import { formatDateTime } from '@/lib/format'
import { ratioPercentages } from '@/lib/scoring'
import { SCORE_TYPES } from '@/lib/scores'
import { UIcon } from '@/ui'

const data = ref<StudentOverview | null>(null)
const error = ref<string | null>(null)
const loading = ref(true)

onMounted(async () => {
  try {
    data.value = await fetchStudentOverview()
  } catch (err) {
    error.value = getErrorMessage(err, '加载失败')
  } finally {
    loading.value = false
  }
})

function formatScore(value: number): string {
  return Number.isInteger(value) ? String(value) : String(Math.round(value * 10) / 10)
}

function scoreFor(experiment: StudentOverviewExperiment, type: number) {
  return experiment.scores.find((item) => item.type === type) ?? null
}

function scoreText(experiment: StudentOverviewExperiment, type: number): string {
  const row = scoreFor(experiment, type)
  return row ? formatScore(row.score) : '—'
}

function percentageFor(experiment: StudentOverviewExperiment, type: number): number {
  return ratioPercentages(experiment.ratio)[type] ?? 0
}
</script>

<template>
  <div class="mx-auto max-w-4xl">
    <PageHeader title="实验成绩" />

    <div v-if="loading" class="flex justify-center py-20">
      <Spinner size="lg" />
    </div>

    <div
      v-else-if="error"
      class="rounded-3xl border border-line bg-elevated/80 p-8 text-center text-sm text-danger"
    >
      {{ error }}
    </div>

    <div
      v-else-if="!data || data.experiments.length === 0"
      class="rounded-2xl border border-dashed border-line py-12 text-center text-sm text-fg-subtle"
    >
      暂无实验
    </div>

    <div v-else class="flex flex-col gap-3">
      <RouterLink
        v-for="experiment in data.experiments"
        :key="experiment.id"
        :to="`/student-console/experiments/${experiment.id}`"
        class="group rounded-2xl border border-line bg-elevated/80 p-5 shadow-lg backdrop-blur-xl transition-colors hover:border-brand-500/40"
      >
        <div class="flex items-start gap-3">
          <div
            class="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-500/10 text-brand-600 dark:text-brand-300"
          >
            <UIcon name="i-lucide-flask-conical" class="size-[18px] shrink-0" />
          </div>
          <div class="min-w-0 flex-1">
            <div class="flex items-center gap-2">
              <span class="text-xs font-semibold tracking-widest text-fg-subtle">
                {{ experiment.mark }}
              </span>
              <span
                v-if="experiment.hasReport"
                class="rounded-full bg-brand-500/10 px-2 py-0.5 text-[10px] font-semibold text-brand-600 dark:text-brand-300"
              >
                报告已批阅
              </span>
              <span
                v-if="experiment.remarkCount > 0"
                class="inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-semibold text-amber-600 dark:text-amber-300"
              >
                <UIcon name="i-lucide-message-square-text" class="size-3 shrink-0" />
                {{ experiment.remarkCount }}
              </span>
            </div>
            <div class="mt-0.5 truncate text-base font-bold">{{ experiment.title }}</div>
            <div class="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-fg-subtle">
              <span v-for="scoreType in SCORE_TYPES" :key="scoreType.value">
                {{ scoreType.label }}
                <span class="tabular font-semibold text-fg-muted">
                  {{ scoreText(experiment, scoreType.value) }}
                </span>
                <span
                  v-if="percentageFor(experiment, scoreType.value) > 0"
                  class="text-[10px]"
                >
                  ({{ percentageFor(experiment, scoreType.value) }}%)
                </span>
              </span>
            </div>
            <div class="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-fg-subtle">
              <span class="inline-flex items-center gap-1">
                <UIcon name="i-lucide-calendar-clock" class="size-3 shrink-0" />
                验收 {{ formatDateTime(experiment.checkoffDeadline) }}
              </span>
              <span class="inline-flex items-center gap-1">
                <UIcon name="i-lucide-calendar-clock" class="size-3 shrink-0" />
                报告 {{ formatDateTime(experiment.reportDeadline) }}
              </span>
            </div>
          </div>
          <div class="flex shrink-0 flex-col items-end gap-1">
            <div class="text-[10px] text-fg-subtle">总评</div>
            <div class="tabular text-2xl font-bold leading-none">
              {{ experiment.total == null ? '—' : formatScore(experiment.total) }}
            </div>
            <UIcon
              name="i-lucide-chevron-right"
              class="mt-2 size-4 text-fg-subtle transition-transform group-hover:translate-x-0.5"
            />
          </div>
        </div>
      </RouterLink>
    </div>
  </div>
</template>
