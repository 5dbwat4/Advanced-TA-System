<script setup lang="ts">
import { computed, onUnmounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import EmptyState from '@/components/ui/EmptyState.vue'
import IconAction from '@/components/ui/IconAction.vue'
import PageHeader from '@/components/ui/PageHeader.vue'
import SkeletonList from '@/components/ui/SkeletonList.vue'
import {
  apiFetch,
  fetchCheckoff,
  fetchExperimentRemarks,
  REMARK_TYPE_CHECKOFF,
  REMARK_TYPE_REPORT,
  saveRemark,
  type CheckoffStudent,
  type Experiment,
} from '@/lib/api'
import { getErrorMessage } from '@/lib/error'
import { toast } from '@/lib/toast'
import { UIcon, UTextarea } from '@/ui'

const REMARK_COLUMNS: Array<{ type: number; label: string }> = [
  { type: REMARK_TYPE_CHECKOFF, label: '验收评语' },
  { type: REMARK_TYPE_REPORT, label: '报告评语' },
]

function remarkKey(userId: string, type: number): string {
  return `${userId}:${type}`
}

const route = useRoute()
const router = useRouter()
const experimentId = computed(() => String(route.params.id ?? ''))

const experiment = ref<Experiment | null>(null)
const students = ref<CheckoffStudent[]>([])
const loading = ref(true)

const drafts = ref<Record<string, string>>({})
const saved = ref<Record<string, string>>({})
const savingKeys = ref<Record<string, boolean>>({})
const timers = new Map<string, number>()

function clearTimers() {
  for (const timer of timers.values()) window.clearTimeout(timer)
  timers.clear()
}

function draftFor(userId: string, type: number): string {
  return drafts.value[remarkKey(userId, type)] ?? ''
}

function isSaving(userId: string, type: number): boolean {
  return savingKeys.value[remarkKey(userId, type)] === true
}

function scheduleSave(userId: string, type: number) {
  const key = remarkKey(userId, type)
  const existing = timers.get(key)
  if (existing) window.clearTimeout(existing)
  timers.set(
    key,
    window.setTimeout(() => {
      timers.delete(key)
      void persist(userId, type)
    }, 800),
  )
}

function onInput(userId: string, type: number, value: string) {
  drafts.value = { ...drafts.value, [remarkKey(userId, type)]: value }
  scheduleSave(userId, type)
}

async function persist(userId: string, type: number) {
  const key = remarkKey(userId, type)
  const pending = timers.get(key)
  if (pending) {
    window.clearTimeout(pending)
    timers.delete(key)
  }
  const value = drafts.value[key] ?? ''
  if (value === (saved.value[key] ?? '')) return
  savingKeys.value = { ...savingKeys.value, [key]: true }
  try {
    await saveRemark({ userId, experimentId: experimentId.value, type, text: value })
    saved.value = { ...saved.value, [key]: value }
  } catch (error) {
    toast.error(getErrorMessage(error, '附言保存失败'))
  } finally {
    savingKeys.value = { ...savingKeys.value, [key]: false }
  }
}

async function load() {
  clearTimers()
  savingKeys.value = {}
  drafts.value = {}
  saved.value = {}
  if (!experimentId.value) {
    loading.value = false
    return
  }
  loading.value = true
  try {
    const { experiment: exp } = await apiFetch<{ experiment: Experiment }>(
      `/api/experiments/${experimentId.value}`,
    )
    const [checkoff, remarkList] = await Promise.all([
      fetchCheckoff({ classId: exp.classId, experimentId: experimentId.value }),
      fetchExperimentRemarks(experimentId.value),
    ])
    experiment.value = exp
    students.value = checkoff.students
    const nextDrafts: Record<string, string> = {}
    const nextSaved: Record<string, string> = {}
    for (const item of remarkList) {
      const key = remarkKey(item.userId, item.type)
      nextDrafts[key] = item.text
      nextSaved[key] = item.text
    }
    drafts.value = nextDrafts
    saved.value = nextSaved
  } catch (error) {
    toast.error(getErrorMessage(error, '加载失败'))
  } finally {
    loading.value = false
  }
}

watch(
  experimentId,
  () => {
    void load()
  },
  { immediate: true },
)

onUnmounted(clearTimers)

function goBack() {
  void router.push(
    experimentId.value
      ? `/console/experiments/${experimentId.value}`
      : '/console/experiments',
  )
}
</script>

<template>
  <div class="mx-auto max-w-5xl">
    <PageHeader title="查看评语">
      <template v-if="experiment" #subtitle>
        <span class="inline-flex items-center gap-1.5">
          <UIcon name="i-lucide-notebook-text" class="h-3.5 w-3.5 shrink-0" />
          {{ experiment.mark }} · {{ experiment.title }}
        </span>
      </template>
      <template #actions>
        <IconAction label="返回实验" @click="goBack">
          <UIcon name="i-lucide-arrow-left" class="h-[15px] w-[15px] shrink-0" />
        </IconAction>
      </template>
    </PageHeader>

    <SkeletonList v-if="loading" :rows="8" class="h-16 rounded-xl" />

    <EmptyState
      v-else-if="students.length === 0"
      icon="i-lucide-users"
      title="暂无学生"
      hint="请先到「分数和名单」导入学生名单"
    />

    <div v-else class="max-h-[75vh] overflow-auto rounded-2xl border border-line">
      <table class="w-full border-collapse text-sm">
        <thead>
          <tr>
            <th
              class="sticky left-0 top-0 z-30 w-44 border-b border-r border-line bg-elevated px-4 py-2 text-left font-semibold"
            >
              学生
            </th>
            <th
              v-for="col in REMARK_COLUMNS"
              :key="col.type"
              class="sticky top-0 z-20 border-b border-r border-line bg-elevated px-4 py-2 text-left font-semibold last:border-r-0"
            >
              {{ col.label }}
            </th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="student in students" :key="student.userId" class="align-top">
            <td class="sticky left-0 z-10 border-b border-r border-line bg-elevated px-4 py-3">
              <div class="font-bold">{{ student.name }}</div>
              <div class="tabular text-xs text-fg-muted">{{ student.studentId }}</div>
            </td>
            <td
              v-for="col in REMARK_COLUMNS"
              :key="col.type"
              class="border-b border-r border-line p-2 last:border-r-0"
            >
              <div class="flex flex-col gap-1">
                <UTextarea
                  :model-value="draftFor(student.userId, col.type)"
                  :rows="2"
                  placeholder="—"
                  aria-label="评语"
                  class="w-full resize-y"
                  @update:model-value="
                    (value) => onInput(student.userId, col.type, String(value ?? ''))
                  "
                  @blur="persist(student.userId, col.type)"
                />
                <span v-if="isSaving(student.userId, col.type)" class="text-[11px] text-fg-subtle">
                  保存中…
                </span>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>
