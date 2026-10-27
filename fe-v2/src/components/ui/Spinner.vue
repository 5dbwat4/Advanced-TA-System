<script setup lang="ts">
import { computed } from 'vue'

import { UIcon } from '@/ui'

const props = withDefaults(
  defineProps<{
    size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl'
    color?: string
    label?: string
    mode?: 'svg' | 'css'
  }>(),
  {
    size: 'md',
    color: 'currentColor',
    label: '加载中',
    mode: 'css',
  },
)

const pixels = computed(() => {
  switch (props.size) {
    case 'xs':
      return 12
    case 'sm':
      return 16
    case 'lg':
      return 32
    case 'xl':
      return 48
    default:
      return 20
  }
})

const resolvedColor = computed(() => (props.color === 'current' ? 'currentColor' : props.color))
</script>

<template>
  <span role="status" :aria-label="label" class="inline-flex items-center justify-center">
    <UIcon
      name="i-lucide-loader-circle"
      class="animate-spin"
      :style="{ width: `${pixels}px`, height: `${pixels}px`, color: resolvedColor }"
    />
  </span>
</template>
