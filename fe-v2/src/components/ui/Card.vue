<script setup lang="ts">
import type { ClassValue } from 'clsx'

import { cn } from '@/lib/utils'

const props = withDefaults(
  defineProps<{
    index?: number
    hover?: boolean
    class?: ClassValue
  }>(),
  {
    index: 0,
    hover: false,
  },
)
</script>

<template>
  <div
    :class="
      cn(
        'animate-fade-up rounded-2xl border border-line bg-elevated p-5',
        props.hover && 'transition-shadow hover:shadow-lg hover:shadow-brand-500/5',
        props.class,
      )
    "
    :style="{ animationDelay: `${props.index * 60}ms` }"
  >
    <slot />
  </div>
</template>
