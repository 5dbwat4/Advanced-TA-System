<script setup lang="ts">
import type { ClassValue } from 'clsx'

import { cn } from '@/lib/utils'
import { UIcon } from '@/ui'

const props = defineProps<{
  icon: string
  title: string
  hint?: string
  class?: ClassValue
}>()
</script>

<template>
  <div :class="cn('rounded-2xl border border-dashed border-line p-12 text-center', props.class)">
    <div
      class="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-sunken text-fg-subtle"
    >
      <slot name="icon">
        <UIcon :name="props.icon" class="h-5 w-5 shrink-0" />
      </slot>
    </div>
    <div class="mt-3 text-sm font-semibold text-fg">{{ props.title }}</div>
    <div v-if="props.hint" class="mt-1 text-xs text-fg-subtle">{{ props.hint }}</div>
  </div>
</template>
