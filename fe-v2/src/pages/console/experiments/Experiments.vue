<script setup lang="ts">
import { computed, ref, watch } from 'vue'

import DateTimePicker from '@/components/ui/DateTimePicker.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import PageHeader from '@/components/ui/PageHeader.vue'
import PendingButton from '@/components/ui/PendingButton.vue'
import SkeletonList from '@/components/ui/SkeletonList.vue'
import { apiFetch, updateExperiment, type Experiment } from '@/lib/api'
import { getErrorMessage } from '@/lib/error'
import {
  experimentTimeline,
  formatTimelineTime,
  type ExperimentTimelineStatus,
} from '@/lib/experiments'
import { formatDateTime } from '@/lib/format'
import { useCurrentClassComputed } from '@/lib/store'
import { toast } from '@/lib/toast'
import {
  UBadge,
  UButton,
  UIcon,
  UInput,
  UModal,
  UTooltip,
} from '@/ui'

const currentClass = useCurrentClassComputed()
const classId = computed(() => currentClass.value?.id ?? null)

const experiments = ref<Experiment[]>([])
const loading = ref(true)

const formOpen = ref(false)
const editing = ref<Experiment | null>(null)
const mark = ref('')
const title = ref('')
const publishTime = ref<string | null>(null)
const checkoffDeadline = ref<string | null>(null)
const reportDeadline = ref<string | null>(null)
const saving = ref(false)

const statusBadgeColor: Record<ExperimentTimelineStatus['color'], 'neutral' | 'warning' | 'success'> = {
  default: 'neutral',
  warning: 'warning',
  success: 'success',
}

async function reload() {
  try {
    const data = await apiFetch<{ experiments: Experiment[] }>('/api/experiments')
    experiments.value = data.experiments
  } catch (error) {
    toast.error(getErrorMessage(error, '加载失败'))
  }
}

async function load() {
  loading.value = true
  try {
    const data = await apiFetch<{ experiments: Experiment[] }>('/api/experiments')
    experiments.value = data.experiments
  } catch (error) {
    toast.error(getErrorMessage(error, '加载失败'))
  } finally {
    loading.value = false
  }
}

watch(
  () => classId.value,
  () => {
    void load()
  },
  { immediate: true },
)

const visible = computed(() =>
  classId.value
    ? experiments.value.filter((exp) => exp.classId === classId.value)
    : experiments.value,
)

function timelineFor(experiment: Experiment) {
  return experimentTimeline(experiment)
}

function statusFor(experiment: Experiment) {
  return experimentTimeline(experiment).status
}

function resetDraft() {
  mark.value = ''
  title.value = ''
  publishTime.value = null
  checkoffDeadline.value = null
  reportDeadline.value = null
}

function openCreate() {
  editing.value = null
  resetDraft()
  formOpen.value = true
}

function openEdit(experiment: Experiment) {
  editing.value = experiment
  mark.value = experiment.mark
  title.value = experiment.title
  publishTime.value = experiment.publishTime
  checkoffDeadline.value = experiment.checkoffDeadline
  reportDeadline.value = experiment.reportDeadline
  formOpen.value = true
}

watch(formOpen, (open) => {
  if (!open) editing.value = null
})

