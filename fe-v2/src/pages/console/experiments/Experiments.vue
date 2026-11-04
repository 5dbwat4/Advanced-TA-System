<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'

import ExperimentGantt from '@/components/experiments/ExperimentGantt.vue'
import Card from '@/components/ui/Card.vue'
import DateTimePicker from '@/components/ui/DateTimePicker.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import PageHeader from '@/components/ui/PageHeader.vue'
import PendingButton from '@/components/ui/PendingButton.vue'
import SkeletonList from '@/components/ui/SkeletonList.vue'
import {
  apiFetch,
  fetchClassSettings,
  updateClassSettings,
  updateExperiment,
  type Experiment,
} from '@/lib/api'
import { getErrorMessage } from '@/lib/error'
import {
  experimentTimeline,
  formatTimelineTime,
  type ExperimentTimelineStatus,
} from '@/lib/experiments'
import { formatDateTime } from '@/lib/format'
import { resolveScoreRatio, sanitizeScoreRatio } from '@/lib/scoring'
import { useCurrentClassComputed } from '@/lib/store'
import { toast } from '@/lib/toast'
import {
  UAlert,
  UBadge,
  UButton,
  UFileUpload,
  UIcon,
  UInput,
  UModal,
  USwitch,
  UTabs,
  UTooltip,
} from '@/ui'

const router = useRouter()
const currentClass = useCurrentClassComputed()
const classId = computed(() => currentClass.value?.id ?? null)

const experiments = ref<Experiment[]>([])
const loading = ref(true)

const formOpen = ref(false)
const transferOpen = ref(false)
const transferTab = ref<'export' | 'import'>('export')
const exporting = ref(false)
const editing = ref<Experiment | null>(null)

const transferTabs = [
  { label: '导出', value: 'export', icon: 'i-lucide-download' },
  { label: '导入', value: 'import', icon: 'i-lucide-upload' },
]

type ImportExperiment = {
  mark: string
  title: string
  scoreRatio?: [number, number, number]
  publishTime: string | null
  checkoffDeadline: string | null
  reportDeadline: string | null
}

const importFile = ref<File | null>(null)
const importText = ref('')
const importItems = ref<ImportExperiment[] | null>(null)
const importError = ref<string | null>(null)
const importing = ref(false)
const applyRatios = ref(true)
const hasImportRatios = computed(() =>
  Boolean(importItems.value?.some((item) => item.scoreRatio)),
)
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

function openExperiment(id: string) {
  void router.push(`/console/experiments/${id}`)
}

function downloadJson(filename: string, data: unknown) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.click()
  URL.revokeObjectURL(url)
}

async function exportExperiments() {
  if (!classId.value) return
  exporting.value = true
  try {
    const { settings } = await fetchClassSettings(classId.value)
    const payload = {
      version: 1,
      exportedAt: new Date().toISOString(),
      class: { id: classId.value, name: currentClass.value?.name ?? null },
      experiments: visible.value.map((exp) => ({
        id: exp.id,
        mark: exp.mark,
        title: exp.title,
        scoreRatio: resolveScoreRatio(settings, exp.id),
        publishTime: exp.publishTime,
        checkoffDeadline: exp.checkoffDeadline,
        reportDeadline: exp.reportDeadline,
      })),
    }
    const base = (currentClass.value?.name?.trim() || 'experiments').replace(
      /[\\/:*?"<>|]/g,
      '_',
    )
    downloadJson(`${base}-实验列表.json`, payload)
    toast.success('已导出实验列表')
  } catch (error) {
    toast.error(getErrorMessage(error, '导出失败'))
  } finally {
    exporting.value = false
  }
}

function normalizeImportDate(value: unknown, label: string): string | null {
  if (value == null || value === '') return null
  if (typeof value !== 'string') throw new Error(`${label}格式不正确`)
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) throw new Error(`${label}格式不正确`)
  return date.toISOString()
}

