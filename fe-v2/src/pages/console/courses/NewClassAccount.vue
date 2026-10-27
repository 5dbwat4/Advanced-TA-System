<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'

import PendingButton from '@/components/ui/PendingButton.vue'
import ThemeToggle from '@/components/ui/ThemeToggle.vue'
import { createClassAccount } from '@/lib/api'
import { useAuthStore } from '@/lib/auth'
import { getErrorMessage } from '@/lib/error'
import { toast } from '@/lib/toast'
import { UButton, UIcon, UInput, USwitch } from '@/ui'

type BindState = {
  bindToken: string
  classId?: string
  className?: string
}

const router = useRouter()
const auth = useAuthStore()

const state = (window.history.state as BindState | null) ?? null
const bindToken = state?.bindToken ?? ''
const classId = state?.classId ?? ''
const className = state?.className ?? ''
const hasTarget = Boolean(bindToken) && Boolean(classId)

const name = ref(auth.user?.name ?? '')
const username = ref(auth.user?.username ?? '')
const password = ref('')
const syncLogin = ref(true)
const syncPreferences = ref(true)
const saving = ref(false)

function setSyncLogin(value: boolean) {
  syncLogin.value = value
}

function setSyncPreferences(value: boolean) {
  syncPreferences.value = value
}

async function submit() {
  if (!auth.user) {
    toast.error('登录状态已失效，请重新登录')
    return
  }
  if (!hasTarget) {
    toast.error('缺少课程信息，请先添加课程')
    return
  }
  if (!className) {
    toast.error('缺少课程名称，请重新获取课程')
    return
  }
  if (!syncLogin.value && password.value && password.value.length < 8) {
    toast.error('密码至少 8 位')
    return
  }

  saving.value = true
  try {
    const result = await createClassAccount({
      bindToken,
      classId,
      name: name.value.trim(),
      username: username.value.trim(),
      password: syncLogin.value ? undefined : password.value,
      syncLogin: syncLogin.value,
      syncPreferences: syncPreferences.value,
    })
    auth.adoptSession(result)
    toast.success(`已创建账号并切换到 ${result.user.name}`)
    void router.replace('/console')
  } catch (error) {
    toast.error(getErrorMessage(error, '创建账号失败'))
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <div class="relative flex min-h-screen items-center justify-center px-6 py-12">
    <div class="absolute right-4 top-4 flex items-center gap-1">
      <ThemeToggle />
    </div>

    <div class="w-full max-w-sm animate-fade-up">
      <div class="text-center">
        <div class="mb-3 flex justify-center">
          <div class="flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-500/10 text-brand-600 dark:text-brand-300">
            <UIcon name="i-lucide-graduation-cap" class="h-6 w-6 shrink-0" />
          </div>
        </div>
        <h1 class="text-2xl font-bold tracking-tight">为新班级创建账户</h1>
        <p class="mt-1.5 text-xs text-fg-subtle">
          {{ className || '新班级' }} · 当前账号会保留在原班级
        </p>
      </div>

      <div
        v-if="!hasTarget"
        class="mt-6 rounded-2xl border border-dashed border-danger/40 p-6 text-center"
      >
        <p class="text-sm text-danger">
          缺少课程信息，请从“助教绑定课程”重新添加课程。
        </p>
        <UButton color="neutral" variant="soft" block class="mt-4" @click="router.push('/console/settings')">
          返回设置
        </UButton>
      </div>

      <form v-else class="mt-6 flex flex-col gap-4" @submit.prevent="submit">
        <div class="rounded-2xl border border-line bg-sunken px-4 py-3 text-xs text-fg-subtle">
          <div class="flex items-center justify-between gap-3">
            <span>当前学号</span>
            <span class="tabular font-semibold text-fg-muted">{{ auth.user?.studentId ?? '—' }}</span>
          </div>
          <div class="mt-1.5 flex items-center justify-between gap-3">
            <span>目标班级</span>
            <span class="truncate font-semibold text-fg-muted">{{ className || '未命名课程' }}</span>
          </div>
        </div>

        <div>
          <label class="mb-1.5 block text-xs font-semibold text-fg-muted">姓名</label>
          <UInput
            v-model="name"
            class="w-full"
            placeholder="张三"
            :minlength="1"
            :maxlength="32"
            autocomplete="name"
            autofocus
            required
          />
        </div>

        <div class="flex items-center gap-3 py-1">
          <div class="h-px flex-1 bg-line" />
          <span class="text-[10px] font-semibold uppercase tracking-widest text-fg-subtle">
            登录信息
          </span>
          <div class="h-px flex-1 bg-line" />
        </div>

        <div>
          <label class="mb-1.5 block text-xs font-semibold text-fg-muted">用户名</label>
          <UInput
            v-model="username"
            class="w-full"
            placeholder="新账号的登录用户名"
            :minlength="1"
            :maxlength="32"
            autocomplete="username"
            required
          />
        </div>

        <div class="flex items-center justify-between gap-4 rounded-xl border border-line px-4 py-3">
          <div class="min-w-0">
            <div class="text-xs font-semibold text-fg-muted">从原账号同步登录信息？</div>
            <div class="text-[11px] text-fg-subtle">同步原账号密码</div>
          </div>
          <USwitch
            aria-label="从原账号同步登录信息"
            :model-value="syncLogin"
            @update:model-value="setSyncLogin"
          />
        </div>

        <div>
          <label class="mb-1.5 block text-xs font-semibold text-fg-muted">密码</label>
          <UInput
            v-model="password"
            class="w-full"
            type="password"
            :placeholder="syncLogin ? '随原账号同步' : '留空则不设置密码'"
            autocomplete="new-password"
            :disabled="syncLogin"
          />
        </div>

        <div class="flex items-center justify-between gap-4 rounded-xl border border-line px-4 py-3">
          <div class="min-w-0">
            <div class="text-xs font-semibold text-fg-muted">同步我的偏好信息？</div>
            <div class="text-[11px] text-fg-subtle">复制头像与界面偏好到新账号</div>
          </div>
          <USwitch
            aria-label="同步我的偏好信息"
            :model-value="syncPreferences"
            @update:model-value="setSyncPreferences"
          />
        </div>

        <PendingButton
          type="submit"
          block
          size="lg"
          :loading="saving"
          :disabled="
            !name.trim() ||
            !username.trim() ||
            (!syncLogin && password.length > 0 && password.length < 8)
          "
          class="mt-2 bg-gradient-to-r from-brand-600 to-brand-700 shadow-lg shadow-brand-600/25"
          icon="i-lucide-arrow-right"
          loading-label="创建中"
        >
          创建并进入
        </PendingButton>

        <UButton variant="ghost" block @click="router.back()">取消</UButton>
      </form>
    </div>
  </div>
</template>