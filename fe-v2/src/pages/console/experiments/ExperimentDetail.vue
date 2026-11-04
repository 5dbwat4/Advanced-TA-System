<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'

import ScoreRatioEditor from '@/components/settings/ScoreRatioEditor.vue'
import Card from '@/components/ui/Card.vue'
import DateTimePicker from '@/components/ui/DateTimePicker.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import PageHeader from '@/components/ui/PageHeader.vue'
import Spinner from '@/components/ui/Spinner.vue'
import {
  apiFetch,
  fetchCheckoff,
  fetchClassSettings,
  fetchExperimentHomeworks,
  listBanks,
  updateClassSettings,
  updateExperiment,
  type CheckoffStudent,
  type ClassSettings,
  type Experiment,
  type QuestionBank,
  type ZjuamHomework,
} from '@/lib/api'
import { getErrorMessage } from '@/lib/error'
import { formatDateTime, formatLocaleDateTime } from '@/lib/format'
import { SCORE_TYPES, scoreKey } from '@/lib/scores'
import { DEFAULT_SCORE_RATIO, resolveScoreRatio, weightedTotal } from '@/lib/scoring'
import { toast } from '@/lib/toast'
import { useDebouncedSave } from '@/lib/use-class-settings'
import { cn } from '@/lib/utils'
import {
  UAlert,
  UButton,
  UIcon,
  UInput,
  UModal,
  USelect,
  USkeleton,
  UTooltip,
} from '@/ui'

const MORE_BANKS_KEY = '__more__'

const route = useRoute()
const router = useRouter()

const id = computed(() => {
  const raw = route.params.id
  return Array.isArray(raw) ? (raw[0] ?? '') : (raw ?? '')
})

const experiment = ref<Experiment | null>(null)
const banks = ref<QuestionBank[]>([])
const students = ref<CheckoffStudent[]>([])
const scores = ref<Map<string, number>>(new Map())
const settings = ref<ClassSettings | null>(null)
const ratio = ref<number[]>([...DEFAULT_SCORE_RATIO])
const savingRatio = ref(false)
const loading = ref(true)
const binding = ref(false)

const homeworks = ref<ZjuamHomework[]>([])
const homeworksLoading = ref(false)
const homeworksError = ref<string | null>(null)
const checkoutDraft = ref<string | null>(null)
const reportDraft = ref<string | null>(null)
const savingXzzd = ref(false)

const publishDraft = ref<string | null>(null)
const checkoffDeadlineDraft = ref<string | null>(null)
const reportDeadlineDraft = ref<string | null>(null)
const savingTimeline = ref(false)
const editingTimeline = ref(false)

const bindOpen = ref(false)
const preferencesOpen = ref(false)
const banksOpen = ref(false)
const bankQuery = ref('')

async function loadHomeworks() {
  const experimentId = id.value
  if (!experimentId) return
  homeworksLoading.value = true
  homeworksError.value = null
  try {
    const { homeworks: list } = await fetchExperimentHomeworks(experimentId)
    homeworks.value = list
  } catch (error) {
    homeworksError.value = getErrorMessage(error, '获取学在浙大作业失败')
  } finally {
    homeworksLoading.value = false
  }
}

async function load(experimentId: string) {
  const [detail, bankData] = await Promise.all([
    apiFetch<{ experiment: Experiment }>(`/api/experiments/${experimentId}`),
    listBanks(),
  ])
  experiment.value = detail.experiment
  banks.value = bankData.banks
  publishDraft.value = detail.experiment.publishTime
  checkoffDeadlineDraft.value = detail.experiment.checkoffDeadline
  reportDeadlineDraft.value = detail.experiment.reportDeadline

  const [checkoff, settingsRes] = await Promise.all([
    fetchCheckoff({ classId: detail.experiment.classId, experimentId }),
    fetchClassSettings(detail.experiment.classId),
  ])
  settings.value = settingsRes.settings
  ratio.value = resolveScoreRatio(settingsRes.settings, experimentId)
  students.value = checkoff.students
  scores.value = new Map(
    checkoff.scores.map((item) => [scoreKey(item.userId, item.type, item.indId), item.score]),
  )
}