function parseImportJson(text: string): ImportExperiment[] {
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    throw new Error('JSON 解析失败，请检查格式')
  }

  const list = Array.isArray(raw)
    ? raw
    : raw && typeof raw === 'object' && Array.isArray((raw as { experiments?: unknown }).experiments)
      ? ((raw as { experiments: unknown[] }).experiments)
      : null
  if (!list) throw new Error('缺少 experiments 数组')

  return list.map((value, index) => {
    const prefix = `第 ${index + 1} 个实验`
    if (!value || typeof value !== 'object') throw new Error(`${prefix}格式不正确`)
    const record = value as Record<string, unknown>
    const mark = typeof record.mark === 'string' ? record.mark.trim() : ''
    const title = typeof record.title === 'string' ? record.title.trim() : ''
    if (!mark) throw new Error(`${prefix}缺少编号 mark`)
    if (!title) throw new Error(`${prefix}缺少名称 title`)
    const scoreRatio =
      Array.isArray(record.scoreRatio) && record.scoreRatio.length === 3
        ? sanitizeScoreRatio(record.scoreRatio)
        : undefined
    return {
      mark,
      title,
      scoreRatio,
      publishTime: normalizeImportDate(record.publishTime, `${prefix}的 publishTime`),
      checkoffDeadline: normalizeImportDate(
        record.checkoffDeadline,
        `${prefix}的 checkoffDeadline`,
      ),
      reportDeadline: normalizeImportDate(record.reportDeadline, `${prefix}的 reportDeadline`),
    }
  })
}

function acceptImportText(text: string) {
  const trimmed = text.trim()
  if (!trimmed) {
    importItems.value = null
    importError.value = null
    return
  }
  try {
    importItems.value = parseImportJson(trimmed)
    importError.value = null
  } catch (error) {
    importItems.value = null
    importError.value = getErrorMessage(error, '解析失败')
  }
}

watch(importText, (value) => acceptImportText(value))

watch(importFile, (file) => {
  if (!file) return
  void file
    .text()
    .then((text) => {
      importText.value = text
    })
    .catch(() => {
      importError.value = '读取文件失败'
    })
})

function handleDocumentPaste(event: ClipboardEvent) {
  if (!transferOpen.value || transferTab.value !== 'import') return
  const text = event.clipboardData?.getData('text/plain')
  if (!text?.trim()) return
  event.preventDefault()
  importText.value = text
}

onMounted(() => document.addEventListener('paste', handleDocumentPaste))
onUnmounted(() => document.removeEventListener('paste', handleDocumentPaste))

function clearImport() {
  importFile.value = null
  importText.value = ''
  importItems.value = null
  importError.value = null
}

async function runImport() {
  if (!classId.value || !importItems.value) return
  importing.value = true
  try {
    const byMark = new Map(visible.value.map((exp) => [exp.mark, exp]))
    const ratios: Record<string, number[]> = {}
    let created = 0
    let updated = 0

    for (const item of importItems.value) {
      const body = {
        mark: item.mark,
        title: item.title,
        publishTime: item.publishTime,
        checkoffDeadline: item.checkoffDeadline,
        reportDeadline: item.reportDeadline,
      }
      const match = byMark.get(item.mark)
      let target: Experiment
      if (match) {
        const response = await updateExperiment(match.id, body)
        target = response.experiment
        updated += 1
      } else {
        const response = await apiFetch<{ experiment: Experiment }>('/api/experiments', {
          method: 'POST',
          body: JSON.stringify({ ...body, classId: classId.value }),
        })
        target = response.experiment
        created += 1
      }
      byMark.set(target.mark, target)
      if (applyRatios.value && item.scoreRatio) ratios[target.id] = item.scoreRatio
    }

    if (Object.keys(ratios).length > 0) {
      await updateClassSettings(classId.value, { experimentScoreRatios: ratios })
    }

    toast.success(`导入完成：新建 ${created} 个，更新 ${updated} 个`)
    clearImport()
    transferOpen.value = false
    await reload()
  } catch (error) {
    toast.error(getErrorMessage(error, '导入失败'))
  } finally {
    importing.value = false
  }
}

