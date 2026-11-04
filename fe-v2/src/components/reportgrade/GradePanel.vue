<script setup lang="ts">
import type { DropdownMenuItem } from '@nuxt/ui'
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'

import CriteriaGrading from '@/components/criteria/CriteriaGrading.vue'
import {
  decodeReviewContent,
  defaultStates,
  encodeReviewContent,
  totalScore,
} from '@/components/criteria/scoring'
import type {
  CriterionCard,
  CriterionCardState,
  CriterionItem,
  CriterionMode,
} from '@/components/criteria/types'
import RemarkField from '@/components/remarks/RemarkField.vue'
import ConfirmDialog from '@/components/ui/ConfirmDialog.vue'
import Spinner from '@/components/ui/Spinner.vue'
import {
  fetchCriteria,
  fetchReportReview,
  REMARK_TYPE_REPORT,
  saveReportReview,
  saveScore,
  type Score,
} from '@/lib/api'
import { getErrorMessage } from '@/lib/error'
import { formatLocaleDateTime } from '@/lib/format'
import { toast } from '@/lib/toast'
import { UAlert, UButton, UDropdownMenu, UIcon, UInput, UModal, UTextarea } from '@/ui'

import CriteriaModal from './CriteriaModal.vue'
import { loadLocalDefaultRule, type LocalDefaultRule } from './default-rule'
import { formatScore, type GradeStudent, type ReportSync } from './shared'

const props = defineProps<{
  student: GradeStudent | null
  experimentId: string
  sync?: ReportSync | null
  criteriaOpenToken?: number
}>()

const emit = defineEmits<{
  'score-saved': [score: Score]
}>()

const EMPTY_CARD_STATE: CriterionCardState = { selected: false, score: '', appendix: '' }

const router = useRouter()

const items = ref<CriterionItem[] | null>(null)
const ruleKey = ref<string | null>(null)
const states = ref<Record<string, CriterionCardState>>({})
const extras = ref<Record<string, CriterionCard[]>>({})
const dirty = ref(false)
const savedOverride = ref<{ userId: string; score: Score } | null>(null)
const savingReport = ref(false)

const addOpen = ref(false)
const addTarget = ref('root')
const newMode = ref<CriterionMode>('subtract')
const newScore = ref('')
const newRule = ref('')
const newDetail = ref('')

const criteriaOpen = ref(false)
const rangeOpen = ref(false)
const localDefault = ref<LocalDefaultRule | null>(null)
const criteriaMode = ref<'student' | 'experiment'>('student')

const itemsRef = ref<CriterionItem[] | null>(null)
const ruleKeyRef = ref<string | null>(null)
const gradedRef = ref(false)

const userId = computed(() => props.student?.userId ?? null)
const total = computed(() =>
  items.value ? totalScore(items.value, states.value, extras.value) : 0,
)
const hasCriteria = computed(() => items.value != null)
const savedScore = computed(() => {
  const override = savedOverride.value
  if (override && override.userId === userId.value) return override.score
  return props.student?.score ?? null
})
const displayScore = computed(() =>
  hasCriteria.value ? total.value : (savedScore.value?.score ?? null),
)
const showSavedMeta = computed(
  () => savedScore.value != null && (!hasCriteria.value || savedScore.value.score === total.value),
)
const canSaveReport = computed(
  () => hasCriteria.value && userId.value != null && ruleKey.value != null,
)
const remarkSync = computed(() =>
  props.sync && props.sync.userId === userId.value
    ? { nonce: props.sync.nonce, text: props.sync.remark }
    : undefined,
)

let autoSaveTimer: ReturnType<typeof setTimeout> | null = null
let syncLoadSeq = 0

function clearAutoSave() {
  if (autoSaveTimer !== null) {
    clearTimeout(autoSaveTimer)
    autoSaveTimer = null
  }
}

watch(
  () => props.student?.score,
  () => {
    gradedRef.value = props.student?.score != null
  },
  { immediate: true },
)

watch(
  () => props.experimentId,
  (experimentId) => {
    let cancelled = false
    void loadLocalDefaultRule(experimentId).then((rule) => {
      if (!cancelled) localDefault.value = rule
    })
    return () => {
      cancelled = true
    }
  },
  { immediate: true },
)

const lastCriteriaToken = ref(props.criteriaOpenToken)

