<script setup lang="ts">
import EmptyState from '@/components/ui/EmptyState.vue'
import type { CheckoffExperiment } from '@/lib/api'
import { UIcon } from '@/ui'

const props = defineProps<{
  experiments: CheckoffExperiment[]
}>()

const emit = defineEmits<{
  select: [experiment: CheckoffExperiment]
}>()
</script>

<template>
  <EmptyState
    v-if="props.experiments.length === 0"
    icon="i-lucide-flask-conical"
    title="暂无可验收实验"
    hint="请先在实验页创建实验"
  />

  <div v-else class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
    <button
      v-for="(exp, i) in props.experiments"
      :key="exp.id"
      type="button"
      class="animate-fade-up group relative overflow-hidden rounded-2xl border border-line bg-elevated p-5 text-left transition-shadow hover:shadow-xl hover:shadow-brand-500/5"
      :style="{ animationDelay: `${i * 60}ms` }"
      @click="emit('select', exp)"
    >
      <div class="relative">
        <span
          class="tabular rounded-lg bg-brand-500/10 px-2.5 py-1 text-xs font-bold text-brand-600 dark:text-brand-300"
        >
          {{ exp.mark }}
        </span>
        <h3 class="mt-3 truncate text-base font-bold leading-snug text-fg">{{ exp.title }}</h3>
        <div class="mt-3 flex items-center gap-1.5 text-xs text-fg-muted">
          <UIcon name="i-lucide-help-circle" class="size-[13px] shrink-0" />
          <span class="tabular">{{ exp.questionCount }} 题</span>
        </div>
      </div>
    </button>
  </div>
</template>
