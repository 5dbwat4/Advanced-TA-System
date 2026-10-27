<script setup lang="ts">
import { computed, getCurrentInstance, watch } from 'vue'
import { useRouter } from 'vue-router'

import { UButton, UIcon } from '@/ui'
import CheckinHeader from '@/components/checkin/CheckinHeader.vue'
import ConnectionBadge from '@/components/checkin/ConnectionBadge.vue'
import SlaveCard from '@/components/checkin/SlaveCard.vue'
import Spinner from '@/components/ui/Spinner.vue'
import { useCheckoffSlave } from '@/lib/checkoff-socket'
import { useTheme } from '@/lib/theme'
import { cn } from '@/lib/utils'

const props = defineProps<{
  token?: string
  code?: string
}>()

const emit = defineEmits<{
  back: []
}>()

const { state, meta, connected, closed, error, sessionToken } = useCheckoffSlave(() => ({
  token: props.token,
  code: props.code,
}))

const { setTheme } = useTheme()
const router = useRouter()
const instance = getCurrentInstance()

const hasBack = computed(() => typeof instance?.vnode.props?.onBack === 'function')
const isQuestion = computed(() => connected.value && state.value?.kind === 'ask_question')

const statusCardClass =
  'flex flex-col items-center gap-3 rounded-3xl border border-line bg-elevated/80 p-10 text-center shadow-2xl backdrop-blur-xl'

watch(
  () => meta.value?.theme,
  (theme) => {
    if (theme) setTheme(theme)
  },
)

watch([() => props.code, sessionToken], ([code, token]) => {
  if (!code || !token) return
  void router.push(`/checkin/${token}`)
})
</script>

<template>
  <div class="diagonal-bg relative flex min-h-screen items-center justify-center px-5 py-10">
    <ConnectionBadge />
    <div :class="cn(isQuestion ? 'w-fit max-w-[75%]' : 'w-full max-w-lg')">
      <div
        class="mb-6 flex items-center justify-center gap-2 text-xs font-semibold uppercase tracking-widest text-fg-subtle"
      >
        <UIcon name="i-lucide-cpu" class="size-[15px] shrink-0" />
        计算机系统课程 Checkoff
      </div>

      <CheckinHeader
        v-if="connected && meta && !closed"
        :grader="meta.grader"
        :student="meta.student"
      />

      <div v-if="closed" :class="statusCardClass">
        <UIcon name="i-lucide-circle-check" class="size-7 shrink-0 text-fg-subtle" />
        <div class="text-sm font-semibold text-fg">会话已结束</div>
        <UButton v-if="hasBack" color="neutral" variant="soft" size="sm" @click="emit('back')">
          <UIcon name="i-lucide-arrow-left" class="size-3.5 shrink-0" />
          返回
        </UButton>
      </div>

      <div v-else-if="error === 'SESSION_NOT_FOUND'" :class="statusCardClass">
        <UIcon name="i-lucide-search-x" class="size-7 shrink-0 text-fg-subtle" />
        <div class="text-sm font-semibold text-fg">会话不存在或已结束</div>
        <UButton v-if="hasBack" color="neutral" variant="soft" size="sm" @click="emit('back')">
          <UIcon name="i-lucide-arrow-left" class="size-3.5 shrink-0" />
          返回
        </UButton>
      </div>

      <div v-else-if="!connected || !state" :class="statusCardClass">
        <Spinner size="lg" />
        <div class="text-sm text-fg-muted">正在连接…</div>
      </div>

      <SlaveCard v-else :state="state" :markdown-style="meta?.markdownStyle" />
    </div>
  </div>
</template>