let loadToken = 0

watch(
  id,
  async (experimentId) => {
    if (!experimentId) return
    const token = ++loadToken
    loading.value = true
    try {
      await load(experimentId)
    } catch (error) {
      if (token === loadToken) toast.error(getErrorMessage(error, '加载失败'))
    } finally {
      if (token === loadToken) loading.value = false
    }
  },
  { immediate: true },
)

const ratioSave = useDebouncedSave(async () => {
  const current = experiment.value
  if (!current) return
  savingRatio.value = true
  try {
    await updateClassSettings(current.classId, {
      experimentScoreRatios: { [current.id]: ratio.value },
    })
  } catch (error) {
    toast.error(getErrorMessage(error, '保存评分占比失败'))
    throw error
  } finally {
    savingRatio.value = false
  }
}, 700)

const ratioSaveFailed = ratioSave.saveFailed

const bank = computed(() => experiment.value?.questionBank ?? null)

const bankQuestionCount = computed(() => {
  const currentBank = bank.value
  if (!currentBank) return null
  return banks.value.find((item) => item.id === currentBank.id)?.questions.length ?? null
})

const recentBanks = computed<QuestionBank[]>(() => {
  const list = [...banks.value]
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, 10)
  const currentBank = bank.value
  if (currentBank && !list.some((item) => item.id === currentBank.id)) {
    const bound = banks.value.find((item) => item.id === currentBank.id)
    if (bound) list.push(bound)
  }
  return list
})

const bankSelectItems = computed(() => [
  ...recentBanks.value.map((item) => ({ label: item.name, value: item.id })),
  { label: '查看更多……', value: MORE_BANKS_KEY },
])

const filteredBanks = computed(() => {
  const query = bankQuery.value.trim().toLowerCase()
  return query
    ? banks.value.filter((item) => item.name.toLowerCase().includes(query))
    : banks.value
})

const xzzdBoundCount = computed(
  () =>
    [experiment.value?.xzzdBindIdCheckout, experiment.value?.xzzdBindIdReport].filter(Boolean)
      .length,
)

const unifiedRatio = computed(() => settings.value?.scoreRatioUnified ?? false)

const timelineStats = computed(() => [
  { label: '公开时间', value: experiment.value?.publishTime ?? null },
  { label: '验收截止时间', value: experiment.value?.checkoffDeadline ?? null },
  { label: '报告提交截止时间', value: experiment.value?.reportDeadline ?? null },
])

const homeworkItems = computed(() =>
  homeworks.value.map((homework) => ({
    label: homework.title,
    value: String(homework.id),
  })),
)

const dirty = computed(() => {
  const current = experiment.value
  if (!current) return false
  return (
    current.publishTime !== publishDraft.value ||
    current.checkoffDeadline !== checkoffDeadlineDraft.value ||
    current.reportDeadline !== reportDeadlineDraft.value
  )
})

const hasTimeline = computed(() => {
  const current = experiment.value
  if (!current) return false
  return Boolean(current.publishTime || current.checkoffDeadline || current.reportDeadline)
})

const showTimelineEditor = computed(() => editingTimeline.value || !hasTimeline.value)

function onBankSelect(value: unknown) {
  const next = value == null ? '' : String(value)
  if (next === MORE_BANKS_KEY) {
    bankQuery.value = ''
    banksOpen.value = true
    return
  }
  void bind(next)
}

async function bind(bankId: string) {
  const current = experiment.value
  if (!current) return
  binding.value = true
  try {
    const { experiment: updated } = await updateExperiment(current.id, {
      questionBankId: bankId || null,
    })
    experiment.value = updated
    toast.success(bankId ? '已绑定题目集' : '已解绑题目集')
  } catch (error) {
    toast.error(getErrorMessage(error, '操作失败'))
  } finally {
    binding.value = false
  }
}

function bindAndClose(bankId: string) {
  void bind(bankId)
  banksOpen.value = false
}

function scoreOf(userId: string, type: number) {
  const current = experiment.value
  return current ? scores.value.get(scoreKey(userId, type, current.id)) : undefined
}

