<script setup lang="ts">
import copyToClipboard from 'copy-to-clipboard'
import QrcodeVue from 'qrcode.vue'
import { computed, ref } from 'vue'

import IconAction from '@/components/ui/IconAction.vue'
import ProgressRing from '@/components/ui/ProgressRing.vue'
import Spinner from '@/components/ui/Spinner.vue'
import type { MasterSession } from '@/lib/checkoff-socket'
import { toast } from '@/lib/toast'
import { useTotp } from '@/lib/totp'
import { cn } from '@/lib/utils'
import { UBadge, UButton, UIcon, UInput, UTooltip } from '@/ui'

const props = defineProps<{
  session: MasterSession
}>()

const emit = defineEmits<{
  hide: []
}>()

const { code, remaining, period } = useTotp(
  () => props.session.secret,
  () => props.session.period,
  () => props.session.serverTime,
)

const sharing = ref(false)
const url = computed(() => `${window.location.origin}/checkin/${props.session.token ?? ''}`)
const pin = computed(() => code.value ?? '------')
const progress = computed(() =>
  Math.max(0, Math.min(1, remaining.value / Math.max(1, period.value))),
)

function buildShareData(): ShareData {
  return {
    title: 'Tasaas 从机配对',
    text: '在从机打开此链接以完成配对',
    url: url.value,
  }
}

const canShare = (() => {
  if (typeof navigator.share !== 'function') return false
  if (typeof navigator.canShare !== 'function') return true
  try {
    return navigator.canShare(buildShareData())
  } catch {
    return false
  }
})()

async function copy() {
  const ok = await copyToClipboard(url.value)
  if (ok) toast.success('链接已复制')
  else toast.error(url.value)
}

async function copyCode() {
  if (!code.value) return
  const ok = await copyToClipboard(code.value)
  if (ok) toast.success('配对码已复制')
  else toast.error(code.value)
}

async function share() {
  if (!props.session.token) return
  sharing.value = true
  try {
    await navigator.share(buildShareData())
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') return
    toast.error('分享失败，请重试')
  } finally {
    sharing.value = false
  }
}
</script>

<template>
  <div
    v-if="!props.session.ready"
    class="flex items-center gap-3 rounded-2xl border border-line bg-elevated px-5 py-4 text-sm text-fg-muted"
  >
    <Spinner size="sm" />
    正在创建会话…
  </div>

  <div
    v-else
    class="animate-fade-up overflow-hidden rounded-2xl border border-brand-500/25 bg-gradient-to-r from-brand-500/8 to-amber-500/5"
  >
    <div class="flex flex-wrap items-center gap-4 px-5 py-4">
      <div class="flex items-center gap-3">
        <div
          class="relative flex h-12 w-12 items-center justify-center rounded-xl bg-brand-500/15 text-brand-600 dark:text-brand-300"
        >
          <UIcon name="i-lucide-monitor-smartphone" class="size-[22px] shrink-0" />
          <span
            :class="
              cn(
                'absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full',
                props.session.slaveConnected ? 'animate-pulse bg-emerald-500' : 'bg-line',
              )
            "
          />
        </div>
        <div>
          <div class="text-xs font-semibold text-fg-muted">从机配对码</div>
          <div class="flex items-center gap-2">
            <UTooltip text="点击复制配对码" arrow :content="{ side: 'bottom' }">
              <UButton
                variant="ghost"
                color="neutral"
                :disabled="!code"
                class="tabular h-auto px-0 text-2xl font-bold tracking-[0.3em] hover:bg-transparent"
                @click="copyCode"
              >
                {{ pin }}
              </UButton>
            </UTooltip>
            <ProgressRing :value="progress" :size="36" :stroke="3" :show-label="false">
              <span class="tabular text-[10px] font-bold text-fg-muted">{{ remaining }}</span>
            </ProgressRing>
          </div>
        </div>
      </div>

      <div class="h-10 w-px bg-line" />

      <div class="min-w-0 flex-1">
        <div class="text-xs font-semibold text-fg-muted">从机链接</div>
        <UTooltip :text="url" arrow :content="{ side: 'bottom' }">
          <UInput
            :model-value="url.replace(/^https?:\/\//, '')"
            readonly
            class="w-full cursor-pointer"
            @click="copy"
          />
        </UTooltip>
      </div>

      <IconAction label="显示二维码" placement="bottom">
        <template #tooltip>
          <div class="flex w-auto max-w-none flex-col items-center gap-2">
            <QrcodeVue :value="url" :size="168" level="M" :margin="2" background="#ffffff" foreground="#000000" />
            <span class="text-xs text-fg-subtle">扫码在从机打开</span>
          </div>
        </template>
        <UIcon name="i-lucide-qr-code" class="size-3.5 shrink-0" />
      </IconAction>

      <IconAction
        v-if="canShare"
        label="分享从机网址"
        placement="bottom"
        :disabled="!props.session.token"
        :loading="sharing"
        @click="share"
      >
        <UIcon name="i-lucide-share-2" class="size-3.5 shrink-0" />
      </IconAction>

      <UTooltip text="单击以隐藏从机配对信息" arrow :content="{ side: 'bottom' }">
        <button
          type="button"
          aria-label="隐藏从机配对信息"
          class="flex cursor-pointer items-center transition-opacity hover:opacity-70"
          @click="emit('hide')"
        >
          <UBadge
            :color="props.session.slaveConnected ? 'success' : 'neutral'"
            variant="soft"
            size="sm"
            class="font-semibold"
          >
            <span
              :class="
                cn(
                  'mr-1 h-2 w-2 rounded-full',
                  props.session.slaveConnected ? 'animate-pulse bg-emerald-500' : 'bg-fg-subtle/50',
                )
              "
            />
            {{ props.session.slaveConnected ? '已连接' : '等待从机连接…' }}
          </UBadge>
        </button>
      </UTooltip>
    </div>
  </div>
</template>
