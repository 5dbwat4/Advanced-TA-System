<script setup lang="ts">
import Spinner from '@/components/ui/Spinner.vue'
import { UButton, UIcon } from '@/ui'

const props = withDefaults(
  defineProps<{
    loading?: boolean
    loadingLabel?: string
    icon?: string
  }>(),
  {
    loading: false,
  },
)
</script>

<template>
  <UButton>
    <Spinner v-if="props.loading" size="sm" />
    <UIcon v-else-if="props.icon" :name="props.icon" class="h-4 w-4 shrink-0" />
    <template v-if="props.loading && props.loadingLabel">{{ props.loadingLabel }}</template>
    <slot v-else />
  </UButton>
</template>
