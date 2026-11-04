<script setup lang="ts">
import { computed, ref, watch, type CSSProperties } from 'vue'

import { SCORE_TYPES } from '@/lib/scores'
import { ratioPercentages } from '@/lib/scoring'
import { UInput } from '@/ui'

const SEGMENT_STYLES: CSSProperties[] = [
  {
    backgroundImage: 'repeating-linear-gradient(135deg, currentColor 0 1px, transparent 1px 4px)',
  },
  {
    backgroundImage: 'radial-gradient(currentColor 0.8px, transparent 1px)',
    backgroundSize: '4px 4px',
  },
  {
    backgroundImage: 'repeating-linear-gradient(45deg, currentColor 0 1px, transparent 1px 4px)',
  },
]

const props = withDefaults(
  defineProps<{
    value: number[]
    disabled?: boolean
  }>(),
  {
    disabled: false,
  },
)

const emit = defineEmits<{
  change: [value: number[]]
  'update:value': [value: number[]]
}>()

function parseWeight(raw: unknown): number {
  const n = Math.floor(Number(raw))
  return Number.isFinite(n) && n > 0 ? n : 0
}

const incoming = computed(() => props.value.map(parseWeight).join(','))
const drafts = ref<string[]>(props.value.map(String))

watch(incoming, (next) => {
  const parsed = drafts.value.map((draft) => String(parseWeight(draft))).join(',')
  if (parsed !== next) drafts.value = next.split(',')
})

function setAt(index: number, raw: string | number) {
  const next = drafts.value.map((draft, i) => (i === index ? String(raw) : draft))
  drafts.value = next
  const parsed = next.map(parseWeight)
  emit('change', parsed)
  emit('update:value', parsed)
}

const percentages = computed(() => ratioPercentages(props.value))
const hasWeight = computed(() => percentages.value.some((item) => item > 0))

function segmentStyle(index: number): CSSProperties {
  return {
    width: `${percentages.value[index]}%`,
    ...SEGMENT_STYLES[index % SEGMENT_STYLES.length],
  }
}
</script>

<template>
  <div class="flex flex-col gap-4">
    <div class="grid grid-cols-3 gap-2">
      <div
        v-for="item in SCORE_TYPES"
        :key="item.value"
        class="text-center text-xs font-semibold text-fg-muted"
      >
        {{ item.label }}
      </div>
      <UInput
        v-for="(item, index) in SCORE_TYPES"
        :key="item.value"
        type="number"
        :min="0"
        :step="1"
        inputmode="numeric"
        :disabled="disabled"
        :aria-label="`${item.label}权重`"
        :model-value="drafts[index] ?? '0'"
        class="tabular w-full"
        :ui="{
          base: 'w-full rounded-xl px-2 py-1.5 text-center text-sm transition-all focus:ring-2 focus:ring-brand-500/15',
        }"
        @update:model-value="(value) => setAt(index, value as string | number)"
      />
    </div>

    <div class="flex h-3.5 w-full overflow-hidden rounded-full border border-fg-muted/60 bg-sunken">
      <template v-if="hasWeight">
        <div
          v-for="(item, index) in SCORE_TYPES"
          :key="item.value"
          class="h-full text-fg-muted opacity-60 transition-all"
          :class="index > 0 ? 'border-l border-current' : ''"
          :style="segmentStyle(index)"
        />
      </template>
    </div>

    <div class="flex flex-wrap items-center gap-x-4 gap-y-1">
      <div
        v-for="(item, index) in SCORE_TYPES"
        :key="item.value"
        class="flex items-center gap-1.5 text-[11px] text-fg-subtle"
      >
        <span
          class="h-3 w-3 shrink-0 rounded-[3px] text-fg-muted opacity-60"
          :style="SEGMENT_STYLES[index % SEGMENT_STYLES.length]"
        />
        <span>{{ item.label }}</span>
        <span class="tabular font-semibold text-fg-muted">
          {{ percentages[index]?.toFixed(0) }}%
        </span>
      </div>
    </div>
  </div>
</template>
