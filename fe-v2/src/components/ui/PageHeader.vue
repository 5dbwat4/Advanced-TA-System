<script setup lang="ts">
defineProps<{
  title: string
}>()
</script>

<template>
  <div class="mb-6 flex animate-fade-up flex-wrap items-end justify-between gap-4">
    <div>
      <h1 class="text-2xl font-bold tracking-tight md:text-3xl">{{ title }}</h1>
      <div v-if="$slots.subtitle" class="mt-1 text-sm text-fg-muted">
        <slot name="subtitle" />
      </div>
    </div>
    <div v-if="$slots.actions" class="flex items-center gap-2">
      <slot name="actions" />
    </div>
  </div>
</template>
