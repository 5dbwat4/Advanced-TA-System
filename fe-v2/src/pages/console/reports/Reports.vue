<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRouter } from 'vue-router'

import Card from '@/components/ui/Card.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import IconAction from '@/components/ui/IconAction.vue'
import PageHeader from '@/components/ui/PageHeader.vue'
import SkeletonList from '@/components/ui/SkeletonList.vue'
import Spinner from '@/components/ui/Spinner.vue'
import {
  fetchClassTables,
  fetchExperimentsWithCurrent,
  fetchXzzdPushPreview,
  type ClassTables,
  type Experiment,
  type ZjuamCourseStudent,
  type ZjuamHomeworkSubmission,
  type ZjuamHomeworkSyncData,
} from '@/lib/api'
import { getErrorMessage } from '@/lib/error'
import { formatBytes, formatDateTime } from '@/lib/format'
import { useCurrentClassComputed } from '@/lib/store'
import { toast } from '@/lib/toast'
import { UAlert, UButton, UIcon, USelect } from '@/ui'

const HEAD_CLASS =
  'sticky top-0 z-10 border-b border-r border-line bg-elevated px-4 py-2 font-semibold'
const CELL_CLASS = 'border-b border-r border-line px-4 py-2'

const currentClass = useCurrentClassComputed()
const classId = computed(() => currentClass.value?.id ?? null)
const router = useRouter()

const experiments = ref<Experiment[]>([])
const selectedId = ref<string | null>(null)
const loading = ref(true)

const submissions = ref<ZjuamHomeworkSyncData | null>(null)
const submissionsLoading = ref(false)
const submissionsError = ref<string | null>(null)
const reloadKey = ref(0)

const classTables = ref<ClassTables | null>(null)

const experimentItems = computed(() =>
  experiments.value.map((experiment) => ({
    label: `${experiment.mark} · ${experiment.title}`,
    value: experiment.id,
  })),
)

const studentsById = computed(
  () =>
    new Map<number, ZjuamCourseStudent>(
      (submissions.value?.students ?? []).map((item) => [item.id, item]),
    ),
)

const submittedRows = computed(() => {
  const rows = submissions.value?.submissions ?? []
  return [...rows].sort((a, b) => {
    const noA =
      a.created_by?.id == null ? '' : (studentsById.value.get(a.created_by.id)?.studentId ?? '')
    const noB =
      b.created_by?.id == null ? '' : (studentsById.value.get(b.created_by.id)?.studentId ?? '')
    return noA.localeCompare(noB)
  })
})

const reportStats = computed(() => {
  const data = submissions.value
  if (!data) return null

  const submittedPersonIds = new Set<number>()
  for (const row of data.submissions) {
    if (row.created_by?.id != null) submittedPersonIds.add(row.created_by.id)
  }
  const submitted = submittedPersonIds.size

  const localStudents = classTables.value?.students
  const localScores = classTables.value?.scores
  if (!localStudents || !localScores) {
    return { submitted, graded: null, remaining: null }
  }

  const userIdByNo = new Map(localStudents.map((student) => [student.studentId, student.userId]))
  const gradedStuIds = new Set(
    localScores
      .filter((score) => score.type === 2 && score.indId === selectedId.value)
      .map((score) => score.userId),
  )

  let graded = 0
  for (const personId of submittedPersonIds) {
    const studentId = studentsById.value.get(personId)?.studentId
    const userId = studentId ? userIdByNo.get(studentId) : undefined
    if (userId && gradedStuIds.has(userId)) graded += 1
  }

  return { submitted, graded, remaining: submitted - graded }
})

function onSelectExperiment(value: unknown) {
  selectedId.value = value == null || value === '' ? null : String(value)
}

function reloadSubmissions() {
  reloadKey.value += 1
}

