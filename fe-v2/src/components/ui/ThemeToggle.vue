<script setup lang="ts">
import { useTheme } from '@/lib/theme'
import { UButton, UIcon } from '@/ui'

const { isDark, toggleTheme } = useTheme()
</script>

<template>
  <UButton
    color="neutral"
    variant="ghost"
    square
    aria-label="切换主题"
    :title="isDark ? '切换到浅色' : '切换到深色'"
    @click="toggleTheme"
  >
    <UIcon
      :name="isDark ? 'i-lucide-moon' : 'i-lucide-sun'"
      class="h-[18px] w-[18px] shrink-0"
    />
  </UButton>
</template>