function totalOf(userId: string) {
  return weightedTotal(
    [scoreOf(userId, 0) ?? null, scoreOf(userId, 1) ?? null, scoreOf(userId, 2) ?? null],
    ratio.value,
  )
}

function homeworkHref(bindId: string | null) {
  const courseId = experiment.value?.klass?.xzzdClassId
  if (!bindId || !courseId) return null
  return `https://courses.zju.edu.cn/course/${courseId}/learning-activity/full-screen#/${bindId}`
}

function openBindModal() {
  const current = experiment.value
  if (!current) return
  checkoutDraft.value = current.xzzdBindIdCheckout
  reportDraft.value = current.xzzdBindIdReport
  void loadHomeworks()
  bindOpen.value = true
}

async function saveXzzdBind() {
  const current = experiment.value
  if (!current) return
  savingXzzd.value = true
  try {
    const { experiment: updated } = await updateExperiment(current.id, {
      xzzdBindIdCheckout: checkoutDraft.value,
      xzzdBindIdReport: reportDraft.value,
    })
    experiment.value = updated
    toast.success('已保存学在浙大作业绑定')
    bindOpen.value = false
  } catch (error) {
    toast.error(getErrorMessage(error, '保存失败'))
  } finally {
    savingXzzd.value = false
  }
}

function setCheckoutDraft(value: unknown) {
  checkoutDraft.value = value == null || value === '' ? null : String(value)
}

function setReportDraft(value: unknown) {
  reportDraft.value = value == null || value === '' ? null : String(value)
}

function cancelEditTimeline() {
  const current = experiment.value
  if (current) {
    publishDraft.value = current.publishTime
    checkoffDeadlineDraft.value = current.checkoffDeadline
    reportDeadlineDraft.value = current.reportDeadline
  }
  editingTimeline.value = false
}

async function saveTimeline() {
  const current = experiment.value
  if (!current || !dirty.value) return
  savingTimeline.value = true
  try {
    const { experiment: updated } = await updateExperiment(current.id, {
      publishTime: publishDraft.value,
      checkoffDeadline: checkoffDeadlineDraft.value,
      reportDeadline: reportDeadlineDraft.value,
    })
    experiment.value = updated
    publishDraft.value = updated.publishTime
    checkoffDeadlineDraft.value = updated.checkoffDeadline
    reportDeadlineDraft.value = updated.reportDeadline
    editingTimeline.value = false
    toast.success('时间线已保存')
  } catch (error) {
    toast.error(getErrorMessage(error, '保存失败'))
  } finally {
    savingTimeline.value = false
  }
}

function changeRatio(next: number[]) {
  ratioSave.schedule()
  ratio.value = next
}
</script>

