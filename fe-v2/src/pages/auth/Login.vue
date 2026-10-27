<script setup lang="ts">
import LoginBrandPanel from '@/components/auth/LoginBrandPanel.vue'
import LoginPanel from '@/components/auth/LoginPanel.vue'
</script>

<template>
  <div class="flex h-dvh overflow-hidden">
    <LoginBrandPanel />
    <div class="flex min-w-0 flex-1 flex-col overflow-y-auto">
      <LoginPanel />
    </div>
  </div>
</template>
