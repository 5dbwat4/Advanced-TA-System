<script setup lang="ts">
import { cn } from '@/lib/utils'
import { UButton, UIcon } from '@/ui'

const props = defineProps<{
  step: number
  hasExperiment: boolean
  hasStudent: boolean
}>()

const emit = defineEmits<{
  step: [step: number]
}>()

const STEPS: { label: string; icon: string }[] = [
  { label: '选择实验', icon: 'i-lucide-flask-conical' },
  { label: '定位学生', icon: 'i-lucide-user-search' },
  { label: '展示 demo', icon: 'i-lucide-monitor-play' },
  { label: '现场抽题', icon: 'i-lucide-help-circle' },
  { label: '录入成绩', icon: 'i-lucide-pen-line' },
]

function canGo(target: number): boolean {
  if (target === 0) return true
  if (target === 1) return props.hasExperiment
  return props.hasExperiment && props.hasStudent
}

function stepClass(index: number): string {
  const active = props.step === index
  const done = props.step > index
  const allowed = canGo(index)
  return cn(
    'relative h-auto flex-1 justify-center gap-2 whitespace-nowrap rounded-xl px-3 py-2 text-xs font-semibold sm:text-sm',
    active
      ? 'bg-gradient-to-r from-brand-600 to-brand-700 text-white shadow-md shadow-brand-600/25 hover:bg-transparent'
      : done
        ? 'text-brand-600 hover:bg-brand-500/10 dark:text-brand-300'
        : allowed
          ? 'text-fg-muted hover:bg-sunken'
          : 'cursor-not-allowed text-fg-subtle/50',
  )
}
</script>

<template>
  <div
    class="flex items-center gap-1 overflow-x-auto rounded-2xl border border-line bg-elevated p-1.5 sm:gap-2"
  >
    <UButton
      v-for="(meta, i) in STEPS"
      :key="meta.label"
      type="button"
      variant="ghost"
      :disabled="!canGo(i)"
      :class="stepClass(i)"
      @click="emit('step', i)"
    >
      <UIcon
        :name="props.step > i ? 'i-lucide-check' : meta.icon"
        class="size-[15px] shrink-0"
      />
      <span class="hidden sm:inline">{{ meta.label }}</span>
    </UButton>
  </div>
</template>
