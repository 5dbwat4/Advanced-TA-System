<script setup lang="ts">
import { computed, ref, watch } from 'vue'

import BackLink from '@/components/ui/BackLink.vue'
import Card from '@/components/ui/Card.vue'
import ConfirmDialog from '@/components/ui/ConfirmDialog.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import PageHeader from '@/components/ui/PageHeader.vue'
import PendingButton from '@/components/ui/PendingButton.vue'
import SectionHeader from '@/components/ui/SectionHeader.vue'
import SkeletonList from '@/components/ui/SkeletonList.vue'
import Spinner from '@/components/ui/Spinner.vue'
import {
  applyXzzdSync,
  fetchClassTables,
  fetchExperimentHomeworks,
  fetchXzzdSyncPreview,
  type XzzdSyncApplyResult,
  type XzzdSyncMapping,
  type XzzdSyncMode,
  type XzzdSyncPreview,
  type XzzdSyncRow,
  type ZjuamHomework,
} from '@/lib/api'
import { getErrorMessage } from '@/lib/error'
import { formatDateTime } from '@/lib/format'
import { useAsyncData } from '@/lib/request'
import { SCORE_TYPES } from '@/lib/scores'
import { useCurrentClassComputed } from '@/lib/store'
import { toast } from '@/lib/toast'
import { cn } from '@/lib/utils'
import {
  summarizeXzzdSync,
  xzzdSyncAction,
  type XzzdSyncAction,
} from '@/lib/xzzd-sync'
import { UAlert, UBadge, UButton, UIcon, UInput, USelect, USwitch, UTabs } from '@/ui'

type ScoreType = 0 | 1 | 2

const ACTION_STYLES: Record<XzzdSyncAction, { label: string; className: string }> = {
  create: { label: '新建', className: 'bg-brand-500/10 text-brand-600 dark:text-brand-300' },
  update: { label: '覆盖', className: 'bg-warning/10 text-warning' },
  unchanged: { label: '不变', className: 'bg-sunken text-fg-muted' },
  skip: { label: '跳过', className: 'bg-sunken text-fg-subtle' },
  unmatched: { label: '未匹配', className: 'bg-danger/10 text-danger' },
}

const SCORE_TYPE_TABS = SCORE_TYPES.map((item) => ({ value: item.value, label: item.label }))
const MODE_TABS: Array<{ value: XzzdSyncMode; label: string }> = [
  { value: 'onlyEmpty', label: '仅填充空成绩' },
  { value: 'overwrite', label: '覆盖已有成绩' },
]

function displayScore(value: number | null): string {
  return value == null ? '—' : String(value)
}

const currentClass = useCurrentClassComputed()
const classId = computed(() => currentClass.value?.id ?? null)

const {
  data: tableData,
  loading: tableLoading,
  error: tableError,
} = useAsyncData(() => fetchClassTables(classId.value ?? undefined), [classId])

watch(tableError, (message) => {
  if (message) toast.error(message)
})

const experimentId = ref('')
const scoreType = ref<ScoreType>(0)
const mappingEnabled = ref(false)
const mappingDraft = ref({
  sourceMin: '0',
  sourceMax: '100',
  targetMin: '0',
  targetMax: '100',
})
const homeworks = ref<ZjuamHomework[]>([])
const homeworksLoading = ref(false)
const homeworksNonce = ref(0)
const activityId = ref('')
const preview = ref<XzzdSyncPreview | null>(null)
const mode = ref<XzzdSyncMode>('onlyEmpty')
const previewing = ref(false)
const applying = ref(false)
const result = ref<XzzdSyncApplyResult | null>(null)
const overwriteOpen = ref(false)

const experiments = computed(() =>
  (tableData.value?.experiments ?? []).filter((item) => item.classId === classId.value),
)
const experimentOptions = computed(() =>
  experiments.value.map((item) => ({
    value: item.id,
    label: `${item.mark} · ${item.title}`,
  })),
)
const homeworkOptions = computed(() =>
  homeworks.value.map((item) => ({ value: String(item.id), label: item.title })),
)
const selectedHomework = computed(
  () => homeworks.value.find((item) => String(item.id) === activityId.value) ?? null,
)
const summary = computed(() =>
  preview.value ? summarizeXzzdSync(preview.value.rows, mode.value) : null,
)
const importable = computed(() => (summary.value?.create ?? 0) + (summary.value?.update ?? 0))

