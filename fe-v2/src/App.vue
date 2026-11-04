<script setup lang="ts">
import { onMounted } from 'vue'
import { RouterView } from 'vue-router'

import { useAuthStore } from '@/lib/auth'
import { installToast } from '@/lib/toast'
import { UApp } from '@/ui'

installToast()

const auth = useAuthStore()

onMounted(() => {
  void auth.ensureReady()
})
</script>

<template>
  <UApp>
    <div class="aurora" aria-hidden />
    <div class="grid-overlay" aria-hidden />
    <RouterView v-slot="{ Component }">
      <Transition name="page" mode="out-in">
        <component :is="Component" />
      </Transition>
    </RouterView>
  </UApp>
</template>