function buildAgentPrompt() {
  return `你是一个实验配置助手。请先向我逐个询问每个实验的以下信息，不要自行编造时间，必须等我确认：
1. 编号 mark（例如 Lab 0）
2. 名称 title
3. 分值 scoreRatio：三个非负整数，依次对应功能测试 / 验收问答 / 报告
4. 公开时间 publishTime
5. 验收截止时间 checkoffDeadline
6. 报告提交截止时间 reportDeadline

时间使用带时区的 ISO 8601 格式（例如 2026-11-05T23:59:00+08:00），未设置填 null。最终只输出如下 JSON，不要附加解释：
{
  "version": 1,
  "experiments": [
    {
      "mark": "Lab 0",
      "title": "单周期处理器设计",
      "scoreRatio": [2, 5, 0],
      "publishTime": null,
      "checkoffDeadline": null,
      "reportDeadline": null
    }
  ]
}`
}

async function copyAgentPrompt() {
  try {
    await navigator.clipboard.writeText(buildAgentPrompt())
    toast.success('已复制提示词，请粘贴给 AI Agent')
  } catch {
    toast.error('复制失败，请检查浏览器权限')
  }
}

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
        <UButton color="neutral" variant="soft" size="lg" @click="transferOpen = true">
          <UIcon name="i-lucide-arrow-up-down" class="h-4 w-4 shrink-0" />
          导入 / 导出
        </UButton>
        <UButton color="primary" size="lg" @click="openCreate">
          <UIcon name="i-lucide-plus" class="h-4 w-4 shrink-0" />
          新建实验
        </UButton>
      </template>
    </PageHeader>

    <div v-if="!loading && visible.length > 0" class="mb-6">
      <ExperimentGantt :experiments="visible" clickable @select="openExperiment" />
    </div>

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
      v-model:open="transferOpen"
      title="导入 / 导出实验列表"
      :ui="{ content: 'sm:max-w-4xl' }"
    >
      <template #body>
        <UTabs v-model="transferTab" :items="transferTabs" variant="pill">
          <template #content="{ item }">
            <div v-if="item.value === 'export'" class="flex flex-col gap-3 pt-4">
              <div class="rounded-xl border border-line bg-sunken/50 px-4 py-3 text-xs text-fg-muted">
                共 {{ visible.length }} 个实验
              </div>
              <div>
                <PendingButton
                  color="primary"
                  icon="i-lucide-download"
                  :loading="exporting"
                  loading-label="导出中"
                  :disabled="!classId || visible.length === 0"
                  @click="exportExperiments"
                >
                  导出 JSON
                </PendingButton>
              </div>
            </div>
            <div v-else class="flex flex-col gap-3 pt-4">
              <Card class="flex flex-col gap-3">
                <div class="flex items-center justify-between gap-3">
                  <div class="flex items-center gap-2 text-sm font-bold">
                    <UIcon
                      name="i-lucide-sparkles"
                      class="size-4 shrink-0 text-brand-600 dark:text-brand-300"
                    />
                    试试用Agent生成实验列表
                  </div>
                  <UButton
                    color="neutral"
                    variant="soft"
                    icon="i-lucide-copy"
                    @click="copyAgentPrompt"
                  >
                    复制提示词
                  </UButton>
                </div>
              </Card>

              <UFileUpload
                v-model="importFile"
                accept=".json,application/json"
                icon="i-lucide-file-json"
                label="拖拽或点击选择 JSON 文件"
                description="支持 .json 文件，也可按 Ctrl+V 粘贴 JSON"
              />

              <UAlert
                v-if="importError"
                color="error"
                variant="subtle"
                icon="i-lucide-circle-alert"
                :description="importError"
              />

              <div
                v-else-if="importItems"
                class="rounded-xl border border-line bg-sunken/50 px-4 py-3 text-xs text-fg-muted"
              >
                已识别 {{ importItems.length }} 个实验
              </div>

              <USwitch v-if="hasImportRatios" v-model="applyRatios" label="同时导入评分占比" />

              <div class="flex flex-wrap items-center gap-2">
                <PendingButton
                  color="primary"
                  icon="i-lucide-upload"
                  :loading="importing"
                  loading-label="导入中"
                  :disabled="!classId || !importItems || importItems.length === 0"
                  @click="runImport"
                >
                  导入 {{ importItems?.length ?? 0 }} 个实验
                </PendingButton>
              </div>
            </div>
          </template>
        </UTabs>
      </template>
    </UModal>

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
