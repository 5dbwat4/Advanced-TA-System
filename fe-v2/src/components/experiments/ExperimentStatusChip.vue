<script setup lang="ts">
import { computed } from 'vue'

import type { Experiment } from '@/lib/api'
import { experimentTimeline } from '@/lib/experiments'
import { UBadge, UTooltip } from '@/ui'

import ExperimentTimeline from './ExperimentTimeline.vue'

const props = defineProps<{
  experiment: Experiment
}>()

const info = computed(() => experimentTimeline(props.experiment))

const badgeColor = computed<'neutral' | 'warning' | 'success'>(() => {
  const color = info.value.status.color
  return color === 'default' ? 'neutral' : color
})
</script>

<template>
  <UTooltip :delay-duration="150" arrow :content="{ side: 'left' }">
    <UBadge :color="badgeColor" variant="soft" size="sm">
      {{ info.status.label }}
    </UBadge>
    <template #content>
      <div class="flex max-w-[16rem] flex-col gap-2 p-1">
        <div class="text-xs font-bold">实验时间线</div>
        <div v-if="info.events.length === 0" class="text-[11px] text-fg-subtle">
          尚未设置时间线，可在实验详情页设置
        </div>
        <ExperimentTimeline v-else :events="info.events" />
      </div>
    </template>
  </UTooltip>
</template>
