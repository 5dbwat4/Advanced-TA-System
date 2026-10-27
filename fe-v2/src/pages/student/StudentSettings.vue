<script setup lang="ts">
import { computed, onUnmounted, ref } from 'vue'

import AvatarPicker from '@/components/settings/AvatarPicker.vue'
import CacheSection from '@/components/settings/CacheSection.vue'
import CreditsSection from '@/components/settings/CreditsSection.vue'
import NotificationSection from '@/components/settings/NotificationSection.vue'
import PreferenceSection from '@/components/settings/PreferenceSection.vue'
import Card from '@/components/ui/Card.vue'
import PageHeader from '@/components/ui/PageHeader.vue'
import PendingButton from '@/components/ui/PendingButton.vue'
import TableOfContents, { type TocItem } from '@/components/ui/TableOfContents.vue'
import { useAuthStore } from '@/lib/auth'
import { getErrorMessage } from '@/lib/error'
import { useScrollToHash } from '@/lib/hash'
import { registerPasskey } from '@/lib/passkey'
import { toast } from '@/lib/toast'
import { cn } from '@/lib/utils'
import { UButton, UIcon, UInput } from '@/ui'

const SECTIONS: TocItem[] = [
  { id: 'profile', label: '个人信息' },
  { id: 'preferences', label: '偏好设置' },
  { id: 'notifications', label: 'Notifications' },
  { id: 'cache', label: '缓存' },
  { id: 'credits', label: 'Credits' },
]

const auth = useAuthStore()

const username = ref(auth.user?.username ?? '')
const password = ref('')
const savingName = ref(false)
const savingPassword = ref(false)
const binding = ref(false)
const removingId = ref<string | null>(null)
const highlightId = ref<string | null>(null)
let highlightTimer: ReturnType<typeof setTimeout> | null = null

const passkeys = computed(() => auth.user?.passkeys ?? [])

function flashHighlight(id: string) {
  highlightId.value = id
  if (highlightTimer) clearTimeout(highlightTimer)
  highlightTimer = setTimeout(() => {
    highlightId.value = null
  }, 1600)
}

useScrollToHash(flashHighlight)

onUnmounted(() => {
  if (highlightTimer) clearTimeout(highlightTimer)
})

function sectionClass(id: string) {
  return cn(
    'scroll-mt-24 rounded-2xl transition-shadow duration-300',
    highlightId.value === id && 'ring-2 ring-brand-500/40 dark:ring-brand-400/50',
  )
}

function passkeyDate(value: string | null): string {
  return value ? new Date(value).toLocaleDateString() : '已登记'
}

async function saveUsername() {
  if (savingName.value) return
  const next = username.value.trim()
  if (!next || next === auth.user?.username) return
  savingName.value = true
  try {
    await auth.updateSettings({ action: 'set_username', username: next })
    toast.success('用户名已更新')
  } catch (error) {
    toast.error(getErrorMessage(error, '保存失败'))
  } finally {
    savingName.value = false
  }
}

async function savePassword() {
  if (savingPassword.value) return
  if (password.value.length < 8) return
  savingPassword.value = true
  try {
    await auth.updateSettings({ action: 'set_password', newPassword: password.value })
    password.value = ''
    toast.success('密码已更新')
  } catch (error) {
    toast.error(getErrorMessage(error, '保存失败'))
  } finally {
    savingPassword.value = false
  }
}

async function bindPasskey() {
  if (binding.value) return
  binding.value = true
  try {
    const ok = await registerPasskey()
    if (!ok) return
    await auth.refresh()
    toast.success('已绑定通行密钥')
  } catch (error) {
    toast.error(getErrorMessage(error, '绑定失败'))
  } finally {
    binding.value = false
  }
}

async function removePasskey(passkeyId: string) {
  if (removingId.value) return
  removingId.value = passkeyId
  try {
    await auth.updateSettings({ action: 'remove_passkey', passkeyId })
    toast.success('已解绑')
  } catch (error) {
    toast.error(getErrorMessage(error, '解绑失败'))
  } finally {
    removingId.value = null
  }
}
</script>

