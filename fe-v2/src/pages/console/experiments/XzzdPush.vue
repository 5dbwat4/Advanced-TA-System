<script setup lang="ts">
import type { DropdownMenuItem } from '@nuxt/ui'
import { computed, onUnmounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'

import Card from '@/components/ui/Card.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import IconAction from '@/components/ui/IconAction.vue'
import PageHeader from '@/components/ui/PageHeader.vue'
import SkeletonList from '@/components/ui/SkeletonList.vue'
import Spinner from '@/components/ui/Spinner.vue'
import {
  apiFetch,
  fetchXzzdPushPreview,
  getToken,
  type Experiment,
  type XzzdPushTarget,
  type ZjuamCourseStudent,
  type ZjuamHomeworkSyncData,
} from '@/lib/api'
import { getErrorMessage } from '@/lib/error'
import { formatBytes, formatDateTime } from '@/lib/format'
import { toast } from '@/lib/toast'
import {
  UAlert,
  UButton,
  UDropdownMenu,
  UIcon,
  UPopover,
  UProgress,
  USkeleton,
  UTabs,
} from '@/ui'

type HomeworkKind = 'checkout' | 'report'

type PushStepStatus = 'running' | 'done' | 'error'

type PushStudentStatus = 'pushing' | 'pushed' | 'unchanged' | 'failed'

type PushStep = {
  id: string
  label: string
  status: PushStepStatus
  detail?: string
}

type PushEventPayload = {
  id?: string
  label?: string
  status?: PushStepStatus | PushStudentStatus
  detail?: string
  message?: string
  userId?: string
  targets?: XzzdPushTarget[]
}

const HEAD_CLASS =
  'sticky top-0 z-10 border-b border-r border-line bg-elevated px-4 py-2 font-semibold'
const CELL_CLASS = 'border-b border-r border-line px-4 py-2'

const route = useRoute()
const id = computed(() => String(route.params.id ?? ''))

const experiment = ref<Experiment | null>(null)
const loadingExperiment = ref(true)

const kind = ref<HomeworkKind>('checkout')
const data = ref<ZjuamHomeworkSyncData | null>(null)
const loading = ref(false)
const error = ref<string | null>(null)

const steps = ref<PushStep[]>([])
const targets = ref<XzzdPushTarget[]>([])
const studentStatus = ref<Record<string, PushStudentStatus>>({})
const pushing = ref(false)
const pushError = ref<string | null>(null)
let abortController: AbortController | null = null

const kindItems = [
  { label: '验收作业', value: 'checkout' },
  { label: '报告作业', value: 'report' },
]

onUnmounted(() => {
  abortController?.abort()
})

async function loadExperiment() {
  const experimentId = id.value
  if (!experimentId) {
    loadingExperiment.value = false
    return
  }
  loadingExperiment.value = true
  try {
    const { experiment: detail } = await apiFetch<{ experiment: Experiment }>(
      `/api/experiments/${experimentId}`,
    )
    experiment.value = detail
  } catch (err) {
    toast.error(getErrorMessage(err, '加载实验失败'))
  } finally {
    loadingExperiment.value = false
  }
}

watch(
  id,
  () => {
    void loadExperiment()
  },
  { immediate: true },
)

async function loadPreview() {
  const experimentId = id.value
  if (!experimentId) return
  loading.value = true
  error.value = null
  try {
    data.value = await fetchXzzdPushPreview(experimentId, kind.value)
  } catch (err) {
    data.value = null
    error.value = getErrorMessage(err, '获取上游数据失败')
  } finally {
    loading.value = false
  }
}

watch(
  [id, kind],
  () => {
    void loadPreview()
  },
  { immediate: true },
)

const studentsById = computed(
  () =>
    new Map<number, ZjuamCourseStudent>(
      (data.value?.students ?? []).map((item) => [item.id, item]),
    ),
)

const readyCount = computed(() => targets.value.filter((item) => !item.skippedReason).length)

const pushProgress = computed(() => {
  const total = targets.value.length
  if (total === 0) return null
  const finished = targets.value.filter((item) => {
    const status = studentStatus.value[item.userId]
    return status === 'pushed' || status === 'unchanged' || status === 'failed'
  }).length
  return Math.round((finished / total) * 100)
})

const moreItems = computed<DropdownMenuItem[][]>(() => [
  [
    {
      label: '只生成成绩和教师评语列表',
      icon: 'i-lucide-list-checks',
      onSelect: () => {
        void startAssemble()
      },
    },
  ],
])

function upsertStep(update: PushStep) {
  const index = steps.value.findIndex((item) => item.id === update.id)
  if (index === -1) {
    steps.value = [...steps.value, update]
    return
  }
  steps.value = steps.value.map((item, i) => (i === index ? update : item))
}

function studentName(personId: number | null): string | null {
  if (personId == null) return null
  return studentsById.value.get(personId)?.name ?? null
}

function formatScore(value: number | null): string {
  return value == null ? '—' : String(value)
}

async function runStream(endpoint: 'stream' | 'assemble') {
  const experimentId = id.value
  if (!experimentId || pushing.value) return
  const assembling = endpoint === 'assemble'
  const token = getToken()
  steps.value = []
  targets.value = []
  studentStatus.value = {}
  pushError.value = null
  pushing.value = true
  const controller = new AbortController()
  abortController = controller
  let doneMessage: string | null = null

  const handleSseBlock = (block: string) => {
    let event = 'message'
    const dataLines: string[] = []
    for (const line of block.split(/\r?\n/)) {
      if (line.startsWith('event:')) event = line.slice(6).trim()
      else if (line.startsWith('data:')) dataLines.push(line.slice(5).replace(/^ /, ''))
    }
    if (dataLines.length === 0) return
    const payload = JSON.parse(dataLines.join('\n')) as PushEventPayload
    if (event === 'step' && payload.id && payload.label && payload.status) {
      upsertStep({
        id: payload.id,
        label: payload.label,
        status: payload.status as PushStepStatus,
        detail: payload.detail,
      })
      return
    }
    if (event === 'assembled' && Array.isArray(payload.targets)) {
      targets.value = payload.targets
      return
    }
    if (event === 'push' && payload.userId && payload.status) {
      const status = payload.status as PushStudentStatus
      studentStatus.value = { ...studentStatus.value, [payload.userId]: status }
      return
    }
    if (event === 'done') {
      doneMessage = payload.message ?? null
      return
    }
    if (event === 'error') {
      throw new Error(payload.message ?? (assembling ? '生成列表失败' : '推送失败'))
    }
  }

  try {
    const response = await fetch(`/api/experiments/${experimentId}/xzzd-push/${endpoint}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ kind: kind.value }),
      signal: controller.signal,
    })
    if (!response.ok || !response.headers.get('content-type')?.includes('text/event-stream')) {
      const payload = (await response.json().catch(() => null)) as { message?: string } | null
      throw new Error(payload?.message ?? `请求失败（${response.status}）`)
    }
    const reader = response.body?.getReader()
    if (!reader) throw new Error('请求失败（无法读取推送进度）')
    const decoder = new TextDecoder()
    let buffer = ''
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      let match = buffer.match(/\r?\n\r?\n/)
      while (match && match.index !== undefined) {
        const block = buffer.slice(0, match.index)
        buffer = buffer.slice(match.index + match[0].length)
        if (block.trim()) handleSseBlock(block)
        match = buffer.match(/\r?\n\r?\n/)
      }
    }
    if (buffer.trim()) handleSseBlock(buffer)
    toast.success(doneMessage ?? (assembling ? '已生成列表' : '推送完成'))
    void loadPreview()
  } catch (err) {
    if (!controller.signal.aborted) {
      pushError.value = getErrorMessage(err, assembling ? '生成列表失败' : '推送失败')
    }
  } finally {
    pushing.value = false
    if (abortController === controller) abortController = null
  }
}

function startPush() {
  void runStream('stream')
}

function startAssemble() {
  void runStream('assemble')
}
</script>

<template>
  <div class="mx-auto max-w-4xl">
    <RouterLink
      :to="id ? `/console/experiments/${id}` : '/console/experiments'"
      class="mb-3 inline-flex items-center gap-1 text-xs font-semibold text-fg-subtle transition-colors hover:text-fg-muted"
    >
      <UIcon name="i-lucide-arrow-left" class="h-3.5 w-3.5 shrink-0" />
      返回实验
    </RouterLink>

    <PageHeader title="向上游推送成绩">
      <template v-if="experiment" #actions>
        <span class="text-xs text-fg-subtle">{{ experiment.mark }} · {{ experiment.title }}</span>
      </template>
    </PageHeader>

    <UAlert
      variant="subtle"
      class="mb-4"
      color="warning"
      icon="i-lucide-triangle-alert"
      description="推送成绩会向学在浙大发送多个请求，完成用时较长，推送过程中请勿离开此页面。"
    />

    <USkeleton v-if="loadingExperiment" class="h-40 rounded-2xl" />

    <EmptyState
      v-else-if="!experiment"
      icon="i-lucide-upload"
      title="实验不存在"
      hint="它可能已被删除"
    />

    <Card v-else-if="!pushing && steps.length === 0" :index="0">
      <div class="flex flex-wrap items-center gap-2">
        <UIcon name="i-lucide-upload" class="h-4 w-4 shrink-0 text-brand-600 dark:text-brand-300" />
        <h2 class="text-sm font-bold">上游数据</h2>
        <div class="ms-auto flex items-center gap-2">
          <UTabs
            :model-value="kind"
            :items="kindItems"
            variant="pill"
            :content="false"
            @update:model-value="(value: string | number) => (kind = String(value) as HomeworkKind)"
          />
          <IconAction
            label="重新获取"
            tooltip="重新获取"
            placement="bottom"
            variant="soft"
            :disabled="loading"
            @click="loadPreview"
          >
            <UIcon name="i-lucide-refresh-cw" class="h-[15px] w-[15px] shrink-0" />
          </IconAction>
          <Spinner v-if="loading" size="sm" />
        </div>
      </div>

      <div class="mt-4 flex flex-col gap-6">
        <UAlert
          variant="subtle"
          color="warning"
          icon="i-lucide-triangle-alert"
          description="继续推送将会覆盖上游已有数据。"
        />

        <template v-if="error">
          <UAlert variant="subtle" color="error" icon="i-lucide-circle-alert">
            <template #description>
              <div class="flex flex-col gap-2">
                <span>{{ error }}</span>
                <UButton size="sm" color="secondary" variant="soft" @click="loadPreview">
                  重试
                </UButton>
              </div>
            </template>
          </UAlert>
        </template>

        <SkeletonList v-else-if="loading && !data" :rows="3" class="h-10 rounded-xl" />

        <template v-else-if="data">
          <p class="text-xs text-fg-subtle">
            上游作业 <span class="tabular">#{{ data.activityId }}</span>
          </p>

          <div>
            <div class="mb-2 flex items-center gap-2">
              <span class="text-xs font-semibold text-fg-muted">提交记录</span>
              <span class="tabular text-[11px] text-fg-subtle">
                {{ data.submissions.length }} 条
              </span>
            </div>
            <p v-if="data.submissions.length === 0" class="text-xs text-fg-subtle">
              暂无提交记录。
            </p>
            <div v-else class="max-h-[45vh] overflow-auto rounded-2xl border border-line">
              <table class="w-full border-collapse text-sm">
                <thead>
                  <tr>
                    <th :class="`${HEAD_CLASS} text-left`">提交 ID</th>
                    <th :class="`${HEAD_CLASS} text-left`">提交者</th>
                    <th :class="`${HEAD_CLASS} text-left`">提交时间</th>
                    <th :class="`${HEAD_CLASS} text-right`">附件</th>
                    <th :class="`${HEAD_CLASS} border-r-0 text-center`">状态</th>
                  </tr>
                </thead>
                <tbody>
                  <tr
                    v-for="item in data.submissions"
                    :key="item.id"
                    class="transition-colors hover:bg-sunken/40"
                  >
                    <td :class="`${CELL_CLASS} tabular`">{{ item.id }}</td>
                    <td :class="CELL_CLASS">
                      <template v-if="item.created_by?.id == null">
                        <span class="text-fg-subtle">—</span>
                      </template>
                      <template v-else-if="studentName(item.created_by?.id ?? null)">
                        {{ studentName(item.created_by?.id ?? null) }}
                        <span class="tabular text-fg-subtle">（{{ item.created_by?.id }}）</span>
                      </template>
                      <span v-else class="tabular">{{ item.created_by?.id }}</span>
                    </td>
                    <td :class="`${CELL_CLASS} tabular`">
                      {{ formatDateTime(item.created_at) }}
                    </td>
                    <td :class="`${CELL_CLASS} tabular text-right`">
                      {{ formatBytes(item.attachments_size) }}
                    </td>
                    <td :class="`${CELL_CLASS} border-r-0 text-center`">
                      <template v-if="item.marked_submitted">已提交</template>
                      <span v-else class="text-fg-subtle">未提交</span>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          <div>
            <div class="mb-2 flex items-center gap-2">
              <span class="text-xs font-semibold text-fg-muted">上游成绩</span>
              <span class="tabular text-[11px] text-fg-subtle">
                {{ data.homeworkScores.length }} 条
              </span>
            </div>
            <p v-if="data.homeworkScores.length === 0" class="text-xs text-fg-subtle">
              暂无成绩记录。
            </p>
            <div v-else class="max-h-[45vh] overflow-auto rounded-2xl border border-line">
              <table class="w-full border-collapse text-sm">
                <thead>
                  <tr>
                    <th :class="`${HEAD_CLASS} text-left`">学生</th>
                    <th :class="`${HEAD_CLASS} text-center`">最终分数</th>
                    <th :class="`${HEAD_CLASS} text-center`">分数</th>
                    <th :class="`${HEAD_CLASS} border-r-0 text-left`">教师评语</th>
                  </tr>
                </thead>
                <tbody>
                  <tr
                    v-for="item in data.homeworkScores"
                    :key="item.student_id"
                    class="transition-colors hover:bg-sunken/40"
                  >
                    <td :class="CELL_CLASS">
                      <span v-if="studentName(item.student_id)">
                        {{ studentName(item.student_id) }}
                        <span class="tabular text-fg-subtle">（{{ item.student_id }}）</span>
                      </span>
                      <span v-else class="tabular">{{ item.student_id }}</span>
                    </td>
                    <td :class="`${CELL_CLASS} tabular text-center`">
                      <template v-if="item.final_score != null">{{ item.final_score }}</template>
                      <span v-else class="text-fg-subtle">—</span>
                    </td>
                    <td :class="`${CELL_CLASS} tabular text-center`">
                      <template v-if="item.score != null">{{ item.score }}</template>
                      <span v-else class="text-fg-subtle">—</span>
                    </td>
                    <td :class="`${CELL_CLASS} max-w-xs break-all border-r-0`">
                      <template v-if="item.instructor_comment != null">
                        {{ item.instructor_comment }}
                      </template>
                      <span v-else class="text-fg-subtle">—</span>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </template>
      </div>
    </Card>

    <div v-if="experiment && !pushing && steps.length === 0" class="mt-4 flex gap-2">
      <UButton
        class="flex-1"
        size="lg"
        :disabled="loading || !data"
        @click="startPush"
      >
        <UIcon name="i-lucide-upload" class="h-4 w-4 shrink-0" />
        开始推送
      </UButton>
      <UDropdownMenu :items="moreItems">
        <UButton
          square
          size="lg"
          color="secondary"
          variant="soft"
          aria-label="更多操作"
          :disabled="loading || !data"
        >
          <UIcon name="i-lucide-ellipsis" class="h-[18px] w-[18px] shrink-0" />
        </UButton>
      </UDropdownMenu>
    </div>

    <Card v-if="steps.length > 0 || pushError" :index="1" class="mt-4">
      <div class="flex items-center gap-2">
        <UIcon name="i-lucide-list-checks" class="h-4 w-4 shrink-0 text-brand-600 dark:text-brand-300" />
        <h2 class="text-sm font-bold">推送进度</h2>
        <Spinner v-if="pushing" size="sm" />
      </div>

      <UProgress
        v-if="targets.length > 0"
        class="mt-3"
        size="sm"
        :model-value="pushProgress ?? 0"
      />

      <ol v-if="steps.length > 0" class="mt-4 flex flex-col gap-3">
        <li v-for="step in steps" :key="step.id" class="flex items-start gap-3">
          <span class="flex h-5 w-5 shrink-0 items-center justify-center">
            <Spinner v-if="step.status === 'running'" size="sm" />
            <UIcon
              v-else-if="step.status === 'done'"
              name="i-lucide-check"
              class="h-[15px] w-[15px] shrink-0 text-emerald-500"
            />
            <UIcon
              v-else
              name="i-lucide-triangle-alert"
              class="h-[15px] w-[15px] shrink-0 text-danger"
            />
          </span>
          <div class="min-w-0">
            <div :class="step.status === 'error' ? 'text-sm text-danger' : 'text-sm text-fg'">
              {{ step.label }}
            </div>
            <div v-if="step.detail" class="mt-0.5 text-xs text-fg-subtle">{{ step.detail }}</div>
          </div>
        </li>
      </ol>

      <div v-if="targets.length > 0" class="mt-2">
        <div class="mb-2 flex items-center gap-2">
          <span class="text-xs font-semibold text-fg-muted">组装结果</span>
          <span class="tabular text-[11px] text-fg-subtle">
            {{ targets.length }} 人 · 可推送 {{ readyCount }}
          </span>
        </div>
        <div class="max-h-[45vh] overflow-auto rounded-2xl border border-line">
          <table class="w-full border-collapse text-sm">
            <thead>
              <tr>
                <th :class="`${HEAD_CLASS} text-left`">学生</th>
                <th :class="`${HEAD_CLASS} text-center`">功能</th>
                <th :class="`${HEAD_CLASS} text-center`">验收</th>
                <th :class="`${HEAD_CLASS} text-center`">报告</th>
                <th :class="`${HEAD_CLASS} text-center`">推送分</th>
                <th :class="`${HEAD_CLASS} text-left`">评语</th>
                <th :class="`${HEAD_CLASS} border-r-0 text-left`">状态</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="item in targets"
                :key="item.userId"
                class="transition-colors hover:bg-sunken/40"
              >
                <td :class="CELL_CLASS">
                  {{ item.name }}
                  <span class="tabular text-fg-subtle">
                    {{ item.personId != null ? `（${item.personId}）` : `（${item.studentId}）` }}
                  </span>
                </td>
                <td :class="`${CELL_CLASS} tabular text-center`">
                  <span :class="item.functionScore == null ? 'text-fg-subtle' : ''">
                    {{ formatScore(item.functionScore) }}
                  </span>
                </td>
                <td :class="`${CELL_CLASS} tabular text-center`">
                  <span :class="item.answerScore == null ? 'text-fg-subtle' : ''">
                    {{ formatScore(item.answerScore) }}
                  </span>
                </td>
                <td :class="`${CELL_CLASS} tabular text-center`">
                  <span :class="item.reportScore == null ? 'text-fg-subtle' : ''">
                    {{ formatScore(item.reportScore) }}
                  </span>
                </td>
                <td :class="`${CELL_CLASS} tabular text-center font-bold`">
                  <template v-if="item.pushScore != null">{{ item.pushScore }}</template>
                  <span v-else class="font-normal text-fg-subtle">—</span>
                </td>
                <td :class="`${CELL_CLASS} max-w-xs`">
                  <UPopover
                    v-if="item.comment"
                    :content="{ side: 'top' }"
                    :ui="{ content: 'max-w-sm p-3' }"
                  >
                    <UButton
                      color="neutral"
                      variant="ghost"
                      size="xs"
                      class="block w-full justify-start truncate text-left font-normal"
                    >
                      {{ item.comment }}
                    </UButton>
                    <template #content>
                      <div class="max-w-sm">
                        <div class="text-sm font-bold">评语</div>
                        <p class="mt-2 whitespace-pre-wrap break-all text-sm text-fg-muted">
                          {{ item.comment }}
                        </p>
                      </div>
                    </template>
                  </UPopover>
                  <span v-else class="text-fg-subtle">未配置模板</span>
                </td>
                <td :class="`${CELL_CLASS} border-r-0`">
                  <span v-if="item.skippedReason" class="text-amber-600 dark:text-amber-400">
                    {{ item.skippedReason }}
                  </span>
                  <span
                    v-else-if="studentStatus[item.userId] === 'pushing'"
                    class="inline-flex items-center gap-1.5 text-fg-muted"
                  >
                    <Spinner size="sm" />
                    推送中
                  </span>
                  <span
                    v-else-if="studentStatus[item.userId] === 'pushed'"
                    class="inline-flex items-center gap-1 text-emerald-500"
                  >
                    <UIcon name="i-lucide-check" class="h-[13px] w-[13px] shrink-0" />
                    已推送
                  </span>
                  <span
                    v-else-if="studentStatus[item.userId] === 'unchanged'"
                    class="inline-flex items-center gap-1 text-fg-subtle"
                  >
                    <UIcon name="i-lucide-check" class="h-[13px] w-[13px] shrink-0" />
                    无变化
                  </span>
                  <span
                    v-else-if="studentStatus[item.userId] === 'failed'"
                    class="inline-flex items-center gap-1 text-danger"
                  >
                    <UIcon
                      name="i-lucide-triangle-alert"
                      class="h-[13px] w-[13px] shrink-0"
                    />
                    推送失败
                  </span>
                  <span v-else class="text-fg-subtle">就绪</span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <UAlert
        variant="subtle"
        v-if="pushError"
        class="mt-4"
        color="error"
        icon="i-lucide-circle-alert"
        :description="pushError"
      />
    </Card>
  </div>
</template>
