<script setup lang="ts">
import { groups } from 'avatars'
import { computed, ref } from 'vue'

import AvatarImage from '@/components/ui/AvatarImage.vue'
import { useAuthStore } from '@/lib/auth'
import { getErrorMessage } from '@/lib/error'
import { toast } from '@/lib/toast'
import { cn } from '@/lib/utils'
import { UButton, UIcon, UModal, USeparator, UTooltip } from '@/ui'

const AVATAR_SIZE = 48

const auth = useAuthStore()
const saving = ref(false)
const open = ref(false)

const current = computed(() => auth.user?.avatar ?? null)
const initial = computed(() => auth.user?.username?.slice(0, 1) ?? '·')

async function select(avatar: number | null) {
  if (saving.value) return
  if (avatar !== current.value) {
    saving.value = true
    try {
      await auth.updateSettings({ action: 'set_avatar', avatar })
      toast.success(avatar === null ? '已恢复默认头像' : '头像已更新')
    } catch (error) {
      toast.error(getErrorMessage(error, '保存失败'))
      saving.value = false
      return
    }
    saving.value = false
  }
  open.value = false
}
</script>

<template>
  <div class="flex items-center gap-3 rounded-xl border border-line p-4">
    <div class="min-w-0 flex-1">
      <div class="text-xs font-semibold text-fg-muted">头像</div>
      <div class="mt-0.5 text-[11px] text-fg-subtle">当前头像</div>
    </div>
    <AvatarImage :id="current" :size="40">
      <template #fallback>{{ initial }}</template>
    </AvatarImage>
    <UButton size="sm" color="neutral" variant="soft" @click="open = true">修改</UButton>
  </div>

  <UModal v-model:open="open" title="选择头像" :dismissible="!saving">
    <template #body>
      <div class="flex max-h-[65vh] flex-col gap-4 overflow-y-auto">
        <section>
          <div class="text-xs font-semibold text-fg-muted">默认</div>
          <div class="mt-2 flex flex-wrap gap-2.5">
            <UTooltip text="默认（首字母）" :delay-duration="200">
              <button
                type="button"
                aria-label="默认（首字母）"
                :aria-pressed="current === null"
                :disabled="saving"
                :class="
                  cn(
                    'relative rounded-full transition',
                    current === null
                      ? 'ring-2 ring-brand-500 dark:ring-brand-400'
                      : 'ring-1 ring-line hover:ring-brand-500/40',
                  )
                "
                @click="select(null)"
              >
                <AvatarImage :id="null" :size="AVATAR_SIZE" class="pointer-events-none">
                  <template #fallback>{{ initial }}</template>
                </AvatarImage>
                <span
                  v-if="current === null"
                  class="absolute inset-0 flex items-center justify-center rounded-full bg-black/35 text-white"
                >
                  <UIcon name="i-lucide-check" class="h-4 w-4 shrink-0" />
                </span>
              </button>
            </UTooltip>
          </div>
          <p class="mt-2 text-[11px] text-fg-subtle">使用用户名首字母作为头像。</p>
        </section>

        <template v-for="group in groups" :key="group.name">
          <USeparator />
          <section>
            <div class="text-xs font-semibold text-fg-muted">{{ group.name }}</div>
            <div class="mt-2 flex flex-wrap gap-2.5">
              <UTooltip
                v-for="item in group.avatars"
                :key="item.id"
                :text="item.name"
                :delay-duration="200"
              >
                <button
                  type="button"
                  :aria-label="item.name"
                  :aria-pressed="current === item.id"
                  :disabled="saving"
                  :class="
                    cn(
                      'relative rounded-full transition',
                      current === item.id
                        ? 'ring-2 ring-brand-500 dark:ring-brand-400'
                        : 'ring-1 ring-line hover:ring-brand-500/40',
                    )
                  "
                  @click="select(item.id)"
                >
                  <AvatarImage :id="item.id" :size="AVATAR_SIZE" class="pointer-events-none">
                    <template #fallback>{{ item.name.slice(0, 1) }}</template>
                  </AvatarImage>
                  <span
                    v-if="current === item.id"
                    class="absolute inset-0 flex items-center justify-center rounded-full bg-black/35 text-white"
                  >
                    <UIcon name="i-lucide-check" class="h-4 w-4 shrink-0" />
                  </span>
                </button>
              </UTooltip>
            </div>
            <p v-if="group.description" class="mt-2 text-[11px] text-fg-subtle">
              {{ group.description }}
            </p>
          </section>
        </template>
      </div>
    </template>
    <template #footer>
      <UButton color="neutral" variant="soft" @click="open = false">关闭</UButton>
    </template>
  </UModal>
</template>
