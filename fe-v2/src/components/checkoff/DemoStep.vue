<script setup lang="ts">
import { UButton, UIcon } from '@/ui'

const emit = defineEmits<{
  next: []
}>()
</script>

<template>
  <div class="animate-fade-up rounded-2xl border border-line bg-elevated p-10 text-center">
    <div
      class="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-500 to-brand-700 text-white shadow-lg shadow-brand-600/30"
    >
      <UIcon name="i-lucide-monitor-play" class="size-[26px] shrink-0" />
    </div>
    <div class="mt-4 text-lg font-bold text-fg">请展示 demo</div>
    <div class="mt-1 text-sm text-fg-subtle">代码 / 上板结果 / 仿真结果等</div>
    <div class="mt-6 flex justify-center">
      <UButton
        size="lg"
        class="bg-gradient-to-r from-brand-600 to-brand-700 shadow-lg shadow-brand-600/25"
        @click="emit('next')"
      >
        下一步
        <UIcon name="i-lucide-arrow-right" class="size-4 shrink-0" />
      </UButton>
    </div>
  </div>
</template>