const parsedMapping = computed((): { mapping: XzzdSyncMapping | null; error: string | null } => {
  if (!mappingEnabled.value) return { mapping: null, error: null }

  const rawValues = [
    mappingDraft.value.sourceMin,
    mappingDraft.value.sourceMax,
    mappingDraft.value.targetMin,
    mappingDraft.value.targetMax,
  ]
  if (rawValues.some((value) => value.trim() === '')) {
    return { mapping: null, error: '请输入完整的成绩区间' }
  }

  const sourceMin = Number(mappingDraft.value.sourceMin)
  const sourceMax = Number(mappingDraft.value.sourceMax)
  const targetMin = Number(mappingDraft.value.targetMin)
  const targetMax = Number(mappingDraft.value.targetMax)

  if ([sourceMin, sourceMax, targetMin, targetMax].some((value) => !Number.isFinite(value))) {
    return { mapping: null, error: '请输入有效的数字' }
  }
  if (sourceMin === sourceMax) return { mapping: null, error: '原成绩始末不能相同' }
  if (targetMin === targetMax) return { mapping: null, error: '目标成绩始末不能相同' }

  return {
    mapping: { sourceMin, sourceMax, targetMin, targetMax },
    error: null,
  }
})

const summaryStats = computed(() => [
  { label: '可新建', value: summary.value?.create ?? 0, tone: 'brand' as const },
  { label: '将覆盖', value: summary.value?.update ?? 0, tone: 'warning' as const },
  { label: '保持不变', value: summary.value?.unchanged ?? 0, tone: undefined },
  {
    label: '跳过 / 未匹配',
    value: (summary.value?.skip ?? 0) + (summary.value?.unmatched ?? 0),
    tone: undefined,
  },
])

function statClass(tone?: 'brand' | 'warning') {
  return cn(
    'tabular mt-0.5 text-lg font-bold',
    tone === 'brand' && 'text-brand-600 dark:text-brand-300',
    tone === 'warning' && 'text-warning',
  )
}

function decisionFor(row: XzzdSyncRow) {
  return xzzdSyncAction(row, mode.value)
}

function actionStyle(row: XzzdSyncRow) {
  return ACTION_STYLES[decisionFor(row).action]
}

function willScore(row: XzzdSyncRow): number | null {
  const decision = decisionFor(row)
  return decision.action === 'create' || decision.action === 'update'
    ? row.upstreamScore
    : row.localScore
}

watch(classId, () => {
  experimentId.value = ''
  activityId.value = ''
  homeworks.value = []
  preview.value = null
  result.value = null
})

watch(
  experiments,
  (value) => {
    if (experimentId.value && value.some((item) => item.id === experimentId.value)) return
    experimentId.value = value[0]?.id ?? ''
  },
  { immediate: true },
)

watch(
  [experimentId, homeworksNonce],
  async ([id], _old, onCleanup) => {
    if (!id) {
      homeworks.value = []
      activityId.value = ''
      return
    }

    let cancelled = false
    onCleanup(() => {
      cancelled = true
    })

    homeworksLoading.value = true
    homeworks.value = []
    activityId.value = ''
    preview.value = null
    result.value = null
    try {
      const data = await fetchExperimentHomeworks(id)
      if (!cancelled) homeworks.value = data.homeworks
    } catch (error) {
      if (!cancelled) toast.error(getErrorMessage(error, '获取学在浙大作业失败'))
    } finally {
      if (!cancelled) homeworksLoading.value = false
    }
  },
  { immediate: true },
)

watch(
  [
    scoreType,
    activityId,
    mappingEnabled,
    () => mappingDraft.value.sourceMin,
    () => mappingDraft.value.sourceMax,
    () => mappingDraft.value.targetMin,
    () => mappingDraft.value.targetMax,
  ],
  () => {
    preview.value = null
    result.value = null
  },
)

function setExperimentId(value: unknown) {
  experimentId.value = value == null ? '' : String(value)
}

function setActivityId(value: unknown) {
  activityId.value = value == null ? '' : String(value)
}

function setScoreType(value: string | number) {
  const next = Number(value)
  if (next === 0 || next === 1 || next === 2) scoreType.value = next
}

function setMode(value: string | number) {
  mode.value = value === 'overwrite' ? 'overwrite' : 'onlyEmpty'
}

function setMappingEnabled(value: boolean) {
  mappingEnabled.value = value
}

async function loadPreview(keepResult = false) {
  if (!experimentId.value || !activityId.value) return
  if (parsedMapping.value.error) {
    toast.error(parsedMapping.value.error)
    return
  }
  previewing.value = true
  if (!keepResult) result.value = null
  try {
    const data = await fetchXzzdSyncPreview(
      experimentId.value,
      activityId.value,
      scoreType.value,
      parsedMapping.value.mapping,
    )
    preview.value = data
  } catch (error) {
    toast.error(getErrorMessage(error, '获取同步预览失败'))
    preview.value = null
  } finally {
    previewing.value = false
  }
}

