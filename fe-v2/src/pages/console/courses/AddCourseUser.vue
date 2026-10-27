<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'

import Card from '@/components/ui/Card.vue'
import PageHeader from '@/components/ui/PageHeader.vue'
import PendingButton from '@/components/ui/PendingButton.vue'
import { addClassUser, createInviteLink, type InvitableRole, type Ta } from '@/lib/api'
import { getErrorMessage } from '@/lib/error'
import { useCurrentClassComputed } from '@/lib/store'
import { toast } from '@/lib/toast'
import { UButton, UIcon, UInput, USelect } from '@/ui'

const ROLE_OPTIONS: Array<{ value: InvitableRole; label: string }> = [
  { value: 'TA', label: '助教' },
  { value: 'TEACHER', label: '教师' },
  { value: 'VIEWER', label: '观察者' },
]

const ROLE_LABELS: Record<InvitableRole, string> = {
  TA: '助教',
  TEACHER: '教师',
  VIEWER: '观察者',
}

function isInvitableRole(value: unknown): value is InvitableRole {
  return value === 'TA' || value === 'TEACHER' || value === 'VIEWER'
}

const router = useRouter()
const currentClass = useCurrentClassComputed()

const idRole = ref<InvitableRole>('TA')
const studentId = ref('')
const adding = ref(false)
const added = ref<{ user: Ta; password: string } | null>(null)
const passwordCopied = ref(false)

const inviteRole = ref<InvitableRole>('TA')
const inviting = ref(false)
const invite = ref<{ url: string; expiresAt: string } | null>(null)
const linkCopied = ref(false)

const addedRoleLabel = computed(() => {
  const role = added.value?.user.role
  return role && isInvitableRole(role) ? ROLE_LABELS[role] : (role ?? '')
})

const inviteExpiry = computed(() =>
  invite.value ? new Date(invite.value.expiresAt).toLocaleString() : '',
)

function setIdRole(value: unknown) {
  if (isInvitableRole(value)) idRole.value = value
}

function setInviteRole(value: unknown) {
  if (isInvitableRole(value)) inviteRole.value = value
}

async function submitById() {
  const id = studentId.value.trim()
  if (!id || adding.value) return
  adding.value = true
  try {
    const result = await addClassUser(id, idRole.value)
    added.value = result
    studentId.value = ''
    toast.success('已添加用户')
  } catch (error) {
    toast.error(getErrorMessage(error, '添加失败'))
  } finally {
    adding.value = false
  }
}

async function copyPassword() {
  if (!added.value) return
  try {
    await navigator.clipboard.writeText(added.value.password)
    passwordCopied.value = true
    toast.success('密码已复制')
    window.setTimeout(() => {
      passwordCopied.value = false
    }, 1500)
  } catch {
    toast.error('复制失败，请手动复制')
  }
}

async function generateInvite() {
  if (inviting.value) return
  inviting.value = true
  try {
    const result = await createInviteLink(inviteRole.value)
    const url = `${window.location.origin}/invite?token=${encodeURIComponent(result.token)}`
    invite.value = { url, expiresAt: result.expiresAt }
    toast.success('邀请链接已生成')
  } catch (error) {
    toast.error(getErrorMessage(error, '生成邀请链接失败'))
  } finally {
    inviting.value = false
  }
}

async function copyLink() {
  if (!invite.value) return
  try {
    await navigator.clipboard.writeText(invite.value.url)
    linkCopied.value = true
    toast.success('链接已复制')
    window.setTimeout(() => {
      linkCopied.value = false
    }, 1500)
  } catch {
    toast.error('复制失败，请手动复制')
  }
}

function selectInput(event: FocusEvent) {
  const target = event.target
  if (target instanceof HTMLInputElement) target.select()
}
</script>