watch(
  classId,
  (id) => {
    if (!id) return
    let cancelled = false
    loading.value = true
    selectedId.value = null
    fetchExperimentsWithCurrent(id)
      .then((res) => {
        if (cancelled) return
        experiments.value = res.experiments
        const current = res.currentMark
          ? res.experiments.find((item) => item.mark === res.currentMark)
          : undefined
        selectedId.value = current?.id ?? null
      })
      .catch((error) => {
        if (!cancelled) toast.error(getErrorMessage(error, '加载失败'))
      })
      .finally(() => {
        if (!cancelled) loading.value = false
      })
    return () => {
      cancelled = true
    }
  },
  { immediate: true },
)

watch(
  [selectedId, reloadKey],
  ([id]) => {
    if (!id) {
      submissions.value = null
      submissionsError.value = null
      submissionsLoading.value = false
      return
    }
    let cancelled = false
    submissionsLoading.value = true
    submissionsError.value = null
    fetchXzzdPushPreview(id, 'report')
      .then((payload) => {
        if (!cancelled) submissions.value = payload
      })
      .catch((error) => {
        if (!cancelled) {
          submissions.value = null
          submissionsError.value = getErrorMessage(error, '获取提交列表失败')
        }
      })
      .finally(() => {
        if (!cancelled) submissionsLoading.value = false
      })
    return () => {
      cancelled = true
    }
  },
  { immediate: true },
)

watch(
  classId,
  (id) => {
    if (!id) {
      classTables.value = null
      return
    }
    let cancelled = false
    fetchClassTables(id)
      .then((tables) => {
        if (!cancelled) classTables.value = tables
      })
      .catch((error) => {
        if (!cancelled) {
          classTables.value = null
          toast.error(getErrorMessage(error, '加载成绩失败'))
        }
      })
    return () => {
      cancelled = true
    }
  },
  { immediate: true },
)
</script>