<template>
  <div v-if="loading" class="mx-auto max-w-4xl space-y-3">
    <USkeleton class="h-16 rounded-2xl" />
    <USkeleton class="h-32 rounded-2xl" />
    <USkeleton class="h-64 rounded-2xl" />
  </div>

  <div v-else-if="!experiment" class="mx-auto max-w-4xl">
    <EmptyState icon="i-lucide-flask-conical" title="实验不存在" hint="它可能已被删除" />
  </div>

  <div v-else class="mx-auto max-w-4xl">
    <RouterLink
      to="/console/experiments"
      class="mb-3 inline-flex items-center gap-1 text-xs font-semibold text-fg-subtle transition-colors hover:text-fg-muted"
    >
      <UIcon name="i-lucide-arrow-left" class="h-3.5 w-3.5 shrink-0" />
      返回实验列表
    </RouterLink>

    <PageHeader :title="`${experiment.mark} · ${experiment.title}`">
      <template #actions>
        <UButton
          size="sm"
          @click="router.push(`/console/checkoff?experiment=${experiment.id}`)"
        >
          <UIcon name="i-lucide-clipboard-check" class="h-4 w-4 shrink-0" />
          去验收
        </UButton>
      </template>
    </PageHeader>

    <Card class="mb-4">
      <div class="flex flex-wrap items-center gap-3">
        <div class="flex items-center gap-2">
          <UIcon name="i-lucide-notebook-text" class="h-4 w-4 shrink-0 text-brand-600 dark:text-brand-300" />
          <span class="text-sm font-bold">抽题题目集</span>
        </div>
        <USelect
          class="min-w-[14rem]"
          aria-label="抽题题目集"
          :disabled="binding"
          :model-value="bank?.id ?? ''"
          placeholder="未绑定题目集"
          :items="bankSelectItems"
          @update:model-value="onBankSelect"
        />
        <UButton
          v-if="bank"
          icon="i-lucide-x"
          color="neutral"
          variant="ghost"
          size="sm"
          aria-label="解绑题目集"
          @click="bind('')"
        />
        <Spinner v-if="binding" size="sm" />
        <span
          v-if="bankQuestionCount !== null"
          class="tabular rounded-lg bg-brand-500/10 px-2.5 py-1 text-xs font-semibold text-brand-600 dark:text-brand-300"
        >
          {{ bankQuestionCount }} 题
        </span>
        <RouterLink
          to="/console/questions?tab=sets"
          class="ml-auto text-xs font-semibold text-brand-600 hover:underline dark:text-brand-300"
        >
          管理题目集 →
        </RouterLink>
      </div>
      <UAlert
        v-if="!bank"
        class="mt-3"
        color="warning"
        variant="subtle"
        icon="i-lucide-triangle-alert"
        title="未绑定题目集时，验收抽题将没有题目。"
      />
    </Card>

    <Card class="mb-4">
      <div class="flex flex-wrap items-center gap-3">
        <div class="flex items-center gap-2">
          <UIcon name="i-lucide-calendar-clock" class="h-4 w-4 shrink-0 text-brand-600 dark:text-brand-300" />
          <span class="text-sm font-bold">时间线</span>
        </div>
        <div class="ml-auto flex items-center gap-2">
          <template v-if="showTimelineEditor">
            <UTooltip v-if="hasTimeline" text="取消" arrow>
              <UButton
                icon="i-lucide-x"
                label="取消编辑"
                color="neutral"
                variant="soft"
                size="sm"
                :disabled="savingTimeline"
                @click="cancelEditTimeline"
              />
            </UTooltip>
            <UTooltip text="保存" arrow>
              <UButton
                icon="i-lucide-check"
                label="保存时间线"
                size="sm"
                :disabled="!dirty"
                :loading="savingTimeline"
                @click="saveTimeline"
              />
            </UTooltip>
          </template>
          <UTooltip v-else text="编辑" arrow>
            <UButton
              icon="i-lucide-pencil"
              label="编辑时间线"
              color="neutral"
              variant="soft"
              size="sm"
              @click="editingTimeline = true"
            />
          </UTooltip>
        </div>
      </div>

      <div v-if="showTimelineEditor" class="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <DateTimePicker
          v-model="publishDraft"
          label="公开时间"
          :disabled="savingTimeline"
        />
        <DateTimePicker
          v-model="checkoffDeadlineDraft"
          label="验收截止时间"
          :disabled="savingTimeline"
        />
        <DateTimePicker
          v-model="reportDeadlineDraft"
          label="报告提交截止时间"
          :disabled="savingTimeline"
        />
      </div>
      <div v-else class="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <div v-for="stat in timelineStats" :key="stat.label">
          <div class="text-xs font-semibold text-fg-muted">{{ stat.label }}</div>
          <div :class="['tabular mt-1.5 text-sm', stat.value ? '' : 'text-fg-subtle']">
            {{ formatDateTime(stat.value, '未指定') }}
          </div>
        </div>
      </div>
    </Card>

    <Card class="mb-4">
      <div class="flex flex-wrap items-center gap-3">
        <div class="flex items-center gap-2">
          <UIcon name="i-lucide-percent" class="h-4 w-4 shrink-0 text-brand-600 dark:text-brand-300" />
          <span class="text-sm font-bold">实验计分方式</span>
        </div>
        <Spinner v-if="savingRatio" size="sm" />
        <span v-if="unifiedRatio" class="text-xs text-fg-subtle">
          已启用课程统一评分占比，
          <RouterLink
            to="/console/courses/settings#scoring"
            class="font-semibold text-brand-600 transition-colors hover:underline dark:text-brand-300"
          >
            前往设置修改
          </RouterLink>
        </span>
      </div>
      <div class="mt-4">
        <ScoreRatioEditor :value="ratio" :disabled="unifiedRatio" @change="changeRatio" />
        <UAlert
          v-if="ratioSaveFailed"
          class="mt-3"
          color="warning"
          variant="subtle"
          icon="i-lucide-triangle-alert"
          title="自动保存失败，修改尚未保存"
        />
      </div>
    </Card>

    <Card class="mb-4">
      <div class="flex w-full items-center gap-3">
        <UIcon name="i-lucide-graduation-cap" class="h-4 w-4 shrink-0 text-brand-600 dark:text-brand-300" />
        <span class="text-sm font-bold">学在浙大作业</span>
        <span class="ml-auto text-xs text-fg-subtle">
          {{ xzzdBoundCount === 0 ? '未绑定' : `已绑定 ${xzzdBoundCount}/2` }}
        </span>
      </div>
      <div class="mt-4 flex flex-col gap-4 border-t border-line pt-4">
        <div class="flex flex-wrap items-center gap-x-6 gap-y-3 rounded-2xl border border-line p-4">
          <div class="flex items-center gap-3">
            <span class="text-sm text-fg-muted">验收</span>
            <template v-if="experiment.xzzdBindIdCheckout">
              <a
                v-if="homeworkHref(experiment.xzzdBindIdCheckout)"
                :href="homeworkHref(experiment.xzzdBindIdCheckout) ?? undefined"
                target="_blank"
                rel="noreferrer"
                class="tabular inline-flex items-center gap-1 rounded-lg bg-brand-500/10 px-2 py-0.5 text-[11px] font-semibold text-brand-600 transition-colors hover:bg-brand-500/20 dark:text-brand-300"
              >
                学在浙大 #{{ experiment.xzzdBindIdCheckout }}
                <UIcon name="i-lucide-external-link" class="h-3 w-3 shrink-0" />
              </a>
              <span
                v-else
                class="tabular inline-flex items-center gap-1 rounded-lg bg-brand-500/10 px-2 py-0.5 text-[11px] font-semibold text-brand-600 dark:text-brand-300"
              >
                学在浙大 #{{ experiment.xzzdBindIdCheckout }}
              </span>
            </template>
            <span v-else class="text-xs text-fg-subtle">未绑定</span>
          </div>
          <div class="flex items-center gap-3">
            <span class="text-sm text-fg-muted">报告</span>
            <template v-if="experiment.xzzdBindIdReport">
              <a
                v-if="homeworkHref(experiment.xzzdBindIdReport)"
                :href="homeworkHref(experiment.xzzdBindIdReport) ?? undefined"
                target="_blank"
                rel="noreferrer"
                class="tabular inline-flex items-center gap-1 rounded-lg bg-brand-500/10 px-2 py-0.5 text-[11px] font-semibold text-brand-600 transition-colors hover:bg-brand-500/20 dark:text-brand-300"
              >
                学在浙大 #{{ experiment.xzzdBindIdReport }}
                <UIcon name="i-lucide-external-link" class="h-3 w-3 shrink-0" />
              </a>
              <span
                v-else
                class="tabular inline-flex items-center gap-1 rounded-lg bg-brand-500/10 px-2 py-0.5 text-[11px] font-semibold text-brand-600 dark:text-brand-300"
              >
                学在浙大 #{{ experiment.xzzdBindIdReport }}
              </span>
            </template>
            <span v-else class="text-xs text-fg-subtle">未绑定</span>
          </div>
          <UButton
            class="sm:ml-auto"
            size="sm"
            color="neutral"
            variant="soft"
            @click="openBindModal"
          >
            {{ xzzdBoundCount > 0 ? '重新绑定' : '绑定' }}
          </UButton>
        </div>

        <div class="flex flex-wrap items-center gap-4 rounded-2xl border border-line p-4">
          <div class="flex flex-col gap-1">
            <p class="text-xs font-semibold text-fg-muted">上次同步时间</p>
            <UTooltip text="向上游推送成绩时间" arrow>
              <span class="inline-flex w-fit items-center gap-2 text-fg-muted">
                <UIcon name="i-lucide-arrow-up" class="h-3.5 w-3.5 shrink-0" />
                <span class="tabular text-xs">
                  {{ formatLocaleDateTime(experiment.lastXzzdUpSyncAt, '—') }}
                </span>
              </span>
            </UTooltip>
          </div>
          <div class="ml-auto flex items-center gap-2">
            <UButton
              color="neutral"
              variant="soft"
              @click="router.push(`/console/experiments/${experiment.id}/xzzd-push`)"
            >
              向上游推送成绩
            </UButton>
            <UTooltip text="偏好设置" arrow>
              <UButton
                icon="i-lucide-sliders-horizontal"
                color="neutral"
                variant="soft"
                aria-label="偏好设置"
                @click="preferencesOpen = true"
              />
            </UTooltip>
          </div>
        </div>
      </div>
    </Card>

    <div class="mb-3 flex flex-wrap items-center justify-between gap-2">
      <div class="flex items-center gap-2 text-sm font-bold">
        <UIcon name="i-lucide-table" class="h-4 w-4 shrink-0" />
        学生得分
        <span class="tabular text-xs font-normal text-fg-subtle">{{ students.length }} 人</span>
      </div>
      <UButton
        size="sm"
        color="neutral"
        variant="soft"
        :disabled="!id"
        @click="id && router.push(`/console/remarks/experiments/${id}`)"
      >
        <UIcon name="i-lucide-message-square-text" class="h-4 w-4 shrink-0" />
        查看评语
      </UButton>
    </div>

    <EmptyState
      v-if="students.length === 0"
      icon="i-lucide-users"
      title="暂无学生"
      hint="请先到「分数和名单」导入学生名单"
    />
    <div v-else class="max-h-[70vh] overflow-auto rounded-2xl border border-line">
      <table class="w-full border-collapse text-sm">
        <thead>
          <tr>
            <th
              class="sticky left-0 top-0 z-30 border-b border-r border-line bg-elevated px-4 py-2 text-left font-semibold"
            >
              学生
            </th>
            <th
              v-for="type in SCORE_TYPES"
              :key="type.value"
              class="sticky top-0 z-20 border-b border-r border-line bg-elevated px-4 py-2 text-center font-semibold"
            >
              {{ type.label }}
            </th>
            <th
              class="sticky top-0 z-20 border-b border-line bg-elevated px-4 py-2 text-center font-semibold"
            >
              总评
            </th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="student in students"
            :key="student.userId"
            class="transition-colors hover:bg-sunken/40"
          >
            <td class="sticky left-0 z-10 border-b border-r border-line bg-elevated px-4 py-2">
              <div class="font-bold">{{ student.name }}</div>
              <div class="tabular text-xs text-fg-muted">{{ student.studentId }}</div>
            </td>
            <td
              v-for="type in SCORE_TYPES"
              :key="type.value"
              class="tabular border-b border-r border-line px-4 py-2 text-center"
            >
              <template v-if="scoreOf(student.userId, type.value) !== undefined">
                {{ scoreOf(student.userId, type.value) }}
              </template>
              <span v-else class="text-fg-subtle">—</span>
            </td>
            <td class="tabular border-b border-line px-4 py-2 text-center font-bold">
              <template v-if="totalOf(student.userId) !== null">
                {{ totalOf(student.userId)?.toFixed(1) }}
              </template>
              <span v-else class="font-normal text-fg-subtle">—</span>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <UModal v-model:open="bindOpen" title="绑定学在浙大作业">
      <template #body>
        <div class="flex flex-col gap-4">
          <div
            v-if="homeworksLoading"
            class="flex items-center justify-center gap-2 py-6 text-sm text-fg-muted"
          >
            <Spinner size="sm" />
            正在从学在浙大获取作业…
          </div>
          <div v-else-if="homeworksError" class="flex flex-col items-start gap-3 py-1">
            <p class="text-sm text-danger">{{ homeworksError }}</p>
            <UButton size="sm" color="neutral" variant="soft" @click="loadHomeworks">
              重试
            </UButton>
          </div>
          <p v-else-if="homeworks.length === 0" class="py-1 text-sm text-fg-muted">
            该课程暂无可绑定的作业。
          </p>
          <template v-else>
            <div>
              <label class="mb-1.5 block text-xs font-semibold text-fg-muted">验收作业</label>
              <div class="flex items-center gap-2">
                <USelect
                  class="w-full"
                  aria-label="验收作业"
                  :disabled="savingXzzd"
                  :model-value="checkoutDraft ?? ''"
                  placeholder="未绑定"
                  :items="homeworkItems"
                  @update:model-value="setCheckoutDraft"
                />
                <UButton
                  v-if="checkoutDraft"
                  icon="i-lucide-x"
                  color="neutral"
                  variant="ghost"
                  size="sm"
                  aria-label="清除验收作业"
                  @click="checkoutDraft = null"
                />
              </div>
            </div>
            <div>
              <label class="mb-1.5 block text-xs font-semibold text-fg-muted">报告作业</label>
              <div class="flex items-center gap-2">
                <USelect
                  class="w-full"
                  aria-label="报告作业"
                  :disabled="savingXzzd"
                  :model-value="reportDraft ?? ''"
                  placeholder="未绑定"
                  :items="homeworkItems"
                  @update:model-value="setReportDraft"
                />
                <UButton
                  v-if="reportDraft"
                  icon="i-lucide-x"
                  color="neutral"
                  variant="ghost"
                  size="sm"
                  aria-label="清除报告作业"
                  @click="reportDraft = null"
                />
              </div>
            </div>
            <p class="text-[11px] text-fg-subtle">
              验收与报告是两个不同的学在浙大作业，可分别绑定；不绑定可点击右侧清除。
            </p>
          </template>
        </div>
      </template>
      <template #footer>
        <div class="flex justify-end gap-2">
          <UButton color="neutral" variant="soft" @click="bindOpen = false">取消</UButton>
          <UButton
            :loading="savingXzzd"
            :disabled="homeworksLoading || Boolean(homeworksError)"
            @click="saveXzzdBind"
          >
            保存
          </UButton>
        </div>
      </template>
    </UModal>

    <UModal v-model:open="preferencesOpen" title="偏好设置">
      <template #body>
        <p class="text-sm text-fg-muted">功能开发中。</p>
      </template>
    </UModal>

    <UModal v-model:open="banksOpen" title="选择题目集">
      <template #body>
        <div class="flex flex-col gap-3">
          <UInput
            v-model="bankQuery"
            icon="i-lucide-search"
            aria-label="搜索题目集"
            placeholder="搜索"
          />
          <div class="max-h-[50vh] overflow-auto">
            <p v-if="filteredBanks.length === 0" class="py-6 text-center text-xs text-fg-subtle">
              没有匹配的题目集
            </p>
            <template v-else>
              <button
                v-for="item in filteredBanks"
                :key="item.id"
                type="button"
                :class="
                  cn(
                    'flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left transition-colors',
                    bank?.id === item.id ? 'bg-brand-500/10' : 'hover:bg-sunken',
                  )
                "
                @click="bindAndClose(item.id)"
              >
                <span class="min-w-0 flex-1">
                  <span class="block truncate text-sm font-medium">{{ item.name }}</span>
                  <span class="tabular block text-[11px] text-fg-subtle">
                    {{ item.questions.length }} 题 · 更新于 {{ formatLocaleDateTime(item.updatedAt) }}
                  </span>
                </span>
                <UIcon
                  v-if="bank?.id === item.id"
                  name="i-lucide-check"
                  class="h-4 w-4 shrink-0 text-brand-600 dark:text-brand-300"
                />
              </button>
            </template>
          </div>
        </div>
      </template>
    </UModal>
  </div>
</template>
