<script setup lang="ts">
import { RouterLink } from 'vue-router'

import Markdown from '@/components/ui/Markdown.vue'
import ThemeToggle from '@/components/ui/ThemeToggle.vue'
import { TERMS_MARKDOWN } from '@/content/terms'
import { UIcon } from '@/ui'
</script>

<template>
  <div class="mx-auto max-w-3xl px-6 py-12">
    <div class="flex items-center justify-between gap-4">
      <RouterLink
        to="/login"
        class="inline-flex items-center gap-2 text-sm font-medium text-fg-muted transition-colors hover:text-fg"
      >
        <UIcon name="i-lucide-arrow-left" class="size-4 shrink-0" />
        返回
      </RouterLink>
      <ThemeToggle />
    </div>

    <header class="mt-8">
      <h1 class="text-2xl font-bold tracking-tight md:text-3xl">隐私政策与使用条款</h1>
      <p class="mt-1 text-sm text-fg-muted">Privacy &amp; Terms</p>
    </header>

    <div class="mt-6 rounded-2xl border border-line bg-elevated p-6 md:p-8">
      <Markdown :text="TERMS_MARKDOWN" />
    </div>

    <p class="mt-6 text-center text-xs text-fg-subtle">生效日期：2026-09-23</p>
  </div>
</template>
