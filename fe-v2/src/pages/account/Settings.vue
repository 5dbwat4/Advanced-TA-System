<script setup lang="ts">
import { computed, onUnmounted, ref } from 'vue'
import { useRouter } from 'vue-router'

import AvatarPicker from '@/components/settings/AvatarPicker.vue'
import CacheSection from '@/components/settings/CacheSection.vue'
import CreditsSection from '@/components/settings/CreditsSection.vue'
import PreferenceSection from '@/components/settings/PreferenceSection.vue'
import SystemSection from '@/components/settings/SystemSection.vue'
import ZjuamSection from '@/components/settings/ZjuamSection.vue'
import Card from '@/components/ui/Card.vue'
import IconAction from '@/components/ui/IconAction.vue'
import PageHeader from '@/components/ui/PageHeader.vue'
import PendingButton from '@/components/ui/PendingButton.vue'
import TableOfContents, { type TocItem } from '@/components/ui/TableOfContents.vue'
import { useAuthStore } from '@/lib/auth'
import { getErrorMessage } from '@/lib/error'
import { useScrollToHash } from '@/lib/hash'
import { registerPasskey } from '@/lib/passkey'
import { toast } from '@/lib/toast'
import { cn } from '@/lib/utils'
import { UButton, UFormField, UIcon, UInput, UModal } from '@/ui'

const SECTIONS: TocItem[] = [
  { id: 'profile', label: '个人信息' },
  { id: 'zjuam', label: '统一身份认证' },
  { id: 'preferences', label: '偏好设置' },
  { id: 'system', label: '系统设置' },
  { id: 'cache', label: '缓存' },
  { id: 'credits', label: 'Credits' },
]

const BASIC_SECTIONS: TocItem[] = [
  { id: 'profile', label: '个人信息' },
  { id: 'preferences', label: '偏好设置' },
  { id: 'cache', label: '缓存' },
  { id: 'credits', label: 'Credits' },
]

const auth = useAuthStore()
const router = useRouter()

const highlightId = ref<string | null>(null)
let highlightTimer: ReturnType<typeof setTimeout> | null = null

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

const isBasic = computed(
  () => auth.user?.role === 'STUDENT' || auth.user?.role === 'VIEWER',
)
const sections = computed(() => (isBasic.value ? BASIC_SECTIONS : SECTIONS))
const hasPassword = computed(() => auth.user?.hasPassword ?? false)
const passkeys = computed(() => auth.user?.passkeys ?? [])
const roleLabel = computed(() => {
  switch (auth.user?.role) {
    case 'TEACHER':
      return '教师'
    case 'TA':
      return '助教'
    case 'VIEWER':
      return '观察者'
    default:
      return '学生'
  }
})

const passwordOpen = ref(false)
const password = ref('')
const savingPassword = ref(false)
const binding = ref(false)
const removingId = ref<string | null>(null)
const nameOpen = ref(false)
const nameDraft = ref('')
const savingName = ref(false)

function goBack() {
  void router.push(auth.user?.role === 'VIEWER' ? '/viewer' : '/home')
}

function closePasswordPanel() {
  passwordOpen.value = false
  password.value = ''
}

async function savePassword() {
  savingPassword.value = true
  try {
    await auth.updateSettings({ action: 'set_password', newPassword: password.value })
    toast.success(hasPassword.value ? '密码已更新' : '密码已设置')
    passwordOpen.value = false
    password.value = ''
  } catch (error) {
    toast.error(getErrorMessage(error, '保存失败'))
  } finally {
    savingPassword.value = false
  }
}

