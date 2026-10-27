<script setup lang="ts">
import { avatarSprite } from 'avatars'
import type { ClassValue } from 'clsx'
import { computed } from 'vue'

import { cn } from '@/lib/utils'

const props = defineProps<{
  id: number | null | undefined
  size: number
  class?: ClassValue
}>()

const sprite = computed(() => avatarSprite(props.id))

const fallbackClass = computed(() =>
  cn(
    'flex shrink-0 items-center justify-center rounded-full bg-amber-500/15 text-sm font-bold text-amber-600 dark:text-amber-400',
    props.class,
  ),
)

const imageClass = computed(() => cn('shrink-0 rounded-full bg-no-repeat', props.class))

const imageStyle = computed(() => {
  const value = sprite.value
  if (!value) return undefined
  return {
    width: `${props.size}px`,
    height: `${props.size}px`,
    backgroundImage: `url("${value.atlas}")`,
    backgroundSize: `${props.size * value.columns}px ${props.size * value.rows}px`,
    backgroundPosition: `-${value.col * props.size}px -${value.row * props.size}px`,
  }
})
</script>

<template>
  <div
    v-if="!sprite"
    aria-hidden="true"
    :class="fallbackClass"
    :style="{ width: `${size}px`, height: `${size}px` }"
  >
    <slot name="fallback" />
  </div>
  <div v-else role="img" :aria-label="sprite.name" :class="imageClass" :style="imageStyle" />
</template>
