<script setup lang="ts">
import { watch } from 'vue'
import { RouterView, useRoute, useRouter } from 'vue-router'

import ThemeToggle from '@/components/ui/ThemeToggle.vue'
import { UIcon } from '@/ui'

const route = useRoute()
const router = useRouter()

watch(
  () => route.path,
  () => {
    window.scrollTo(0, 0)
  },
  { immediate: true },
)

function goBack() {
  if (window.history.length > 1) router.back()
  else void router.push('/')
}
</script>

<template>
  <div class="mx-auto max-w-4xl px-6 py-12">
    <div class="flex items-center justify-between gap-4">
      <button
        type="button"
        class="inline-flex cursor-pointer items-center gap-2 text-sm font-medium text-fg-muted transition-colors hover:text-fg"
        @click="goBack"
      >
        <UIcon name="i-lucide-arrow-left" class="size-4 shrink-0" />
        返回
      </button>
      <ThemeToggle />
    </div>

    <div class="mt-8">
      <RouterView v-slot="{ Component }">
        <Transition name="page" mode="out-in">
          <component :is="Component" :key="route.path" />
        </Transition>
      </RouterView>
    </div>
  </div>
</template>
