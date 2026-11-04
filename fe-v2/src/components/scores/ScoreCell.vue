<script setup lang="ts">
import { computed, ref, watch } from 'vue'

import type { Score } from '@/lib/api'
import { formatLocaleDateTime } from '@/lib/format'
import { SCORE_LIMIT, SCORE_MAX } from '@/lib/scores'
import { toast } from '@/lib/toast'
import { cn } from '@/lib/utils'
import { UInput, UTooltip } from '@/ui'

const props = defineProps<{
  score: Score | null
  onCommit?: (next: number | null) => Promise<void>
  onOutOfRange?: (next: number) => void
}>()

const emit = defineEmits<{
  commit: [next: number | null]
  'out-of-range': [next: number]
}>()

const value = computed(() => props.score?.score ?? null)
const draft = ref(value.value === null ? '' : String(value.value))
const saving = ref(false)

watch(value, (next) => {
  draft.value = next === null ? '' : String(next)
})

const current = computed(() => (value.value === null ? '' : String(value.value)))

const showTooltip = computed(() => Boolean(props.score && props.score.graderName))
const tooltipText = computed(() =>
  props.score?.graderName
    ? `最后由 ${props.score.graderName} 于 ${formatLocaleDateTime(props.score.updatedAt)} 更新`
    : '',
)

async function runCommit(next: number | null) {
  if (props.onCommit) {
    await props.onCommit(next)
    return
  }
  emit('commit', next)
}

function emitOutOfRange(next: number) {
  if (props.onOutOfRange) {
    props.onOutOfRange(next)
    return
  }
  emit('out-of-range', next)
}

async function commit() {
  const trimmed = draft.value.trim()
  if (trimmed === current.value) return
  if (trimmed === '') {
    saving.value = true
    try {
      await runCommit(null)
    } catch {
      draft.value = current.value
    } finally {
      saving.value = false
    }
    return
  }
  const parsed = Number(trimmed)
  if (Number.isNaN(parsed) || parsed < -SCORE_LIMIT || parsed > SCORE_LIMIT) {
    toast.error(`请输入 ${-SCORE_LIMIT}~${SCORE_LIMIT} 的分数`)
    draft.value = current.value
    return
  }
  if (parsed < 0 || parsed > SCORE_MAX) {
    draft.value = current.value
    emitOutOfRange(parsed)
    return
  }
  saving.value = true
  try {
    await runCommit(parsed)
  } catch {
    draft.value = current.value
  } finally {
    saving.value = false
  }
}

function onKeyDown(event: KeyboardEvent) {
  if (event.key === 'Enter') {
    event.preventDefault()
    ;(event.target as HTMLInputElement).blur()
  } else if (event.key === 'Escape') {
    draft.value = current.value
    ;(event.target as HTMLInputElement).blur()
  }
}
</script>

<template>
  <UTooltip
    :text="tooltipText"
    :disabled="!showTooltip"
    arrow
    :content="{ side: 'top' }"
    :delay-duration="200"
  >
    <UInput
      v-model="draft"
      type="number"
      :min="-SCORE_LIMIT"
      :max="SCORE_LIMIT"
      step="1"
      variant="none"
      aria-label="分数"
      :class="cn('w-16', saving && 'opacity-50')"
      :ui="{
        base: 'tabular rounded-lg border border-line bg-elevated px-2 py-1 text-center text-sm outline-none transition-all focus:border-brand-500 focus:ring-2 focus:ring-brand-500/15',
      }"
      @blur="commit"
      @keydown="onKeyDown"
    />
  </UTooltip>
</template>