<template>
  <div v-if="!currentClass" class="mx-auto max-w-6xl">
    <PageHeader title="实验报告" />
    <EmptyState icon="i-lucide-school" title="尚未绑定班级" hint="请先在设置中绑定班级" />
  </div>

  <div v-else class="mx-auto max-w-6xl">
    <PageHeader title="实验报告">
      <template #actions>
        <div class="flex items-center gap-2">
          <USelect
            class="w-64"
            aria-label="选择实验"
            placeholder="选择实验"
            :disabled="loading || experiments.length === 0"
            :model-value="selectedId ?? ''"
            :items="experimentItems"
            @update:model-value="onSelectExperiment"
          />
          <Spinner v-if="loading" size="sm" />
        </div>
      </template>
    </PageHeader>

    <div v-if="experiments.length === 0">
      <EmptyState
        v-if="!loading"
        icon="i-lucide-construction"
        title="暂无实验"
        hint="请先在实验页创建实验"
      />
    </div>

    <div v-else class="flex flex-col gap-4">
      <Card :index="0">
        <div class="flex flex-wrap items-center gap-2">
          <UIcon
            name="i-lucide-clipboard-check"
            class="h-4 w-4 shrink-0 text-brand-600 dark:text-brand-300"
          />
          <h2 class="text-sm font-bold">报告批改</h2>
          <UButton
            class="ms-auto"
            size="sm"
            :disabled="!selectedId"
            @click="selectedId && router.push(`/console/reports/${selectedId}`)"
          >
            进入批改
          </UButton>
        </div>

        <div class="mt-4 grid grid-cols-3 divide-x divide-line rounded-xl border border-line">
          <div class="px-4 py-3 text-center">
            <div class="text-[11px] font-semibold text-fg-subtle">已提交</div>
            <div class="tabular mt-1 text-2xl font-bold text-brand-600 dark:text-brand-300">
              {{ reportStats?.submitted ?? '—' }}
              <span
                v-if="reportStats?.submitted != null"
                class="ms-1 text-xs font-normal text-fg-subtle"
                >人</span
              >
            </div>
          </div>
          <div class="px-4 py-3 text-center">
            <div class="text-[11px] font-semibold text-fg-subtle">已批改</div>
            <div class="tabular mt-1 text-2xl font-bold text-emerald-600 dark:text-emerald-400">
              {{ reportStats?.graded ?? '—' }}
              <span
                v-if="reportStats?.graded != null"
                class="ms-1 text-xs font-normal text-fg-subtle"
                >人</span
              >
            </div>
          </div>
          <div class="px-4 py-3 text-center">
            <div class="text-[11px] font-semibold text-fg-subtle">剩余</div>
            <div class="tabular mt-1 text-2xl font-bold text-amber-600 dark:text-amber-400">
              {{ reportStats?.remaining ?? '—' }}
              <span
                v-if="reportStats?.remaining != null"
                class="ms-1 text-xs font-normal text-fg-subtle"
                >人</span
              >
            </div>
          </div>
        </div>
      </Card>

      <Card :index="1">
        <div class="flex flex-wrap items-center gap-2">
          <UIcon
            name="i-lucide-file-text"
            class="h-4 w-4 shrink-0 text-brand-600 dark:text-brand-300"
          />
          <h2 class="text-sm font-bold">当前实验已提交列表</h2>
          <span v-if="submissions" class="tabular text-[11px] text-fg-subtle">
            共 {{ submissions.submissions.length }} 条
          </span>
          <div class="ms-auto flex items-center gap-2">
            <IconAction
              label="刷新"
              tooltip="重新获取"
              placement="bottom"
              variant="soft"
              :disabled="!selectedId || submissionsLoading"
              @click="reloadSubmissions"
            >
              <UIcon name="i-lucide-refresh-cw" class="h-4 w-4 shrink-0" />
            </IconAction>
            <Spinner v-if="submissionsLoading" size="sm" />
          </div>
        </div>

        <div class="mt-4">
          <p v-if="!selectedId" class="text-xs text-fg-subtle">
            请选择实验以查看报告提交情况。
          </p>
          <UAlert
            variant="subtle"
            v-else-if="submissionsError"
            color="error"
            :description="submissionsError"
          />
          <SkeletonList v-else-if="submissionsLoading && !submissions" :rows="3" class="h-10" />
          <p v-else-if="submittedRows.length === 0" class="text-xs text-fg-subtle">
            暂无提交记录。
          </p>
          <div v-else class="overflow-auto rounded-2xl border border-line">
            <table class="w-full border-collapse text-sm">
              <thead>
                <tr>
                  <th :class="`${HEAD_CLASS} text-left`">学号</th>
                  <th :class="`${HEAD_CLASS} text-left`">姓名</th>
                  <th :class="`${HEAD_CLASS} text-left`">提交时间</th>
                  <th :class="`${HEAD_CLASS} text-right`">附件大小</th>
                  <th :class="`${HEAD_CLASS} border-r-0 text-left`">提交 ID</th>
                </tr>
              </thead>
              <tbody>
                <tr
                  v-for="item in submittedRows"
                  :key="item.id"
                  class="transition-colors hover:bg-sunken/40"
                >
                  <td :class="`${CELL_CLASS} tabular`">
                    {{
                      item.created_by?.id != null
                        ? (studentsById.get(item.created_by.id)?.studentId ?? '—')
                        : '—'
                    }}
                  </td>
                  <td :class="CELL_CLASS">
                    {{
                      item.created_by?.id != null
                        ? (studentsById.get(item.created_by.id)?.name ??
                          item.created_by.id ??
                          '—')
                        : '—'
                    }}
                  </td>
                  <td :class="`${CELL_CLASS} tabular`">{{ formatDateTime(item.created_at) }}</td>
                  <td :class="`${CELL_CLASS} tabular text-right`">
                    {{ formatBytes(item.attachments_size) }}
                  </td>
                  <td :class="`${CELL_CLASS} tabular border-r-0 text-fg-subtle`">{{ item.id }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </Card>
    </div>
  </div>
</template>