watch(
  () => props.criteriaOpenToken,
  (token) => {
    if (token === lastCriteriaToken.value) return
    lastCriteriaToken.value = token
    criteriaMode.value = 'experiment'
    criteriaOpen.value = true
  },
)

watch(
  [userId, () => props.experimentId, localDefault],
  ([currentUserId, experimentId, fallback]) => {
    if (!currentUserId) return
    let cancelled = false
    dirty.value = false
    const defaultRule = !gradedRef.value ? fallback : null
    if (defaultRule) {
      items.value = defaultRule.items
      itemsRef.value = defaultRule.items
      ruleKey.value = defaultRule.key
      ruleKeyRef.value = defaultRule.key
      states.value = defaultStates(defaultRule.items)
      extras.value = {}
      return
    }
    fetchReportReview(currentUserId, experimentId)
      .then(async (review) => {
        if (cancelled) return
        if (!review) {
          items.value = null
          itemsRef.value = null
          ruleKey.value = null
          ruleKeyRef.value = null
          states.value = {}
          extras.value = {}
          return
        }
        const content = decodeReviewContent(review.ruleContent)
        ruleKey.value = review.ruleId
        states.value = content.cards
        extras.value = content.extras
        if (review.ruleId === ruleKeyRef.value) return
        const res = await fetchCriteria(review.ruleId)
        if (cancelled) return
        if (res.payload?.items) {
          items.value = res.payload.items
          itemsRef.value = res.payload.items
          ruleKeyRef.value = review.ruleId
        }
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  },
  { immediate: true },
)

watch(
  [() => props.sync, userId],
  ([sync, currentUserId]) => {
    if (!sync || !currentUserId || sync.userId !== currentUserId) return
    const rid = sync.ruleId
    if (!rid) return
    let cancelled = false
    const seq = ++syncLoadSeq
    const apply = (defs: CriterionItem[]) => {
      const content = decodeReviewContent(sync.ruleContent)
      items.value = defs
      itemsRef.value = defs
      ruleKey.value = rid
      ruleKeyRef.value = rid
      states.value = content.cards
      extras.value = content.extras
      dirty.value = true
    }
    if (ruleKeyRef.value === rid && itemsRef.value) {
      apply(itemsRef.value)
      return
    }
    fetchCriteria(rid)
      .then((res) => {
        if (cancelled || seq !== syncLoadSeq) return
        if (res.payload?.items) apply(res.payload.items)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  },
  { immediate: true },
)

watch(
  [
    dirty,
    items,
    ruleKey,
    userId,
    () => props.experimentId,
    states,
    extras,
  ],
  ([isDirty, currentItems, currentRuleKey, currentUserId, experimentId, currentStates, currentExtras]) => {
    clearAutoSave()
    if (!isDirty || !currentItems || !currentRuleKey || !currentUserId) return
    autoSaveTimer = setTimeout(() => {
      autoSaveTimer = null
      const content = encodeReviewContent(currentStates, currentExtras, currentItems)
      saveReportReview({
        userId: currentUserId,
        experimentId,
        ruleId: currentRuleKey,
        ruleContent: content,
      }).catch(() => {
        toast.error('批阅记录保存失败')
      })
    }, 800)
  },
)

onBeforeUnmount(clearAutoSave)

function applyCriteria(loadedItems: CriterionItem[], key: string) {
  items.value = loadedItems
  itemsRef.value = loadedItems
  ruleKey.value = key
  ruleKeyRef.value = key
  states.value = defaultStates(loadedItems)
  extras.value = {}
  dirty.value = false
}

function onDefaultApplied(rule: LocalDefaultRule) {
  localDefault.value = rule
}

async function copyShareCode() {
  if (!ruleKey.value) {
    toast.error('尚未设置评分标准')
    return
  }
  try {
    await navigator.clipboard.writeText(ruleKey.value)
    toast.success('分享码已复制')
  } catch {
    toast.error('复制失败，请手动复制')
  }
}

const menuItems: DropdownMenuItem[][] = [
  [
    {
      label: '创建评分标准',
      icon: 'i-lucide-plus',
      onSelect: () => {
        void router.push(`/console/reports/${props.experimentId}/criteria/new`)
      },
    },
    {
      label: '复制当前评分标准分享码',
      icon: 'i-lucide-copy',
      onSelect: () => {
        void copyShareCode()
      },
    },
    {
      label: '我创建的评分标准',
      icon: 'i-lucide-clipboard-list',
      onSelect: () => {
        void router.push('/console/criteria')
      },
    },
  ],
]

function openCriteriaForStudent() {
  criteriaMode.value = 'student'
  criteriaOpen.value = true
}

function toggleCard(cardId: string) {
  dirty.value = true
  const current = states.value[cardId] ?? EMPTY_CARD_STATE
  states.value = {
    ...states.value,
    [cardId]: { ...current, selected: !current.selected },
  }
}

function setCardScore(cardId: string, score: string) {
  dirty.value = true
  states.value = {
    ...states.value,
    [cardId]: { ...(states.value[cardId] ?? EMPTY_CARD_STATE), score },
  }
}

function setCardAppendix(cardId: string, appendix: string) {
  dirty.value = true
  states.value = {
    ...states.value,
    [cardId]: { ...(states.value[cardId] ?? EMPTY_CARD_STATE), appendix },
  }
}

function openAdd(sectionId: string | null) {
  addTarget.value = sectionId ?? 'root'
  newMode.value = 'subtract'
  newScore.value = ''
  newRule.value = ''
  newDetail.value = ''
  addOpen.value = true
}

function submitAdd() {
  const score = Number(newScore.value)
  if (newScore.value.trim() === '' || !Number.isFinite(score)) {
    toast.error('请输入分值')
    return
  }
  const card: CriterionCard = {
    id: crypto.randomUUID(),
    type: 'card',
    mode: newMode.value,
    rule: newRule.value.trim(),
    detail: newDetail.value.trim(),
    score: String(score),
    scoreMax: '',
    defaultSelected: true,
  }
  const target = addTarget.value
  extras.value = {
    ...extras.value,
    [target]: [...(extras.value[target] ?? []), card],
  }
  states.value = {
    ...states.value,
    [card.id]: { ...EMPTY_CARD_STATE, selected: true },
  }
  dirty.value = true
  addOpen.value = false
}

async function saveReportScore() {
  const currentUserId = userId.value
  const currentRuleKey = ruleKey.value
  const currentItems = items.value
  if (!currentUserId || !currentRuleKey || !currentItems) return
  savingReport.value = true
  try {
    const content = encodeReviewContent(states.value, extras.value, currentItems)
    await saveReportReview({
      userId: currentUserId,
      experimentId: props.experimentId,
      ruleId: currentRuleKey,
      ruleContent: content,
    })
    dirty.value = false
    const res = await saveScore({
      userId: currentUserId,
      type: 2,
      indId: props.experimentId,
      score: total.value,
    })
    savedOverride.value = { userId: currentUserId, score: res.score }
    emit('score-saved', res.score)
    toast.success('已保存报告分')
  } catch (err) {
    toast.error(getErrorMessage(err, '保存失败'))
  } finally {
    savingReport.value = false
  }
}

function requestSaveReport() {
  if (!canSaveReport.value) return
  if (total.value > 100 || total.value < 0) {
    rangeOpen.value = true
    return
  }
  void saveReportScore()
}

function confirmOutOfRange() {
  void saveReportScore().finally(() => {
    rangeOpen.value = false
  })
}

function onKeyDown(event: KeyboardEvent) {
  if (!(event.ctrlKey || event.metaKey) || event.altKey) return
  if (event.key.toLowerCase() !== 's') return
  event.preventDefault()
  requestSaveReport()
}

onMounted(() => {
  window.addEventListener('keydown', onKeyDown)
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeyDown)
})
</script>

<template>
  <div v-if="!student" class="flex h-full items-center justify-center p-6">
    <p class="text-xs text-fg-subtle">请选择学生开始批改</p>
  </div>

  <div v-else class="flex h-full flex-col overflow-auto">
    <div class="sticky top-0 z-10 shrink-0 border-b border-line bg-bg p-4">
      <div class="flex items-center gap-3">
        <div class="min-w-0 flex-1 rounded-xl border border-line bg-sunken px-4 py-3">
          <div class="flex items-center justify-between gap-2">
            <span class="text-[11px] font-semibold text-fg-subtle">当前报告分</span>
            <span
              v-if="displayScore != null"
              class="tabular text-xl font-bold text-brand-600 dark:text-brand-300"
            >
              {{ formatScore(displayScore) }}
            </span>
            <span v-else class="text-sm text-fg-subtle">未批改</span>
          </div>
        </div>
        <UButton
          size="sm"
          color="neutral"
          variant="soft"
          :disabled="!canSaveReport || savingReport"
          aria-keyshortcuts="Control+S Meta+S"
          @click="requestSaveReport"
        >
          <Spinner v-if="savingReport" size="sm" />
          <UIcon v-else name="i-lucide-save" class="h-4 w-4 shrink-0" />
          保存
        </UButton>
      </div>
      <div v-if="displayScore != null" class="mt-2 text-[11px] text-fg-subtle">
        {{
          showSavedMeta && savedScore
            ? `${savedScore.graderName ?? '—'} · ${formatLocaleDateTime(savedScore.updatedAt)}`
            : '未保存'
        }}
      </div>
    </div>

    <div class="flex flex-col gap-3 p-4">
      <span class="text-xs font-semibold text-fg-muted">评分标准</span>
      <div class="flex items-center gap-2">
        <UButton
          color="neutral"
          variant="soft"
          class="flex-1 justify-center"
          @click="openCriteriaForStudent"
        >
          <UIcon name="i-lucide-clipboard-list" class="h-[15px] w-[15px] shrink-0" />
          设置评分标准
        </UButton>
        <UDropdownMenu :items="menuItems" :content="{ align: 'end' }">
          <UButton color="neutral" variant="soft" square aria-label="更多操作">
            <UIcon name="i-lucide-ellipsis" class="h-4 w-4 shrink-0" />
          </UButton>
        </UDropdownMenu>
      </div>

      <UAlert
        variant="subtle"
        v-if="userId == null"
        color="warning"
        icon="i-lucide-triangle-alert"
        description="未在本地名单中匹配到该学号。"
      />
      <CriteriaGrading
        v-else-if="items"
        :items="items"
        :states="states"
        :extras="extras"
        @toggle="toggleCard"
        @score-change="setCardScore"
        @appendix-change="setCardAppendix"
        @add="openAdd"
      />

      <RemarkField
        :user-id="userId"
        :experiment-id="props.experimentId"
        :type="REMARK_TYPE_REPORT"
        :sync="remarkSync"
      />
    </div>

    <UModal v-model:open="addOpen" title="添加卡片" :ui="{ content: 'sm:max-w-md' }">
      <template #body>
        <div class="flex flex-col gap-3">
          <div
            class="flex shrink-0 self-start overflow-hidden rounded-lg border border-line text-xs"
          >
            <UButton
              size="xs"
              :color="newMode === 'add' ? 'success' : 'neutral'"
              :variant="newMode === 'add' ? 'soft' : 'ghost'"
              class="rounded-none"
              @click="newMode = 'add'"
            >
              加分
            </UButton>
            <UButton
              size="xs"
              :color="newMode === 'subtract' ? 'error' : 'neutral'"
              :variant="newMode === 'subtract' ? 'soft' : 'ghost'"
              class="rounded-none border-l border-line"
              @click="newMode = 'subtract'"
            >
              扣分
            </UButton>
          </div>
          <UInput
            :model-value="newScore"
            type="number"
            :min="0"
            step="0.5"
            placeholder="分值（固定值，不支持范围）"
            aria-label="分值"
            @update:model-value="(value) => (newScore = value == null ? '' : String(value))"
          />
          <UInput
            :model-value="newRule"
            placeholder="规则（写在评语中）"
            aria-label="规则"
            @update:model-value="(value) => (newRule = value == null ? '' : String(value))"
          />
          <UTextarea
            :model-value="newDetail"
            :rows="2"
            placeholder="详细标准"
            aria-label="详细标准"
            @update:model-value="(value) => (newDetail = value == null ? '' : String(value))"
          />
        </div>
      </template>
      <template #footer>
        <UButton color="neutral" variant="soft" @click="addOpen = false">取消</UButton>
        <UButton :disabled="newScore.trim() === ''" @click="submitAdd">添加</UButton>
      </template>
    </UModal>

    <ConfirmDialog
      v-model:open="rangeOpen"
      icon="i-lucide-triangle-alert"
      :danger="false"
      title="分数超出范围"
      description="你确定要将分数值设置为在0~100以外的数目吗？"
      confirm-text="确定"
      :loading="savingReport"
      @confirm="confirmOutOfRange"
    />
  </div>

  <CriteriaModal
    v-model:open="criteriaOpen"
    :experiment-id="props.experimentId"
    :show-student-action="criteriaMode === 'student'"
    @apply="applyCriteria"
    @default-applied="onDefaultApplied"
  />
</template>
