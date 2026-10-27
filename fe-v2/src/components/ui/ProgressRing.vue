<script setup lang="ts">
import type { ClassValue } from 'clsx'
import { computed, useId } from 'vue'

import { cn } from '@/lib/utils'

const props = withDefaults(
  defineProps<{
    value: number
    size?: number
    stroke?: number
    showLabel?: boolean
    class?: ClassValue
  }>(),
  {
    size: 76,
    stroke: 7,
    showLabel: true,
  },
)

const gradientId = `progress-ring-gradient-${useId().replace(/[^a-zA-Z0-9]/g, '')}`
const radius = computed(() => (props.size - props.stroke) / 2)
const circumference = computed(() => 2 * Math.PI * radius.value)
const clamped = computed(() => Math.max(0, Math.min(1, props.value)))
const dashoffset = computed(() => circumference.value * (1 - clamped.value))
</script>

<template>
  <div
    :class="cn('relative shrink-0', props.class)"
    :style="{ width: `${props.size}px`, height: `${props.size}px` }"
  >
    <svg :width="props.size" :height="props.size" class="-rotate-90">
      <circle
        :cx="props.size / 2"
        :cy="props.size / 2"
        :r="radius"
        fill="none"
        stroke="var(--bg-sunken)"
        :stroke-width="props.stroke"
      />
      <circle
        :cx="props.size / 2"
        :cy="props.size / 2"
        :r="radius"
        fill="none"
        :stroke="`url(#${gradientId})`"
        :stroke-width="props.stroke"
        stroke-linecap="round"
        :stroke-dasharray="circumference"
        :stroke-dashoffset="dashoffset"
        class="transition-[stroke-dashoffset] duration-700 ease-out"
      />
      <defs>
        <linearGradient :id="gradientId" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="var(--brand-500)" />
          <stop offset="100%" stop-color="var(--amber-500)" />
        </linearGradient>
      </defs>
    </svg>
    <div class="absolute inset-0 flex items-center justify-center">
      <slot>
        <span v-if="props.showLabel" class="tabular text-sm font-bold">
          {{ Math.round(clamped * 100) }}%
        </span>
      </slot>
    </div>
  </div>
</template>
