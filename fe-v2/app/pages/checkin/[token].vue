<script setup lang="ts">
// 公开页：学生扫码进入的签到页，守卫白名单内
definePageMeta({ layout: 'default' })

const route = useRoute()
const token = computed(() => String(route.params.token ?? ''))
</script>

<template>
  <div class="flex min-h-dvh items-center justify-center px-6">
    <div class="w-full max-w-sm rounded-2xl border border-line bg-elevated p-8 text-center">
      <h1 class="text-lg font-semibold text-fg">签到</h1>
      <p class="mt-1 text-sm text-fg-muted">空壳页，签到大屏待迁移（Phase C8）。</p>
      <p class="mt-3 break-all text-xs text-fg-subtle">token: {{ token }}</p>
    </div>
  </div>
</template>
