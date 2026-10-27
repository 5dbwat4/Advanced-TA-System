<script setup lang="ts">
import type { ClassValue } from 'clsx'
import { RouterLink } from 'vue-router'

import { cn } from '@/lib/utils'
import { UIcon } from '@/ui'

const props = defineProps<{
  to: string
  class?: ClassValue
}>()
</script>

<template>
  <RouterLink
    :to="props.to"
    :class="
      cn(
        'mb-3 inline-flex items-center gap-1 text-xs font-semibold text-fg-subtle transition-colors hover:text-fg-muted',
        props.class,
      )
    "
  >
    <UIcon name="i-lucide-arrow-left" class="h-3.5 w-3.5 shrink-0" />
    <slot />
  </RouterLink>
</template>
