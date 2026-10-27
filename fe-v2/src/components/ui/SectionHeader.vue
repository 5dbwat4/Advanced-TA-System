<script setup lang="ts">
import Spinner from '@/components/ui/Spinner.vue'
import { UIcon } from '@/ui'

const props = withDefaults(
  defineProps<{
    icon: string
    busy?: boolean
  }>(),
  {
    busy: false,
  },
)
</script>

<template>
  <div class="flex items-center gap-2">
    <UIcon
      :name="props.icon"
      class="h-4 w-4 shrink-0 text-brand-600 dark:text-brand-300"
    />
    <span class="text-sm font-bold"><slot /></span>
    <Spinner v-if="props.busy" size="sm" />
  </div>
</template>
