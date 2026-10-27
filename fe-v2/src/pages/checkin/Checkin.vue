<script setup lang="ts">
import { computed, ref } from 'vue'

import CheckinScreen from '@/components/checkin/CheckinScreen.vue'
import ConnectionBadge from '@/components/checkin/ConnectionBadge.vue'
import { UButton, UIcon, UPinInput } from '@/ui'

const value = ref<(number | undefined)[]>([])
const code = ref<string | null>(null)

const valid = computed(
  () => value.value.length === 6 && value.value.every((digit) => digit !== undefined),
)

function submit() {
  if (!valid.value) return
  code.value = value.value.map((digit) => String(digit)).join('')
}

function reset() {
  code.value = null
  value.value = []
}
</script>

<template>
  <CheckinScreen v-if="code" :code="code" @back="reset" />
  <div
    v-else
    class="diagonal-bg relative flex min-h-screen items-center justify-center px-5 py-10"
  >
    <ConnectionBadge />
    <div class="w-full max-w-lg">
      <div
        class="mb-6 flex items-center justify-center gap-2 text-xs font-semibold uppercase tracking-widest text-fg-subtle"
      >
        <UIcon name="i-lucide-cpu" class="size-[15px] shrink-0" />
        计算机系统课程 Checkoff
      </div>
      <form
        class="rounded-3xl border border-line bg-elevated/80 p-8 text-center shadow-2xl backdrop-blur-xl"
        @submit.prevent="submit"
      >
        <div class="text-2xl font-bold tracking-tight text-fg">计算机系统课程验收</div>
        <div class="mt-1 text-sm text-fg-subtle">输入 6 位验收码加入</div>
        <div class="mt-6 flex justify-center">
          <UPinInput
            v-model="value"
            :length="6"
            :separator="3"
            type="number"
            autofocus
            aria-label="验收码"
            class="justify-center"
          />
        </div>
        <UButton type="submit" :disabled="!valid" block class="mt-5">
          <UIcon name="i-lucide-log-in" class="size-4 shrink-0" />
          加入
        </UButton>
      </form>
    </div>
  </div>
</template>
