<script setup lang="ts">
import type { ClassValue } from 'clsx'

import Spinner from '@/components/ui/Spinner.vue'
import { cn } from '@/lib/utils'
import { UButton, UInput } from '@/ui'

const props = withDefaults(
  defineProps<{
    modelValue: string
    placeholder?: string
    loading?: boolean
    autofocus?: boolean
    ariaLabel?: string
    class?: ClassValue
  }>(),
  {
    placeholder: '搜索',
    loading: false,
    autofocus: false,
    ariaLabel: '搜索',
  },
)

const emit = defineEmits<{
  'update:modelValue': [value: string]
}>()

function onUpdate(value: string | number) {
  emit('update:modelValue', String(value ?? ''))
}

function clear() {
  emit('update:modelValue', '')
}
</script>

<template>
  <UInput
    :model-value="props.modelValue"
    :placeholder="props.placeholder"
    :autofocus="props.autofocus"
    :aria-label="props.ariaLabel"
    icon="i-lucide-search"
    :class="cn('w-full', props.class)"
    @update:model-value="onUpdate"
  >
    <template #trailing>
      <div class="flex items-center gap-1">
        <Spinner v-if="props.loading" size="sm" />
        <UButton
          v-if="props.modelValue"
          icon="i-lucide-x"
          color="neutral"
          variant="ghost"
          size="xs"
          square
          aria-label="清除"
          @click="clear"
        />
      </div>
    </template>
  </UInput>
</template>