async function runApply() {
  if (!experimentId.value || !activityId.value) return
  if (parsedMapping.value.error) {
    toast.error(parsedMapping.value.error)
    return
  }
  applying.value = true
  try {
    const data = await applyXzzdSync(experimentId.value, {
      activityId: activityId.value,
      type: scoreType.value,
      mode: mode.value,
      mapping: parsedMapping.value.mapping,
    })
    result.value = data
    toast.success(`已同步 ${data.create + data.update} 条成绩`)
    void loadPreview(true)
  } catch (error) {
    toast.error(getErrorMessage(error, '同步失败'))
  } finally {
    applying.value = false
    overwriteOpen.value = false
  }
}

function startApply() {
  if (!preview.value || importable.value === 0) return
  if (mode.value === 'overwrite') {
    overwriteOpen.value = true
    return
  }
  void runApply()
}
</script>

<template>
  <div class="mx-auto max-w-4xl">
    <BackLink to="/console/courses/settings#tools">返回课程设置</BackLink>

    <PageHeader title="从学在浙大同步成绩">
      <template v-if="currentClass" #actions>
        <span class="text-xs text-fg-subtle">{{ currentClass.name }}</span>
      </template>
    </PageHeader>

    <UAlert
      variant="subtle"
      class="mb-4"
      color="info"
      icon="i-lucide-info"
      description="适用于先前已在使用学在浙大管理成绩的情况，快捷同步已存在于学在浙大的旧数据。"
    />

    <EmptyState
      v-if="!classId"
      icon="i-lucide-target"
      title="未选择课程"
      hint="请先在右上角选择或绑定一个课程"
    />

    <Card v-else-if="tableLoading" :index="0">
      <SkeletonList :rows="4" class="h-12 rounded-xl" />
    </Card>

    <div v-else class="flex flex-col gap-4">
      <Card :index="0">
        <SectionHeader icon="i-lucide-target">1. 选择同步目标</SectionHeader>
        <div class="mt-4 flex flex-col gap-4">
          <div>
            <label class="mb-1.5 block text-xs font-semibold text-fg-muted">本地实验</label>
            <USelect
              :model-value="experimentId || undefined"
              :items="experimentOptions"
              value-key="value"
              label-key="label"
              :placeholder="experiments.length === 0 ? '当前课程暂无实验' : '选择实验'"
              :disabled="experiments.length === 0"
              aria-label="选择本地实验"
              class="w-full"
              @update:model-value="setExperimentId"
            />
          </div>

          <div>
            <div class="mb-1.5 text-xs font-semibold text-fg-muted">写入评分项</div>
            <UTabs
              :model-value="scoreType"
              :items="SCORE_TYPE_TABS"
              variant="pill"
              :content="false"
              @update:model-value="setScoreType"
            />
            <p class="mt-2 text-[11px] text-fg-subtle">
              学在浙大作业通常只有一个总分，请选择导入后对应的本地评分项。
            </p>
          </div>

          <div class="border-t border-line pt-4">
            <div class="flex items-center justify-between gap-4">
              <div>
                <div class="text-xs font-semibold text-fg-muted">百分比映射</div>
                <div class="text-[11px] text-fg-subtle">
                  将学在浙大成绩区间等比映射到本地成绩区间
                </div>
              </div>
              <USwitch
                aria-label="启用百分比映射"
                :model-value="mappingEnabled"
                @update:model-value="setMappingEnabled"
              />
            </div>

            <div v-if="mappingEnabled" class="mt-3 flex flex-col gap-2">
              <div class="grid grid-cols-2 gap-2 sm:grid-cols-4">
                <div>
                  <label class="mb-1 block text-[10px] font-semibold text-fg-subtle">原成绩始</label>
                  <UInput v-model="mappingDraft.sourceMin" type="number" step="0.1" class="w-full" aria-label="原成绩始" />
                </div>
                <div>
                  <label class="mb-1 block text-[10px] font-semibold text-fg-subtle">原成绩末</label>
                  <UInput v-model="mappingDraft.sourceMax" type="number" step="0.1" class="w-full" aria-label="原成绩末" />
                </div>
                <div>
                  <label class="mb-1 block text-[10px] font-semibold text-fg-subtle">目标始</label>
                  <UInput v-model="mappingDraft.targetMin" type="number" step="0.1" class="w-full" aria-label="目标始" />
                </div>
                <div>
                  <label class="mb-1 block text-[10px] font-semibold text-fg-subtle">目标末</label>
                  <UInput v-model="mappingDraft.targetMax" type="number" step="0.1" class="w-full" aria-label="目标末" />
                </div>
              </div>
              <p v-if="parsedMapping.error" class="text-[11px] text-danger">
                {{ parsedMapping.error }}
              </p>
              <p v-else class="text-[11px] text-fg-subtle">
                映射规则：{{ mappingDraft.sourceMin }}–{{ mappingDraft.sourceMax }} →
                {{ mappingDraft.targetMin }}–{{ mappingDraft.targetMax }}
              </p>
            </div>
          </div>
        </div>
      </Card>

      <Card :index="1">
        <SectionHeader icon="i-lucide-book-open-check">2. 选择学在浙大作业</SectionHeader>
        <p v-if="!experimentId" class="mt-4 text-xs text-fg-subtle">请先选择本地实验。</p>
        <div v-else-if="homeworksLoading" class="mt-4 flex items-center gap-2 text-xs text-fg-subtle">
          <Spinner size="sm" />
          正在获取学在浙大作业…
        </div>
        <p v-else-if="homeworks.length === 0" class="mt-4 text-xs text-fg-subtle">
          该课程在学在浙大中没有可用的作业。
        </p>
        <div v-else class="mt-4 flex flex-col gap-2">
          <div class="flex items-end gap-2">
            <div class="min-w-0 flex-1">
              <label class="mb-1.5 block text-xs font-semibold text-fg-muted">旧作业</label>
              <USelect
                :model-value="activityId || undefined"
                :items="homeworkOptions"
                value-key="value"
                label-key="label"
                placeholder="选择要同步的作业"
                aria-label="选择学在浙大作业"
                class="w-full"
                @update:model-value="setActivityId"
              />
            </div>
            <UButton
              color="neutral" variant="soft"
              :disabled="homeworksLoading"
              @click="homeworksNonce += 1"
            >
              <UIcon name="i-lucide-refresh-cw" class="h-[15px] w-[15px] shrink-0" />
              重新获取
            </UButton>
          </div>
          <p v-if="selectedHomework" class="text-[11px] text-fg-subtle">
            截止 {{ formatDateTime(selectedHomework.endTime, '未设置') }} ·
            {{ selectedHomework.isClosed ? '已关闭' : '进行中' }} · 已有成绩
            {{ selectedHomework.hasScoreCount }} 人
          </p>
          <p class="text-[11px] text-fg-subtle">
            如果提示未保存统一身份认证密码，请先前往
            <RouterLink
              to="/console/settings#zjuam"
              class="font-semibold text-brand-600 hover:underline dark:text-brand-300"
            >
              设置
            </RouterLink>
            保存账号密码。
          </p>
        </div>
      </Card>

      <Card :index="2">
        <SectionHeader icon="i-lucide-list-checks">3. 预览并导入</SectionHeader>

        <div class="mt-4 flex flex-wrap items-center gap-3">
          <PendingButton
            color="neutral" variant="soft"
            icon="i-lucide-refresh-cw"
            loading-label="获取中"
            :loading="previewing"
            :disabled="
              !activityId || !experimentId || applying || Boolean(parsedMapping.error)
            "
            @click="loadPreview()"
          >
            预览可导入成绩
          </PendingButton>
          <span v-if="preview" class="text-[11px] text-fg-subtle">
            上次同步：{{ formatDateTime(preview.lastSyncAt, '尚未同步') }}
          </span>
        </div>

        <UAlert
          variant="subtle"
          v-if="result"
          class="mt-4"
          color="success"
          icon="i-lucide-circle-check"
          :description="`同步完成：新建 ${result.create} 条，覆盖 ${result.update} 条，跳过 ${result.skip} 条，未匹配 ${result.unmatched} 条。`"
        />

        <div v-if="!preview" class="mt-4">
          <EmptyState
            icon="i-lucide-list-checks"
            title="尚未生成预览"
            hint="选择实验和学在浙大作业后，点击“预览可导入成绩”。"
          />
        </div>

        <div v-else class="mt-4 flex flex-col gap-4">
          <div class="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <div
              v-for="stat in summaryStats"
              :key="stat.label"
              class="rounded-xl border border-line bg-sunken px-3 py-2"
            >
              <div class="text-[10px] font-semibold text-fg-subtle">{{ stat.label }}</div>
              <div :class="statClass(stat.tone)">{{ stat.value }}</div>
            </div>
          </div>

          <div class="flex flex-col gap-2">
            <div class="text-xs font-semibold text-fg-muted">冲突处理</div>
            <UTabs
              :model-value="mode"
              :items="MODE_TABS"
              variant="pill"
              :content="false"
              @update:model-value="setMode"
            />
            <p class="text-[11px] text-fg-subtle">
              默认保留本地已有成绩；选择覆盖后会先弹出确认。
            </p>
          </div>

          <div class="max-h-[55vh] overflow-auto rounded-xl border border-line">
            <table class="w-full table-fixed border-separate border-spacing-0 text-sm">
              <colgroup>
                <col class="w-32" />
                <col class="w-32" />
                <col class="w-24" />
                <col class="w-24" />
                <col class="w-24" />
                <col class="w-48" />
                <col />
              </colgroup>
              <thead class="sticky top-0 z-10">
                <tr>
                  <th class="border-b border-r border-line bg-elevated px-3 py-2 text-left font-semibold">姓名</th>
                  <th class="border-b border-r border-line bg-elevated px-3 py-2 text-left font-semibold">学号</th>
                  <th class="border-b border-r border-line bg-elevated px-3 py-2 text-right font-semibold">学在浙大</th>
                  <th class="border-b border-r border-line bg-elevated px-3 py-2 text-right font-semibold">本地</th>
                  <th class="border-b border-r border-line bg-elevated px-3 py-2 text-center font-semibold">将会</th>
                  <th class="border-b border-r border-line bg-elevated px-3 py-2 text-left font-semibold">评语</th>
                  <th class="border-b border-line bg-elevated px-3 py-2 text-left font-semibold">说明</th>
                </tr>
              </thead>
              <tbody>
                <tr
                  v-for="(row, index) in preview.rows"
                  :key="`${row.userId ?? row.studentId}:${index}`"
                  :class="[
                    'transition-colors hover:bg-sunken/40',
                    !row.userId && 'text-fg-subtle',
                  ]"
                >
                  <td class="border-b border-r border-line px-3 py-2 font-medium">{{ row.name }}</td>
                  <td class="tabular border-b border-r border-line px-3 py-2 text-fg-muted">
                    {{ row.studentId || '—' }}
                  </td>
                  <td class="tabular border-b border-r border-line px-3 py-2 text-right">
                    {{ displayScore(row.rawScore) }}
                  </td>
                  <td class="tabular border-b border-r border-line px-3 py-2 text-right text-fg-muted">
                    {{ displayScore(row.localScore) }}
                  </td>
                  <td class="border-b border-r border-line px-3 py-2 text-center">
                    <div class="inline-flex items-center gap-1.5">
                      <UBadge
                        size="sm"
                        variant="soft"
                        :class="actionStyle(row).className"
                      >
                        {{ actionStyle(row).label }}
                      </UBadge>
                      <span
                        v-if="decisionFor(row).action !== 'unchanged' && willScore(row) != null"
                        class="tabular text-xs font-semibold"
                      >
                        {{ displayScore(willScore(row)) }}
                      </span>
                    </div>
                  </td>
                  <td class="border-b border-r border-line px-3 py-2 text-xs text-fg-muted">
                    <div
                      v-if="row.upstreamComment"
                      class="max-w-[12rem] truncate"
                      :title="row.upstreamComment"
                    >
                      {{ row.upstreamComment }}
                    </div>
                    <template v-else>—</template>
                  </td>
                  <td class="border-b border-line px-3 py-2 text-xs text-fg-subtle">
                    {{ row.issue ?? decisionFor(row).reason ?? '—' }}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <div class="flex flex-wrap items-center justify-between gap-3">
            <p class="text-xs text-fg-muted">
              将写入 <span class="font-semibold text-fg">{{ importable }}</span> 条成绩
            </p>
            <PendingButton
              color="primary"
              icon="i-lucide-arrow-right"
              loading-label="导入中"
              :loading="applying"
              :disabled="importable === 0 || previewing || Boolean(parsedMapping.error)"
              @click="startApply"
            >
              导入成绩
            </PendingButton>
          </div>
        </div>
      </Card>
    </div>

    <ConfirmDialog
      v-model:open="overwriteOpen"
      title="覆盖已有成绩？"
      :description="`将覆盖 ${summary?.update ?? 0} 名学生的本地成绩，原成绩不可恢复。`"
      confirm-text="覆盖并导入"
      :loading="applying"
      icon="i-lucide-refresh-cw"
      :danger="false"
      @confirm="runApply"
    />
  </div>
</template>