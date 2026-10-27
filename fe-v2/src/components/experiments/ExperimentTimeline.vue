<script setup lang="ts">
import { formatTimelineTime, type ExperimentTimelineEvent } from '@/lib/experiments'
import { cn } from '@/lib/utils'

defineProps<{
  events: ExperimentTimelineEvent[]
}>()
</script>

<template>
  <ol class="relative flex flex-col">
    <li
      v-for="(event, index) in events"
      :key="`${event.label}-${event.time}`"
      class="relative flex gap-2.5 pb-3 last:pb-0"
    >
      <span
        v-if="index < events.length - 1"
        aria-hidden
        class="absolute left-[4.5px] top-3.5 h-[calc(100%-10px)] w-px bg-line"
      />
      <span
        aria-hidden
        :class="
          cn(
            'relative mt-1 h-2.5 w-2.5 shrink-0 rounded-full',
            event.today
              ? 'bg-amber-500 ring-2 ring-amber-500/25'
              : event.past
                ? 'bg-fg-subtle/40'
                : 'bg-brand-500',
          )
        "
      />
      <span class="flex min-w-0 flex-col">
        <span
          :class="
            cn(
              'text-xs font-semibold',
              event.today ? 'text-amber-600 dark:text-amber-400' : event.past ? 'text-fg-subtle' : 'text-fg',
            )
          "
        >
          {{ event.label }}
        </span>
        <span
          :class="
            cn(
              'tabular text-[11px]',
              event.today ? 'text-fg-muted' : event.past ? 'text-fg-subtle' : 'text-fg-muted',
            )
          "
        >
          {{ formatTimelineTime(event.time) }}
        </span>
      </span>
    </li>
  </ol>
</template>
