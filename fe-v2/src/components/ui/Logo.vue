<script setup lang="ts">
import type { ClassValue } from 'clsx'

import { cn } from '@/lib/utils'

const props = withDefaults(
  defineProps<{
    size?: number
    class?: ClassValue
  }>(),
  {
    size: 32,
  },
)

const src = `${import.meta.env.BASE_URL}favicon.svg`
</script>

<template>
  <img
    :src="src"
    :width="props.size"
    :height="props.size"
    alt=""
    aria-hidden="true"
    draggable="false"
    :class="cn('shrink-0 select-none', props.class)"
  />
</template>