<template>
  <div class="mx-auto max-w-4xl">
    <PageHeader title="设置" />
    <div class="flex items-start gap-8">
      <div class="flex min-w-0 flex-1 flex-col gap-4">
        <section id="profile" :class="sectionClass('profile')">
          <Card :index="0" class="flex flex-col gap-5">
            <div class="flex items-center gap-2 text-sm font-bold">
              <UIcon
                name="i-lucide-id-card"
                class="size-4 shrink-0 text-brand-600 dark:text-brand-300"
              />
              个人信息
            </div>

            <div class="grid gap-3 sm:grid-cols-3">
              <div class="rounded-xl border border-line bg-sunken px-4 py-3">
                <div class="text-[10px] font-semibold uppercase tracking-widest text-fg-subtle">
                  学号
                </div>
                <div class="tabular mt-1 text-sm text-fg">{{ auth.user?.studentId ?? '—' }}</div>
              </div>
              <div class="rounded-xl border border-line bg-sunken px-4 py-3">
                <div class="text-[10px] font-semibold uppercase tracking-widest text-fg-subtle">
                  姓名
                </div>
                <div class="mt-1 truncate text-sm text-fg">{{ auth.user?.name ?? '—' }}</div>
              </div>
              <div class="rounded-xl border border-line bg-sunken px-4 py-3">
                <div class="text-[10px] font-semibold uppercase tracking-widest text-fg-subtle">
                  角色
                </div>
                <div class="mt-1">
                  <span
                    class="inline-flex items-center rounded-lg border border-line bg-elevated px-2 py-0.5 text-xs font-semibold text-fg-muted"
                  >
                    学生
                  </span>
                </div>
              </div>
            </div>

            <AvatarPicker />

            <div class="rounded-xl border border-line p-4">
              <div class="flex items-center gap-3">
                <div
                  class="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-500/10 text-brand-600 dark:text-brand-300"
                >
                  <UIcon name="i-lucide-at-sign" class="size-[18px] shrink-0" />
                </div>
                <div class="min-w-0 flex-1">
                  <div class="text-xs font-semibold text-fg-muted">用户名</div>
                </div>
              </div>
              <div class="mt-3 flex items-center gap-2">
                <UInput
                  v-model="username"
                  class="w-full"
                  :maxlength="32"
                  autocomplete="username"
                />
                <PendingButton
                  color="neutral"
                  variant="soft"
                  :loading="savingName"
                  :disabled="!username.trim() || username.trim() === auth.user?.username"
                  @click="saveUsername"
                >
                  保存
                </PendingButton>
              </div>
            </div>

            <div class="rounded-xl border border-line p-4">
              <div class="flex items-center gap-3">
                <div
                  class="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-500/10 text-brand-600 dark:text-brand-300"
                >
                  <UIcon name="i-lucide-lock" class="size-[18px] shrink-0" />
                </div>
                <div class="min-w-0 flex-1">
                  <div class="text-xs font-semibold text-fg-muted">密码</div>
                  <div class="text-[11px] text-fg-subtle">
                    {{ auth.user?.hasPassword ? '已设置' : '未设置，可继续使用统一身份认证' }}
                  </div>
                </div>
              </div>
              <div class="mt-3 flex items-center gap-2">
                <UInput
                  v-model="password"
                  class="w-full"
                  type="password"
                  placeholder="新密码（至少 8 位）"
                  autocomplete="new-password"
                />
                <PendingButton
                  color="neutral"
                  variant="soft"
                  :loading="savingPassword"
                  :disabled="password.length < 8"
                  @click="savePassword"
                >
                  {{ auth.user?.hasPassword ? '更新' : '设置' }}
                </PendingButton>
              </div>
            </div>

            <div class="rounded-xl border border-line p-4">
              <div class="flex items-center gap-3">
                <div
                  class="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-500/10 text-brand-600 dark:text-brand-300"
                >
                  <UIcon name="i-lucide-fingerprint" class="size-[18px] shrink-0" />
                </div>
                <div class="min-w-0 flex-1">
                  <div class="text-xs font-semibold text-fg-muted">通行密钥</div>
                  <div class="text-[11px] text-fg-subtle">
                    Touch ID · Face ID · Windows Hello
                  </div>
                </div>
                <PendingButton
                  size="sm"
                  color="neutral"
                  variant="soft"
                  :loading="binding"
                  icon="i-lucide-plus"
                  @click="bindPasskey"
                >
                  绑定本设备
                </PendingButton>
              </div>

              <div class="mt-3 flex flex-col gap-2">
                <div
                  v-if="passkeys.length === 0"
                  class="rounded-xl border border-dashed border-line py-6 text-center text-xs text-fg-subtle"
                >
                  尚未绑定通行密钥
                </div>
                <div
                  v-for="passkey in passkeys"
                  :key="passkey.id"
                  class="flex items-center gap-3 rounded-xl border border-line bg-sunken px-3 py-2.5"
                >
                  <UIcon
                    :name="
                      passkey.deviceType === 'multiDevice'
                        ? 'i-lucide-smartphone'
                        : 'i-lucide-laptop'
                    "
                    class="size-4 shrink-0 text-fg-muted"
                  />
                  <div class="min-w-0 flex-1 truncate text-xs text-fg-muted">
                    {{ passkeyDate(passkey.createdAt) }}
                    · {{ passkey.deviceType === 'multiDevice' ? '同步' : '本设备' }}
                  </div>
                  <UButton
                    aria-label="解绑"
                    size="sm"
                    color="neutral"
                    variant="ghost"
                    square
                    :disabled="removingId !== null"
                    @click="removePasskey(passkey.id)"
                  >
                    <UIcon name="i-lucide-trash-2" class="size-4 shrink-0" />
                  </UButton>
                </div>
              </div>
            </div>
          </Card>
        </section>

        <section id="preferences" :class="sectionClass('preferences')">
          <PreferenceSection :index="1" markdown-only />
        </section>

        <section id="notifications" :class="sectionClass('notifications')">
          <NotificationSection :index="2" />
        </section>

        <section id="cache" :class="sectionClass('cache')">
          <CacheSection :index="3" />
        </section>

        <section id="credits" :class="sectionClass('credits')">
          <CreditsSection :index="4" />
        </section>
      </div>

      <TableOfContents :items="SECTIONS" />
    </div>
  </div>
</template>
