<script setup lang="ts">
import { cn } from '@/lib/utils'
import { UIcon } from '@/ui'

const TONES = {
  brand: 'bg-brand-500/10 text-brand-600 dark:text-brand-300',
  amber: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
  success: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
  purple: 'bg-purple-500/10 text-purple-600 dark:text-purple-400',
} as const

const props = withDefaults(
  defineProps<{
    icon: string
    label: string
    value: number
    suffix?: string
    tone?: keyof typeof TONES
    index?: number
  }>(),
  {
    tone: 'brand',
    index: 0,
  },
)
</script>

<template>
  <div
    class="animate-fade-up rounded-2xl border border-line bg-elevated p-5 transition-shadow hover:shadow-lg hover:shadow-brand-500/5"
    :style="{ animationDelay: `${props.index * 80}ms` }"
  >
    <div :class="cn('flex h-10 w-10 items-center justify-center rounded-xl', TONES[props.tone])">
      <UIcon :name="props.icon" class="h-[19px] w-[19px] shrink-0" />
    </div>
    <div class="mt-3 text-xs font-semibold uppercase tracking-wider text-fg-subtle">
      {{ props.label }}
    </div>
    <div class="mt-1 flex items-baseline gap-1">
      <span class="tabular text-3xl font-bold tracking-tight">{{ props.value }}</span>
      <span v-if="props.suffix" class="text-sm text-fg-muted">{{ props.suffix }}</span>
    </div>
  </div>
</template>
