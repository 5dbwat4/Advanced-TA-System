<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'

import type { QuestionMark } from '@/components/checkoff/QuestionDrawer.vue'
import AvatarImage from '@/components/ui/AvatarImage.vue'
import PendingButton from '@/components/ui/PendingButton.vue'
import {
  fetchRemark,
  REMARK_TYPE_CHECKOFF,
  saveRemark,
  submitCheckoff,
  type CheckoffStudent,
  type Score,
} from '@/lib/api'
import { getErrorMessage } from '@/lib/error'
import { SCORE_MAX } from '@/lib/scores'
import { weightedTotal } from '@/lib/scoring'
import { toast } from '@/lib/toast'
import { UIcon, UInput, USlider, UTextarea } from '@/ui'

const props = defineProps<{
  experimentId: string
  student: CheckoffStudent
  marks: Record<string, QuestionMark | undefined>
  existingScores: Score[]
  ratio: number[]
}>()

const emit = defineEmits<{
  saved: []
}>()

const SCORED_TYPES = [
  { value: 0, label: '功能测试', icon: 'i-lucide-clipboard-check' },
  { value: 1, label: '验收问答', icon: 'i-lucide-message-circle-question' },
] as const

const DEFAULT_SCORE = 100

const values = ref<Record<number, number>>({ 0: DEFAULT_SCORE, 1: DEFAULT_SCORE })
const saving = ref(false)

const remarkText = ref('')
const remarkSaved = ref('')
const remarkLoading = ref(false)
const remarkSaving = ref(false)
let remarkTimer: ReturnType<typeof setTimeout> | null = null

function clearRemarkTimer() {
  if (remarkTimer) {
    clearTimeout(remarkTimer)
    remarkTimer = null
  }
}

watch(
  [() => props.student.userId, () => props.experimentId],
  ([userId], _old, onCleanup) => {
    clearRemarkTimer()
    remarkText.value = ''
    remarkSaved.value = ''
    remarkLoading.value = true
    if (!userId) {
      remarkLoading.value = false
      return
    }
    let cancelled = false
    onCleanup(() => {
      cancelled = true
    })
    fetchRemark(userId, props.experimentId, REMARK_TYPE_CHECKOFF)
      .then((remark) => {
        if (cancelled) return
        const value = remark?.text ?? ''
        remarkText.value = value
        remarkSaved.value = value
      })
      .catch(() => undefined)
      .finally(() => {
        if (!cancelled) remarkLoading.value = false
      })
  },
  { immediate: true },
)

watch(remarkText, (text) => {
  clearRemarkTimer()
  if (remarkLoading.value || !props.student.userId || text === remarkSaved.value) return
  remarkTimer = setTimeout(() => {
    void persistRemark(text)
  }, 800)
})

async function persistRemark(value: string) {
  const userId = props.student.userId
  if (!userId || value === remarkSaved.value) return
  remarkSaving.value = true
  try {
    await saveRemark({
      userId,
      experimentId: props.experimentId,
      type: REMARK_TYPE_CHECKOFF,
      text: value,
    })
    remarkSaved.value = value
  } catch (error) {
    toast.error(getErrorMessage(error, '附言保存失败'))
  } finally {
    remarkSaving.value = false
  }
}

function resetValues() {
  const next: Record<number, number> = { 0: DEFAULT_SCORE, 1: DEFAULT_SCORE }
  for (const type of SCORED_TYPES) {
    const found = props.existingScores.find((score) => score.type === type.value)
    if (found) next[type.value] = found.score
  }
  values.value = next
}

watch([() => props.student.userId, () => props.existingScores], resetValues, { immediate: true })

const weights = computed(() => {
  const raw = SCORED_TYPES.map((type) => props.ratio[type.value] ?? 0)
  return raw[0] <= 0 && raw[1] <= 0 ? [1, 1] : raw
})

const total = computed(
  () => weightedTotal([values.value[0], values.value[1]], weights.value) ?? 0,
)

const correctCount = computed(
  () => Object.values(props.marks).filter((mark) => mark === 'correct').length,
)
const partialCount = computed(
  () => Object.values(props.marks).filter((mark) => mark === 'partial').length,
)
const tallyLabel = computed(() =>
  correctCount.value + partialCount.value > 0
    ? `参考：${correctCount.value} 对 · ${partialCount.value} 半对`
    : null,
)

function setValue(type: number, next: number) {
  values.value = {
    ...values.value,
    [type]: Math.min(SCORE_MAX, Math.max(0, Math.round(next))),
  }
}

function onSliderUpdate(type: number, value: number | number[] | undefined) {
  setValue(type, Array.isArray(value) ? value[0] : (value ?? 0))
}

function onNumberUpdate(type: number, value: string | number | null) {
  setValue(type, Number(value ?? 0))
}

async function save() {
  const scores = SCORED_TYPES.map((type) => ({
    type: type.value,
    score: values.value[type.value],
  }))
  saving.value = true
  try {
    await submitCheckoff({ experimentId: props.experimentId, userId: props.student.userId, scores })
    toast.success(`已保存 · ${props.student.name}`)
    emit('saved')
  } catch (error) {
    toast.error(getErrorMessage(error, '保存失败'))
  } finally {
    saving.value = false
  }
}