async function bindPasskey() {
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

function openNameEdit() {
  nameDraft.value = auth.user?.username ?? ''
  nameOpen.value = true
}

async function saveName() {
  const next = nameDraft.value.trim()
  if (!next) return
  savingName.value = true
  try {
    await auth.updateSettings({ action: 'set_username', username: next })
    toast.success('用户名已更新')
    nameOpen.value = false
  } catch (error) {
    toast.error(getErrorMessage(error, '保存失败'))
  } finally {
    savingName.value = false
  }
}
</script>

<template>
  <div class="mx-auto max-w-4xl">
    <UButton v-if="isBasic" variant="ghost" size="sm" class="mb-3" @click="goBack">
      返回主页
    </UButton>
    <PageHeader title="设置" />
    <div class="flex items-start gap-8">
      <div class="flex min-w-0 flex-1 flex-col gap-4">
        <section id="profile" :class="sectionClass('profile')">
          <Card :index="0" class="flex flex-col gap-5">
            <div class="flex items-center gap-2 text-sm font-bold">
              <UIcon
                name="i-lucide-id-card"
                class="h-4 w-4 shrink-0 text-brand-600 dark:text-brand-300"
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
                <div class="mt-1 flex items-center gap-1.5">
                  <div class="min-w-0 flex-1 truncate text-sm text-fg">
                    {{ auth.user?.name ?? '—' }}
                  </div>
                  <IconAction v-if="!isBasic" label="修改用户名" @click="openNameEdit">
                    <UIcon name="i-lucide-pencil" class="h-3.5 w-3.5 shrink-0" />
                  </IconAction>
                </div>
              </div>
              <div class="rounded-xl border border-line bg-sunken px-4 py-3">
                <div class="text-[10px] font-semibold uppercase tracking-widest text-fg-subtle">
                  角色
                </div>
                <div class="mt-1">
                  <span
                    class="inline-flex items-center rounded-lg border border-line bg-elevated px-2 py-0.5 text-xs font-semibold text-fg-muted"
                  >
                    {{ roleLabel }}
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
                  <UIcon name="i-lucide-lock" class="h-[18px] w-[18px] shrink-0" />
                </div>
                <div class="min-w-0 flex-1">
                  <div class="text-xs font-semibold text-fg-muted">密码</div>
                  <div class="text-[11px] text-fg-subtle">
                    {{ hasPassword ? '已设置' : '未设置' }}
                  </div>
                </div>
                <UButton
                  size="sm"
                  color="neutral" variant="soft"
                  @click="passwordOpen = !passwordOpen"
                >
                  {{ hasPassword ? '更新密码' : '设置密码' }}
                </UButton>
              </div>

              <div v-if="passwordOpen" class="mt-3 flex flex-col gap-2">
                <UInput
                  v-model="password"
                  class="w-full"
                  type="password"
                  placeholder="至少 8 位"
                  :minlength="8"
                  autocomplete="new-password"
                />
                <div class="flex justify-end gap-2">
                  <UButton
                    size="sm"
                    variant="ghost"
                    @click="closePasswordPanel"
                  >
                    取消
                  </UButton>
                  <PendingButton
                    size="sm"
                    :disabled="password.length < 8"
                    :loading="savingPassword"
                    icon="i-lucide-check"
                    @click="savePassword"
                  >
                    保存
                  </PendingButton>
                </div>
              </div>
            </div>

            <div class="rounded-xl border border-line p-4">
              <div class="flex items-center gap-3">
                <div
                  class="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-500/10 text-brand-600 dark:text-brand-300"
                >
                  <UIcon name="i-lucide-fingerprint" class="h-[18px] w-[18px] shrink-0" />
                </div>
                <div class="min-w-0 flex-1">
                  <div class="text-xs font-semibold text-fg-muted">通行密钥</div>
                  <div class="text-[11px] text-fg-subtle">
                    Touch ID · Face ID · Windows Hello
                  </div>
                </div>
                <PendingButton
                  size="sm"
                  color="neutral" variant="soft"
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
                <template v-else>
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
                      class="h-4 w-4 shrink-0 text-fg-muted"
                    />
                    <div class="min-w-0 flex-1 truncate text-xs text-fg-muted">
                      {{
                        passkey.createdAt
                          ? new Date(passkey.createdAt).toLocaleDateString()
                          : '已登记'
                      }}
                      ·
                      {{ passkey.deviceType === 'multiDevice' ? '同步' : '本设备' }}
                    </div>
                    <IconAction
                      label="解绑"
                      :loading="removingId === passkey.id"
                      @click="removePasskey(passkey.id)"
                    >
                      <UIcon name="i-lucide-trash-2" class="h-4 w-4 shrink-0" />
                    </IconAction>
                  </div>
                </template>
              </div>
            </div>
          </Card>
        </section>

        <UModal v-model:open="nameOpen" title="修改用户名">
          <template #body>
            <div>
              <UFormField label="用户名">
                <UInput
                  v-model="nameDraft"
                  class="w-full"
                  :maxlength="32"
                  placeholder="1-32 个字符"
                  autofocus
                />
              </UFormField>
              <p class="mt-1.5 text-[11px] text-fg-subtle">
                用户名同时作为登录账号与显示姓名。
              </p>
            </div>
          </template>
          <template #footer>
            <UButton color="neutral" variant="soft" @click="nameOpen = false">取消</UButton>
            <PendingButton
              :disabled="!nameDraft.trim() || nameDraft.trim() === (auth.user?.username ?? '')"
              :loading="savingName"
              icon="i-lucide-check"
              @click="saveName"
            >
              保存
            </PendingButton>
          </template>
        </UModal>

        <section v-if="!isBasic" id="zjuam" :class="sectionClass('zjuam')">
          <ZjuamSection :index="1" />
        </section>

        <section id="preferences" :class="sectionClass('preferences')">
          <PreferenceSection :index="2" />
        </section>

        <section v-if="!isBasic" id="system" :class="sectionClass('system')">
          <SystemSection :index="4" />
        </section>

        <section id="cache" :class="sectionClass('cache')">
          <CacheSection :index="5" />
        </section>

        <section id="credits" :class="sectionClass('credits')">
          <CreditsSection :index="6" />
        </section>
      </div>

      <TableOfContents :items="sections" />
    </div>
  </div>
</template>