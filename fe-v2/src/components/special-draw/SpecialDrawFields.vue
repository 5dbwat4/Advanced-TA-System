<script setup lang="ts">
import { computed } from 'vue'

import {
  END_VALUE,
  FLAG_OPTIONS,
  NODE_TYPE_LABEL,
} from '@/components/special-draw/special-draw-ui'
import type { SpecialDrawNode } from '@/lib/special-draw'
import { UInput, UInputNumber, USelect } from '@/ui'

defineOptions({ inheritAttrs: false })

type Kind = 'field' | 'node' | 'flag' | 'boolean' | 'number' | 'text'

type SelectOption = { label: string; value: string }

const props = withDefaults(
  defineProps<{
    kind: Kind
    label?: string
    value?: string | number | boolean | null
    nodes?: SpecialDrawNode[]
    nodeIndex?: Map<string, number>
    excludeId?: string
    trueLabel?: string
    falseLabel?: string
    min?: number
    max?: number
    step?: number
  }>(),
  {
    trueLabel: '真',
    falseLabel: '假',
  },
)

const emit = defineEmits<{
  change: [value: string | number | boolean | null]
}>()

const modelValue = computed(() => {
  if (props.kind === 'node') return props.value == null ? END_VALUE : String(props.value)
  if (props.kind === 'flag') return String(props.value ?? 0)
  if (props.kind === 'boolean') return props.value === true ? 'true' : 'false'
  return ''
})

const items = computed<SelectOption[]>(() => {
  if (props.kind === 'node') {
    const nodes = (props.nodes ?? [])
      .filter((node) => node.id !== props.excludeId)
      .map((node) => ({
        label: `#${(props.nodeIndex?.get(node.id) ?? 0) + 1} ${NODE_TYPE_LABEL[node.type]}`,
        value: node.id,
      }))
    return [{ label: '结束', value: END_VALUE }, ...nodes]
  }
  if (props.kind === 'flag') {
    return FLAG_OPTIONS.map((flag) => ({ label: `flag ${flag}`, value: String(flag) }))
  }
  if (props.kind === 'boolean') {
    return [
      { label: props.trueLabel, value: 'true' },
      { label: props.falseLabel, value: 'false' },
    ]
  }
  return []
})

const numberValue = computed(() => (typeof props.value === 'number' ? props.value : null))
const textValue = computed(() => (props.value == null ? '' : String(props.value)))

function onSelectChange(next: unknown) {
  if (props.kind === 'node') {
    const key = next == null ? null : String(next)
    emit('change', key == null || key === END_VALUE ? null : key)
  } else if (props.kind === 'flag') {
    if (next != null) emit('change', Number(next))
  } else if (props.kind === 'boolean') {
    emit('change', next === 'true' || next === true)
  }
}

function onNumberChange(next: unknown) {
  emit('change', typeof next === 'number' ? next : null)
}

function onTextChange(next: unknown) {
  emit('change', typeof next === 'string' ? next : '')
}
</script>

<template>
  <div v-if="kind === 'field'" v-bind="$attrs">
    <div class="mb-1 text-[11px] font-semibold text-fg-muted">{{ label }}</div>
    <slot />
  </div>
  <USelect
    v-else-if="kind === 'node' || kind === 'flag' || kind === 'boolean'"
    v-bind="$attrs"
    :aria-label="label"
    :model-value="modelValue"
    :items="items"
    class="w-full"
    @update:model-value="onSelectChange"
  />
  <UInputNumber
    v-else-if="kind === 'number'"
    v-bind="$attrs"
    :aria-label="label"
    :model-value="numberValue"
    :min="min"
    :max="max"
    :step="step"
    @update:model-value="onNumberChange"
  />
  <UInput
    v-else
    v-bind="$attrs"
    :aria-label="label"
    :model-value="textValue"
    @update:model-value="onTextChange"
  />
</template>