function onKeydown(event: KeyboardEvent) {
  if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
    event.preventDefault()
    void save()
  }
}

onMounted(() => window.addEventListener('keydown', onKeydown))
onUnmounted(() => {
  window.removeEventListener('keydown', onKeydown)
  clearRemarkTimer()
})
</script>

<template>
  <div>
    <div class="mb-4 flex items-center gap-3 rounded-2xl border border-line bg-elevated px-4 py-3">
      <AvatarImage :id="props.student.avatar" :size="36">
        <template #fallback>{{ props.student.name.slice(0, 1) }}</template>
      </AvatarImage>
      <div class="min-w-0 flex-1">
        <span class="font-semibold text-fg">{{ props.student.name }}</span>
        <span class="tabular ml-2 text-xs text-fg-muted">{{ props.student.studentId }}</span>
      </div>
      <span class="text-xs text-fg-subtle">默认 100，可按需下调</span>
    </div>

    <div class="grid gap-4 lg:grid-cols-[2fr_1fr]">
      <div class="space-y-4">
        <div
          v-for="(type, index) in SCORED_TYPES"
          :key="type.value"
          class="rounded-2xl border border-line bg-elevated p-5"
        >
          <div class="mb-3 flex items-center justify-between gap-2">
            <label class="flex items-center gap-2 text-sm font-semibold text-fg-muted">
              <UIcon :name="type.icon" class="size-[15px] shrink-0" />
              {{ type.label }}
              <span
                class="tabular rounded-md bg-sunken px-1.5 py-0.5 text-[11px] font-semibold text-fg-subtle"
              >
                ×{{ weights[index] }}
              </span>
            </label>
            <span
              v-if="type.value === 1 && tallyLabel"
              class="tabular text-[11px] font-semibold text-brand-600 dark:text-brand-300"
            >
              {{ tallyLabel }}
            </span>
          </div>

          <div class="flex items-center gap-4">
            <USlider
              :model-value="values[type.value]"
              :min="0"
              :max="SCORE_MAX"
              :step="1"
              :aria-label="type.label"
              class="flex-1"
              @update:model-value="(value) => onSliderUpdate(type.value, value)"
            />

            <UInput
              type="number"
              :min="0"
              :max="SCORE_MAX"
              step="1"
              inputmode="numeric"
              :aria-label="type.label"
              :model-value="values[type.value]"
              class="tabular w-24 shrink-0"
              :ui="{ base: 'text-center text-lg font-bold' }"
              @update:model-value="(value) => onNumberUpdate(type.value, value)"
            />
          </div>
        </div>
      </div>

      <div
        class="relative flex flex-col justify-between overflow-hidden rounded-2xl border border-line bg-gradient-to-br from-brand-950 to-brand-900 p-6 text-white"
      >
        <div
          class="pointer-events-none absolute -right-12 -top-12 h-40 w-40 rounded-full bg-amber-500/20 blur-[50px]"
        />
        <div class="relative">
          <div class="text-xs font-semibold uppercase tracking-widest text-white/50">总分</div>
          <div class="tabular mt-2 text-5xl font-bold tracking-tight">{{ total }}</div>
          <div class="tabular mt-1 text-sm text-white/60">/ {{ SCORE_MAX }}</div>
        </div>
        <div
          class="relative mt-6 flex items-center gap-2 border-t border-white/10 pt-4 text-xs text-white/50"
        >
          <UIcon name="i-lucide-info" class="size-[13px] shrink-0" />
          {{ SCORED_TYPES.map((type, index) => `${type.label} ×${weights[index]}`).join(' · ') }}
          （占比 {{ weights.join(' : ') }}）
        </div>
      </div>
    </div>

    <div class="mt-4 rounded-2xl border border-line bg-elevated p-5">
      <div class="flex flex-col gap-1.5">
        <div class="flex items-center justify-between gap-2">
          <span class="text-xs font-semibold text-fg-muted">附言</span>
          <span v-if="remarkSaving" class="text-[11px] text-fg-subtle">保存中…</span>
        </div>
        <UTextarea
          v-model="remarkText"
          :rows="3"
          :disabled="remarkLoading || !props.student.userId"
          :placeholder="props.student.userId ? '可以是评价、说明、鼓励等等' : '请先选择学生'"
          aria-label="附言"
          class="w-full"
          :ui="{ base: 'resize-y' }"
        />
      </div>
    </div>

    <div class="mt-5 flex items-center justify-between gap-3">
      <span class="hidden items-center gap-1.5 text-xs text-fg-subtle sm:flex">
        <kbd class="rounded-md border border-line bg-sunken px-1.5 py-0.5 font-mono text-[10px]">Ctrl</kbd>
        <kbd class="rounded-md border border-line bg-sunken px-1.5 py-0.5 font-mono text-[10px]">↵</kbd>
        保存并继续
      </span>
      <PendingButton
        size="lg"
        :loading="saving"
        icon="i-lucide-check"
        class="w-full bg-gradient-to-r from-emerald-600 to-emerald-700 shadow-lg shadow-emerald-600/25 sm:w-auto sm:min-w-64"
        @click="save"
      >
        保存并下一位
      </PendingButton>
    </div>
  </div>
</template>
