<script setup lang="ts">
import Spinner from '@/components/ui/Spinner.vue'
import { UButton, UTooltip } from '@/ui'

defineOptions({ inheritAttrs: false })

const emit = defineEmits<{ click: [event: MouseEvent] }>()

const props = withDefaults(
  defineProps<{
    label: string
    tooltip?: string
    placement?: 'top' | 'bottom' | 'left' | 'right'
    size?: 'sm' | 'md'
    variant?: 'solid' | 'outline' | 'soft' | 'subtle' | 'ghost' | 'link'
    disabled?: boolean
    loading?: boolean
  }>(),
  {
    placement: 'top',
    size: 'sm',
    variant: 'ghost',
    disabled: false,
    loading: false,
  },
)
</script>

<template>
  <UTooltip :text="props.tooltip ?? props.label" arrow :content="{ side: props.placement }">
    <UButton
      v-bind="$attrs"
      square
      :size="props.size"
      :variant="props.variant"
      :aria-label="props.label"
      :disabled="props.disabled"
      @click="emit('click', $event)"
    >
      <Spinner v-if="props.loading" size="sm" />
      <slot v-else />
    </UButton>
    <template v-if="$slots.tooltip" #content>
      <slot name="tooltip" />
    </template>
  </UTooltip>
</template>
