<script setup lang="ts">
import { RouterLink } from 'vue-router'

import { UCard, UIcon } from '@/ui'
</script>

<template>
  <div class="mx-auto w-full max-w-xl">
    <header class="border-l-4 border-brand-500 pl-4">
      <h1 class="text-2xl font-bold tracking-tight md:text-3xl">404 Not Found</h1>
    </header>

    <UCard class="mt-6">
      <div class="flex flex-col items-center gap-4 p-4 text-center">
        <UIcon name="i-lucide-compass" class="size-10 shrink-0 text-fg-subtle" />
        <p class="text-sm text-fg-muted">你访问的页面不存在或已被移动。</p>
        <RouterLink
          to="/"
          class="inline-flex items-center gap-2 rounded-xl bg-brand-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand-700"
        >
          <UIcon name="i-lucide-house" class="size-4 shrink-0" />
          返回首页
        </RouterLink>
      </div>
    </UCard>
  </div>
</template>