<template>
  <div class="mx-auto max-w-5xl">
    <PageHeader title="为本课程添加用户">
      <template #subtitle>
        {{ currentClass?.name ? `当前班级：${currentClass.name}` : '请先选择课程' }}
      </template>
      <template #actions>
        <UButton variant="ghost" size="sm" @click="router.back()">
          <UIcon name="i-lucide-arrow-left" class="h-4 w-4 shrink-0" />
          返回
        </UButton>
      </template>
    </PageHeader>

    <div class="grid gap-4 lg:grid-cols-2">
      <Card :index="0" class="flex flex-col gap-4">
        <div class="flex items-center gap-2">
          <UIcon
            name="i-lucide-user-plus"
            class="h-4 w-4 shrink-0 text-brand-600 dark:text-brand-300"
          />
          <span class="text-sm font-bold">使用学工号或用户名注册</span>
        </div>
        <p class="text-xs leading-relaxed text-fg-subtle">
          在当前班级创建【学工号 / 用户名 + 班级】账号，并生成一次性初始密码。
        </p>

        <div class="flex flex-col gap-3">
          <div>
            <label class="mb-1.5 block text-xs font-semibold text-fg-muted">用户类型</label>
            <USelect
              :model-value="idRole"
              :items="ROLE_OPTIONS"
              value-key="value"
              label-key="label"
              aria-label="选择用户类型"
              class="w-full"
              @update:model-value="setIdRole"
            />
          </div>
          <div>
            <label class="mb-1.5 block text-xs font-semibold text-fg-muted">学工号 / 用户名</label>
            <UInput
              v-model="studentId"
              class="w-full"
              placeholder="请输入学工号或用户名"
              autocomplete="off"
              :maxlength="32"
              aria-label="学工号或用户名"
              @keydown.enter.prevent="submitById"
            />
          </div>
          <PendingButton
            :disabled="!studentId.trim()"
            :loading="adding"
            @click="submitById"
          >
            添加用户
          </PendingButton>
        </div>

        <div v-if="added" class="rounded-xl border border-brand-500/40 bg-brand-500/5 p-4">
          <div class="text-[11px] font-semibold uppercase tracking-wide text-fg-subtle">
            已添加
          </div>
          <div class="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm font-semibold">
            <span class="tabular">{{ added.user.studentId }}</span>
            <span class="rounded-lg bg-elevated px-2 py-0.5 text-xs text-fg-muted">
              {{ addedRoleLabel }}
            </span>
            <span class="text-xs font-normal text-fg-subtle">
              {{ added.user.classes[0]?.name ?? currentClass?.name ?? '当前班级' }}
            </span>
          </div>
          <div class="mt-3 text-[11px] font-semibold uppercase tracking-wide text-fg-subtle">
            初始密码
          </div>
          <div class="mt-1 flex items-center gap-2">
            <code class="min-w-0 flex-1 select-all break-all rounded-lg bg-sunken px-3 py-2 font-mono text-xs">
              {{ added.password }}
            </code>
            <PendingButton
              size="sm"
              color="neutral"
              variant="soft"
              :icon="passwordCopied ? 'i-lucide-check' : 'i-lucide-copy'"
              @click="copyPassword"
            >
              {{ passwordCopied ? '已复制' : '复制' }}
            </PendingButton>
          </div>
          <p class="mt-3 text-xs leading-relaxed text-danger">
            密码仅在本次显示，请立即复制并发送给对方。首次登录后需设置用户名，并可绑定密码 /
            WebAuthn。
          </p>
        </div>
      </Card>

      <Card :index="1" class="flex flex-col gap-4">
        <div class="flex items-center gap-2">
          <UIcon
            name="i-lucide-link"
            class="h-4 w-4 shrink-0 text-brand-600 dark:text-brand-300"
          />
          <span class="text-sm font-bold">使用邀请链接</span>
        </div>
        <p class="text-xs leading-relaxed text-fg-subtle">
          生成邀请链接，对方登录后可在本课程获得所选身份。链接 7 天内有效。
        </p>

        <div class="flex flex-col gap-3">
          <div>
            <label class="mb-1.5 block text-xs font-semibold text-fg-muted">用户类型</label>
            <USelect
              :model-value="inviteRole"
              :items="ROLE_OPTIONS"
              value-key="value"
              label-key="label"
              aria-label="选择邀请的用户类型"
              class="w-full"
              @update:model-value="setInviteRole"
            />
          </div>
          <PendingButton :loading="inviting" @click="generateInvite">
            生成邀请链接
          </PendingButton>
        </div>

        <div v-if="invite" class="rounded-xl border border-brand-500/40 bg-brand-500/5 p-4">
          <div class="text-[11px] font-semibold uppercase tracking-wide text-fg-subtle">
            邀请链接
          </div>
          <div class="mt-1 flex items-center gap-2">
            <UInput
              class="w-full font-mono text-xs"
              :model-value="invite.url"
              readonly
              aria-label="邀请链接"
              @focus="selectInput"
            />
            <PendingButton
              size="sm"
              color="neutral"
              variant="soft"
              :icon="linkCopied ? 'i-lucide-check' : 'i-lucide-copy'"
              @click="copyLink"
            >
              {{ linkCopied ? '已复制' : '复制' }}
            </PendingButton>
          </div>
          <p class="mt-3 text-xs text-fg-subtle">有效期至 {{ inviteExpiry }}</p>
        </div>
      </Card>
    </div>
  </div>
</template>