async function submit() {
  if (!mark.value.trim() || !title.value.trim()) return
  saving.value = true
  try {
    const body = {
      mark: mark.value.trim(),
      title: title.value.trim(),
      publishTime: publishTime.value,
      checkoffDeadline: checkoffDeadline.value,
      reportDeadline: reportDeadline.value,
    }
    if (editing.value) {
      await updateExperiment(editing.value.id, body)
      toast.success('已保存实验')
    } else {
      if (!classId.value) return
      await apiFetch<{ experiment: Experiment }>('/api/experiments', {
        method: 'POST',
        body: JSON.stringify({ ...body, classId: classId.value }),
      })
      toast.success('已添加实验')
    }
    resetDraft()
    formOpen.value = false
    await reload()
  } catch (error) {
    toast.error(getErrorMessage(error, editing.value ? '保存失败' : '创建失败'))
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <div class="mx-auto max-w-5xl">
    <PageHeader title="实验">
      <template #actions>
        <UButton color="primary" size="lg" @click="openCreate">
          <UIcon name="i-lucide-plus" class="h-4 w-4 shrink-0" />
          新建实验
        </UButton>
      </template>
    </PageHeader>

    <SkeletonList v-if="loading" :rows="4" class="h-20 rounded-2xl" />

    <EmptyState
      v-else-if="visible.length === 0"
      icon="i-lucide-flask-conical"
      title="暂无实验"
      hint="点击右上角新建实验"
    />

    <div v-else class="overflow-hidden rounded-2xl border border-line">
      <table class="w-full border-collapse text-sm">
        <thead>
          <tr class="bg-elevated">
            <th class="border-b border-line px-4 py-2.5 text-left font-semibold">实验编号</th>
            <th class="border-b border-line px-4 py-2.5 text-left font-semibold">实验标题</th>
            <th class="border-b border-line px-4 py-2.5 text-left font-semibold">状态</th>
            <th class="hidden border-b border-line px-4 py-2.5 text-left font-semibold md:table-cell">
              验收截止
            </th>
            <th class="hidden border-b border-line px-4 py-2.5 text-left font-semibold lg:table-cell">
              报告截止
            </th>
            <th class="border-b border-line px-4 py-2.5 text-right font-semibold">操作</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="exp in visible"
            :key="exp.id"
            class="transition-colors hover:bg-sunken/40"
          >
            <td class="border-b border-line px-4 py-3 align-middle">
              <span
                class="tabular rounded-lg bg-brand-500/10 px-2.5 py-1 text-xs font-bold text-brand-600 dark:text-brand-300"
              >
                {{ exp.mark }}
              </span>
            </td>
            <td class="border-b border-line px-4 py-3 align-middle">
              <RouterLink
                :to="`/console/experiments/${exp.id}`"
                class="font-bold transition-colors hover:text-brand-600 dark:hover:text-brand-300"
              >
                {{ exp.title }}
              </RouterLink>
            </td>
            <td class="border-b border-line px-4 py-3 align-middle">
              <UTooltip>
                <UBadge
                  :color="statusBadgeColor[statusFor(exp).color]"
                  variant="soft"
                  size="sm"
                >
                  {{ statusFor(exp).label }}
                </UBadge>
                <template #content>
                  <div class="flex max-w-[16rem] flex-col gap-2">
                    <div class="text-xs font-bold">实验时间线</div>
                    <div
                      v-if="timelineFor(exp).events.length === 0"
                      class="text-[11px] text-fg-subtle"
                    >
                      尚未设置时间线，可在实验详情页设置
                    </div>
                    <ol v-else class="flex flex-col gap-1.5">
                      <li
                        v-for="event in timelineFor(exp).events"
                        :key="`${event.label}-${event.time}`"
                        class="flex flex-col"
                      >
                        <span
                          class="text-[11px] font-semibold"
                          :class="
                            event.today
                              ? 'text-amber-600 dark:text-amber-400'
                              : event.past
                                ? 'text-fg-subtle'
                                : 'text-fg'
                          "
                        >
                          {{ event.label }}
                        </span>
                        <span class="tabular text-[11px] text-fg-subtle">
                          {{ formatTimelineTime(event.time) }}
                        </span>
                      </li>
                    </ol>
                  </div>
                </template>
              </UTooltip>
            </td>
            <td class="tabular hidden border-b border-line px-4 py-3 align-middle text-fg-muted md:table-cell">
              {{ formatDateTime(exp.checkoffDeadline, '—') }}
            </td>
            <td class="tabular hidden border-b border-line px-4 py-3 align-middle text-fg-muted lg:table-cell">
              {{ formatDateTime(exp.reportDeadline, '—') }}
            </td>
            <td class="border-b border-line px-4 py-3 align-middle">
              <div class="flex items-center justify-end gap-1">
                <UButton
                  color="neutral"
                  variant="ghost"
                  size="xs"
                  :to="`/console/remarks/experiments/${exp.id}`"
                >
                  <UIcon name="i-lucide-notebook-text" class="h-3.5 w-3.5 shrink-0" />
                  评语
                </UButton>
                <UButton
                  color="neutral"
                  variant="ghost"
                  size="xs"
                  :to="`/console/experiments/${exp.id}/xzzd-push`"
                >
                  <UIcon name="i-lucide-upload" class="h-3.5 w-3.5 shrink-0" />
                  推送
                </UButton>
                <UButton
                  color="neutral"
                  variant="ghost"
                  size="xs"
                  square
                  aria-label="编辑实验"
                  @click="openEdit(exp)"
                >
                  <UIcon name="i-lucide-pen" class="h-3.5 w-3.5 shrink-0" />
                </UButton>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <UModal
      v-model:open="formOpen"
      :title="editing ? '编辑实验' : '新建实验'"
      :dismissible="!saving"
      :ui="{ content: 'sm:max-w-2xl' }"
    >
      <template #body>
        <div class="flex flex-col gap-4">
          <div class="grid gap-4 sm:grid-cols-2">
            <div class="flex flex-col gap-1.5">
              <label class="text-xs font-semibold text-fg-muted">实验编号</label>
              <UInput
                v-model="mark"
                class="tabular w-full"
                placeholder="Lab 0"
                maxlength="32"
                autofocus
              />
            </div>
            <div class="flex flex-col gap-1.5">
              <label class="text-xs font-semibold text-fg-muted">实验标题</label>
              <UInput v-model="title" class="w-full" placeholder="五级流水线" maxlength="64" />
            </div>
          </div>

          <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <DateTimePicker v-model="publishTime" label="公开时间" />
            <DateTimePicker v-model="checkoffDeadline" label="验收截止时间" />
            <DateTimePicker v-model="reportDeadline" label="报告提交截止时间" />
          </div>

          <div class="flex items-center gap-2 rounded-xl bg-sunken px-4 py-2.5 text-xs text-fg-subtle">
            <UIcon name="i-lucide-graduation-cap" class="h-3.5 w-3.5 shrink-0" />
            归属课程：{{ currentClass?.name ?? '未选择课程' }}
          </div>
        </div>
      </template>
      <template #footer>
        <UButton color="neutral" variant="soft" :disabled="saving" @click="formOpen = false">
          取消
        </UButton>
        <PendingButton
          color="primary"
          :icon="editing ? 'i-lucide-check' : 'i-lucide-plus'"
          :loading="saving"
          :loading-label="editing ? '保存中' : '添加中'"
          :disabled="!currentClass || !mark.trim() || !title.trim()"
          @click="submit"
        >
          {{ editing ? '保存实验' : '添加实验' }}
        </PendingButton>
      </template>
    </UModal>
  </div>
</template>
