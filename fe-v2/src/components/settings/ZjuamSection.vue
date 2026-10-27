<script setup lang="ts">
import { ref } from 'vue'
import { RouterLink } from 'vue-router'

import Card from '@/components/ui/Card.vue'
import PendingButton from '@/components/ui/PendingButton.vue'
import { apiFetch } from '@/lib/api'
import { useAuthStore } from '@/lib/auth'
import { getErrorMessage } from '@/lib/error'
import { useAppStore } from '@/lib/store'
import { toast } from '@/lib/toast'
import {
  getZjuamCredential,
  setZjuamCredential,
  type ZjuamCredential,
} from '@/lib/zjuam'
import { UAlert, UButton, UIcon, UInput, UTooltip } from '@/ui'

const props = withDefaults(
  defineProps<{
    index?: number
  }>(),
  {
    index: 0,
  },
)

const auth = useAuthStore()
const app = useAppStore()

const local = ref<ZjuamCredential | null>(getZjuamCredential())
const editing = ref(false)
const account = ref('')
const password = ref('')
const saving = ref(false)

function openForm() {
  account.value = local.value?.account ?? auth.user?.zjuamAccount ?? ''
  password.value = local.value?.password ?? ''
  editing.value = true
}

function toggleForm() {
  if (editing.value) editing.value = false
  else openForm()
}

function closeForm() {
  editing.value = false
  password.value = ''
}

function saveLocal() {
  setZjuamCredential({ account: account.value, password: password.value })
  local.value = { account: account.value, password: password.value }
  app.syncLocalCredential()
  void app.loadZjuamCourses({ force: true })
  toast.success('已保存在本地')
  closeForm()
}

async function saveRemote() {
  saving.value = true
  try {
    setZjuamCredential({ account: account.value, password: password.value })
    local.value = { account: account.value, password: password.value }
    await apiFetch('/api/auth/zjuam/credentials', {
      method: 'PUT',
      body: JSON.stringify({ account: account.value, password: password.value }),
    })
    await auth.refresh()
    app.syncLocalCredential()
    void app.loadZjuamCourses({ force: true })
    toast.success('已保存在远端')
    closeForm()
  } catch (error) {
    toast.error(getErrorMessage(error, '保存失败'))
  } finally {
    saving.value = false
  }
}

async function deleteRemote() {
  saving.value = true
  try {
    await apiFetch('/api/auth/zjuam/credentials', { method: 'DELETE' })
    await auth.refresh()
    app.syncLocalCredential()
    if (getZjuamCredential()) {
      void app.loadZjuamCourses({ force: true })
    } else {
      app.resetZjuam()
    }
    toast.success('已从远端删除')
  } catch (error) {
    toast.error(getErrorMessage(error, '删除失败'))
  } finally {
    saving.value = false
  }
}

