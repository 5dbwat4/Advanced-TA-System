<script setup lang="ts">
import type { NuxtError } from '#app'

const props = defineProps<{ error: NuxtError }>()

const isNotFound = computed(() => props.error?.statusCode === 404)

const title = computed(() => (isNotFound.value ? '页面不存在' : '出了点问题'))

const message = computed(
  () => props.error?.statusMessage || props.error?.message || '请稍后重试',
)

function goConsole() {
  clearError({ redirect: '/console' })
}
</script>

<template>
  <UApp>
    <div class="flex min-h-dvh items-center justify-center px-6">
      <div class="w-full max-w-md rounded-2xl border border-line bg-elevated p-8 text-center">
        <p class="tabular text-4xl font-bold text-brand-500">
          {{ error?.statusCode ?? 500 }}
        </p>
        <h1 class="mt-3 text-lg font-semibold text-fg">
          {{ title }}
        </h1>
        <p class="mt-2 text-sm text-fg-muted">
          {{ message }}
        </p>

        <UButton class="mt-6" label="返回控制台" icon="i-lucide-arrow-left" @click="goConsole" />
      </div>
    </div>
  </UApp>
</template>
