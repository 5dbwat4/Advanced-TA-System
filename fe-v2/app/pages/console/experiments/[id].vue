<script setup lang="ts">
definePageMeta({ layout: 'console' })

const route = useRoute()
const id = computed(() => String(route.params.id ?? ''))
</script>

<template>
  <div class="px-4 py-6 sm:px-6">
    <h1 class="text-lg font-semibold text-fg">实验详情</h1>
    <p class="mt-1 text-sm text-fg-muted">空壳页，时间线 / 状态待迁移（Phase C2）。</p>
    <p class="mt-3 break-all text-xs text-fg-subtle">id: {{ id }}</p>
  </div>
</template>
