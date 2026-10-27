<script setup lang="ts">
import AvatarImage from '@/components/ui/AvatarImage.vue'

const props = withDefaults(
  defineProps<{
    avatar: number | null
    name: string
    studentId: string
    size?: 'sm' | 'lg'
  }>(),
  {
    size: 'sm',
  },
)
</script>

<template>
  <div :class="props.size === 'lg' ? 'flex items-center gap-4' : 'flex items-center gap-3'">
    <AvatarImage :id="props.avatar" :size="props.size === 'lg' ? 44 : 36">
      <template #fallback>{{ props.name.slice(0, 1) }}</template>
    </AvatarImage>
    <div class="min-w-0 flex-1">
      <div class="truncate font-semibold text-fg">{{ props.name }}</div>
      <div class="tabular mt-0.5 text-xs text-fg-muted">{{ props.studentId }}</div>
    </div>
  </div>
</template>
