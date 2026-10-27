<script setup lang="ts">
import { parseAbsoluteToLocal, type DateValue } from '@internationalized/date'
import { computed } from 'vue'

import { UButton, UFormField, UInputDate } from '@/ui'

const props = defineProps<{
  modelValue: string | null
  label: string
  disabled?: boolean
}>()

const emit = defineEmits<{
  'update:modelValue': [value: string | null]
}>()

function toZoned(value: string | null) {
  if (!value) return null
  try {
    return parseAbsoluteToLocal(value)
  } catch {
    return null
  }
}

const value = computed(() => toZoned(props.modelValue))

function isDateValue(value: unknown): value is DateValue {
  return (
    typeof value === 'object' &&
    value !== null &&
    'toDate' in value &&
    typeof (value as { toDate?: unknown }).toDate === 'function'
  )
}

function onUpdate(next: unknown) {
  emit('update:modelValue', isDateValue(next) ? next.toDate('UTC').toISOString() : null)
}

function clear() {
  emit('update:modelValue', null)
}
</script>

<template>
  <UFormField :label="props.label" class="w-full">
    <UInputDate
      :model-value="value"
      class="w-full"
      granularity="minute"
      :hour-cycle="24"
      hide-time-zone
      :disabled="props.disabled"
      @update:model-value="onUpdate"
    >
      <template #trailing>
        <UButton
          v-if="props.modelValue && !props.disabled"
          icon="i-lucide-x"
          color="neutral"
          variant="ghost"
          size="xs"
          square
          :aria-label="`清除${props.label}`"
          @click="clear"
        />
      </template>
    </UInputDate>
  </UFormField>
</template>
