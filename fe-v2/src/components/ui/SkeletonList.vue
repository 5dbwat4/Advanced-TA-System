<script setup lang="ts">
import type { ClassValue } from 'clsx'

import { cn } from '@/lib/utils'
import { USkeleton } from '@/ui'

const props = withDefaults(
  defineProps<{
    rows?: number
    class?: ClassValue
  }>(),
  {
    rows: 4,
  },
)
</script>

<template>
  <div class="space-y-3">
    <USkeleton
      v-for="row in props.rows"
      :key="row"
      :class="cn('h-12 rounded-xl', props.class)"
    />
  </div>
</template>