async function uploadLocal() {
  if (!local.value) {
    toast.error('请先输入密码')
    openForm()
    return
  }
  saving.value = true
  try {
    await apiFetch('/api/auth/zjuam/credentials', {
      method: 'PUT',
      body: JSON.stringify({
        account: local.value.account,
        password: local.value.password,
      }),
    })
    await auth.refresh()
    toast.success('已保存在远端')
  } catch (error) {
    toast.error(getErrorMessage(error, '保存失败'))
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <Card :index="props.index" class="flex flex-col gap-5">
    <div class="flex items-center gap-2 text-sm font-bold">
      <UIcon
        name="i-lucide-school"
        class="h-4 w-4 shrink-0 text-brand-600 dark:text-brand-300"
      />
      浙大统一身份认证信息管理
    </div>

    <div class="rounded-xl border border-line p-4">
      <div class="flex items-center gap-3">
        <div class="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-500/10 text-brand-600 dark:text-brand-300">
          <UIcon name="i-lucide-lock" class="h-4.5 w-4.5 shrink-0" />
        </div>
        <div class="min-w-0 flex-1">
          <div class="text-xs font-semibold text-fg-muted">密码：</div>
          <div class="text-[11px] text-fg-subtle">
            {{ local?.password || auth.user?.hasZjuamPassword ? '••••••' : '(none)' }}
          </div>
        </div>
        <UTooltip :delay-duration="0">
          <UButton color="neutral" variant="soft" size="sm" @click="toggleForm">修改密码</UButton>
          <template #content>
            <p>修改您保存在本地或 tasaas 远端的密码。不会影响浙大统一身份认证服务的密码。</p>
          </template>
        </UTooltip>
      </div>

      <div v-if="editing" class="mt-3 flex flex-col gap-2">
        <div>
          <label class="mb-1.5 block text-xs font-semibold text-fg-muted">浙大账号</label>
          <UInput
            v-model="account"
            class="w-full"
            :maxlength="64"
            autocomplete="off"
            aria-label="浙大账号"
          />
        </div>
        <div>
          <label class="mb-1.5 block text-xs font-semibold text-fg-muted">密码</label>
          <UInput
            v-model="password"
            class="w-full"
            type="password"
            :maxlength="128"
            autocomplete="off"
            aria-label="密码"
          />
        </div>
        <div class="flex flex-wrap justify-end gap-2">
          <UButton size="sm" variant="ghost" @click="closeForm">取消</UButton>
          <PendingButton
            size="sm"
            color="neutral" variant="soft"
            :disabled="!account.trim() || !password"
            :loading="saving"
            icon="i-lucide-hard-drive"
            @click="saveLocal"
          >
            仅保存在本地
          </PendingButton>
          <PendingButton
            size="sm"
            :disabled="!account.trim() || !password"
            :loading="saving"
            icon="i-lucide-cloud-upload"
            @click="saveRemote"
          >
            保存在远端
          </PendingButton>
        </div>
      </div>
    </div>

    <div class="flex items-center gap-3 rounded-xl border border-line bg-sunken px-4 py-3">
      <div class="min-w-0 flex-1">
        <div class="text-xs font-semibold text-fg-muted">远端保存</div>
        <div class="mt-1">
          <span
            v-if="auth.user?.hasZjuamPassword"
            class="rounded-lg bg-brand-500/10 px-2.5 py-1 text-xs font-semibold text-brand-600 dark:text-brand-300"
          >
            已保存在远端
          </span>
          <span
            v-else
            class="rounded-lg bg-elevated px-2.5 py-1 text-xs font-semibold text-fg-subtle"
          >
            未保存在远端
          </span>
        </div>
      </div>
      <PendingButton
        v-if="auth.user?.hasZjuamPassword"
        size="sm"
        color="neutral" variant="soft"
        :loading="saving"
        icon="i-lucide-trash-2"
        @click="deleteRemote"
      >
        从远端删除
      </PendingButton>
      <PendingButton
        v-else
        size="sm"
        color="neutral" variant="soft"
        :loading="saving"
        icon="i-lucide-cloud-upload"
        @click="uploadLocal"
      >
        保存到远端
      </PendingButton>
    </div>

    <UAlert color="info" icon="i-lucide-shield-check">
      <template #description>
        <p class="text-[11px] leading-relaxed">
          我们非常重视您的个人信息安全。除非必要，我们不会收集您的浙大统一身份认证密码。如果您不提供密码，将无法使用我们的部分服务，包括获取和向学在浙大同步实验分数等，但不会影响平台本身功能的使用。选择“密码保存在本地”意味着每次使用学在浙大功能时都会将您的密码发送至远端重新登录；选择“密码保存在远端”则意味着您同意将密码信息于服务器上持久保存。
          详见
          <RouterLink
            to="/terms"
            class="font-semibold text-brand-600 underline decoration-brand-500/40 underline-offset-2 dark:text-brand-300"
          >
            Privacy &amp; Terms
          </RouterLink>
        </p>
      </template>
    </UAlert>
  </Card>
</template>