<script setup lang="ts">
defineProps<{
  title: string
  hint?: string
}>()
</script>

<template>
  <div class="flex items-center justify-between gap-4 rounded-2xl border border-line bg-elevated px-4 py-3">
    <div class="min-w-0">
      <div class="text-sm font-semibold text-fg">{{ title }}</div>
      <div v-if="hint" class="text-xs text-fg-subtle">{{ hint }}</div>
    </div>
    <div class="flex shrink-0 items-center gap-2">
      <slot />
    </div>
  </div>
</template>
