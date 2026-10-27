<script setup lang="ts">
import HCaptcha from '@hcaptcha/vue3-hcaptcha'
import { storeToRefs } from 'pinia'
import { computed, ref, watchEffect, type ComponentPublicInstance } from 'vue'
import { useRouter } from 'vue-router'

import PendingButton from '@/components/ui/PendingButton.vue'
import Spinner from '@/components/ui/Spinner.vue'
import ThemeToggle from '@/components/ui/ThemeToggle.vue'
import { acceptInvite, ApiError, unlockStudent, type Role } from '@/lib/api'
import { useAuthStore } from '@/lib/auth'
import { getErrorMessage } from '@/lib/error'
import { clearPendingInvite, readPendingInvite } from '@/lib/onboarding'
import { registerPasskey } from '@/lib/passkey'
import { homePathFor } from '@/lib/student-route'
import { useAppStore } from '@/lib/store'
import { useTheme } from '@/lib/theme'
import { toast } from '@/lib/toast'
import { UButton, UFormField, UIcon, UInput } from '@/ui'

const ROLE_LABELS: Record<Role, string> = {
  TA: '助教',
  TEACHER: '教师',
  VIEWER: '观察者',
  STUDENT: '学生',
}

const HCAPTCHA_SITEKEY = import.meta.env.VITE_HCAPTCHA_SITEKEY ?? ''

const router = useRouter()
const auth = useAuthStore()
const app = useAppStore()
const { user, loading } = storeToRefs(auth)
const { onboardingInfo } = storeToRefs(app)
const { completeSetup, adoptSession, refresh } = auth
const { setOnboarding, setOnboardingInfo } = app
const { isDark } = useTheme()

const pendingInvite = readPendingInvite()
const captchaEnabled = Boolean(HCAPTCHA_SITEKEY)
const captchaToken = ref<string | null>(null)
const captchaRef = ref<{ reset: () => void } | null>(null)
const captchaTheme = computed<'light' | 'dark'>(() => (isDark.value ? 'dark' : 'light'))

const studentId = ref(user.value?.studentId ?? '')
const username = ref('')
const name = ref(
  user.value?.name && user.value.name !== user.value.studentId ? user.value.name : '',
)
const password = ref('')
const saving = ref(false)
const bound = ref(user.value?.hasWebauthn ?? false)
const binding = ref(false)
const touched = ref({ username: false, name: false })
const submitted = ref(false)
const serverError = ref<{ field: 'username' | 'name'; message: string } | null>(null)

const isInvite = computed(() => !user.value && Boolean(pendingInvite))
const inviteInfo = computed(() =>
  pendingInvite ??
  (onboardingInfo.value && !('source' in onboardingInfo.value) ? onboardingInfo.value : null),
)
const loginInfo = computed(() =>
  onboardingInfo.value && 'source' in onboardingInfo.value ? onboardingInfo.value : null,
)
const source = computed<'invite' | 'zjuam' | 'login'>(() =>
  isInvite.value
    ? 'invite'
    : (loginInfo.value?.source ?? (inviteInfo.value ? 'invite' : 'login')),
)
const className = computed(() =>
  isInvite.value
    ? pendingInvite?.className || '未命名课程'
    : inviteInfo.value?.className ||
      loginInfo.value?.className ||
      user.value?.classes[0]?.name ||
      '未绑定课程',
)
const role = computed<Role>(() =>
  isInvite.value
    ? (pendingInvite?.role ?? 'TA')
    : (inviteInfo.value?.role ?? loginInfo.value?.role ?? user.value?.role ?? 'TA'),
)
const identifier = computed(
  () => loginInfo.value?.identifier || user.value?.studentId || user.value?.username || '—',
)

const message = computed(() => {
  if (source.value === 'invite') {
    return `你正在创建新账号，因为你收到了来自 ${inviteInfo.value?.inviterName || '课程成员'} 的邀请链接。`
  }
  if (source.value === 'zjuam') {
    return `你正在创建新账号，因为你使用学在浙大登录了学号 ${identifier.value}，对应了 ${className.value} 课程。`
  }
  return `你正在创建新账号，因为你使用学号 / 用户名 ${identifier.value} 登录了 ${className.value} 课程。`
})

const alreadyComplete = computed(() => Boolean(user.value?.username))
const hasBoundStudentId = computed(() => Boolean(user.value?.studentId))
const hasExistingPassword = computed(() => Boolean(user.value?.hasPassword))
const needsIdentityProof = computed(
  () => !hasBoundStudentId.value && !hasExistingPassword.value,
)

const usernameError = computed(() => {
  const error = serverError.value
  if (error?.field === 'username') return error.message
  return !username.value.trim() ? '请输入用户名' : ''
})
const nameError = computed(() => {
  const error = serverError.value
  if (error?.field === 'name') return error.message
  return !name.value.trim() ? '请输入姓名' : ''
})
const showUsernameError = computed(
  () => Boolean(usernameError.value) && (touched.value.username || submitted.value),
)
const showNameError = computed(
  () => Boolean(nameError.value) && (touched.value.name || submitted.value),
)

const submitDisabled = computed(
  () =>
    !username.value.trim() ||
    !name.value.trim() ||
    (needsIdentityProof.value && !studentId.value.trim() && !password.value) ||
    (password.value.length > 0 && password.value.length < 8),
)

function setCaptchaRef(el: Element | ComponentPublicInstance | null) {
  captchaRef.value = el as unknown as { reset: () => void } | null
}

function onCaptchaVerify(token: string) {
  captchaToken.value = token
}

function clearCaptchaToken() {
  captchaToken.value = null
}

function onUsernameInput() {
  if (serverError.value?.field === 'username') serverError.value = null
}

function onNameInput() {
  if (serverError.value?.field === 'name') serverError.value = null
}

function goLogin() {
  void router.push('/login')
}

async function bindPasskey() {
  binding.value = true
  try {
    const ok = await registerPasskey()
    if (!ok) return
    bound.value = true
    toast.success('已绑定通行密钥')
  } catch (error) {
    toast.error(getErrorMessage(error, '绑定失败'))
  } finally {
    binding.value = false
  }
}

function finish(target: string) {
  setOnboarding(false)
  setOnboardingInfo(null)
  clearPendingInvite()
  void router.replace(target)
}

function finishHome() {
  if (user.value) finish(homePathFor(user.value))
}

async function submit() {
  submitted.value = true
  touched.value = { username: true, name: true }
  serverError.value = null
  if (!username.value.trim() || !name.value.trim()) return
  if (needsIdentityProof.value && !studentId.value.trim() && !password.value) return
  if (captchaEnabled && !captchaToken.value) {
    toast.error('请先完成人机验证')
    return
  }
  saving.value = true
  try {
    if (isInvite.value && pendingInvite) {
      const result = await acceptInvite({
        token: pendingInvite.token,
        studentId: studentId.value.trim() || undefined,
        username: username.value.trim(),
        name: name.value.trim(),
        password: password.value || undefined,
      })
      adoptSession(result)
      toast.success('账号已创建')
      finish(homePathFor(result.user))
    } else if (user.value?.role === 'STUDENT') {
      await unlockStudent({
        username: username.value.trim(),
        name: name.value.trim(),
        studentId: studentId.value.trim() || undefined,
        password: password.value || undefined,
      })
      await refresh()
      toast.success('账号已创建')
      finish('/student-console')
    } else {
      const updated = await completeSetup({
        username: username.value.trim(),
        name: name.value.trim(),
        studentId: studentId.value.trim() || undefined,
        password: password.value || undefined,
      })
      toast.success('账号已创建')
      finish(homePathFor(updated))
    }
  } catch (error) {
    if (captchaEnabled) {
      captchaRef.value?.reset()
      captchaToken.value = null
    }
    if (error instanceof ApiError && error.code === 'USERNAME_TAKEN') {
      serverError.value = { field: 'username', message: '该用户名已被占用' }
    } else {
      toast.error(getErrorMessage(error, '创建账号失败'))
    }
  } finally {
    saving.value = false
  }
}

watchEffect(() => {
  if (!loading.value && user.value?.role === 'STUDENT' && user.value.username) {
    void router.replace('/student-console')
  }
})
</script>

<template>
  <div v-if="loading" class="flex min-h-screen items-center justify-center">
    <Spinner size="lg" />
  </div>

  <div
    v-else-if="!user && !pendingInvite"
    class="relative flex min-h-screen items-center justify-center px-6 py-12"
  >
    <div class="absolute right-4 top-4 flex items-center gap-1">
      <ThemeToggle />
    </div>
    <div
      class="w-full max-w-sm rounded-2xl border border-line bg-elevated p-6 text-center"
    >
      <h1 class="text-xl font-bold tracking-tight">完善账号信息</h1>
      <p class="mt-2 text-sm text-fg-muted">请先登录，或通过邀请链接创建账号。</p>
      <UButton block class="mt-5" @click="goLogin">去登录</UButton>
    </div>
  </div>

  <div
    v-else-if="user?.role === 'STUDENT' && user.username"
    class="flex min-h-screen items-center justify-center"
  >
    <Spinner size="lg" />
  </div>

  <div v-else class="relative flex min-h-screen items-center justify-center px-6 py-12">
    <div class="absolute right-4 top-4 flex items-center gap-1">
      <ThemeToggle />
    </div>

    <div class="w-full max-w-lg">
      <div class="text-center">
        <h1 class="text-2xl font-bold tracking-tight">完善账号信息</h1>
      </div>

      <div class="mt-6 rounded-2xl border border-line bg-sunken p-4">
        <p class="text-sm leading-relaxed text-fg-muted">{{ message }}</p>
      </div>
      <div class="mt-4 grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
        <span class="text-fg-subtle">课程</span>
        <span class="font-semibold text-fg">{{ className }}</span>
        <span class="text-fg-subtle">身份</span>
        <span class="font-semibold text-fg">{{ ROLE_LABELS[role] }}</span>
      </div>

      <div
        v-if="alreadyComplete"
        class="mt-6 flex flex-col gap-3 rounded-2xl border border-line p-4 text-center"
      >
        <p class="text-sm text-fg-muted">该账号信息已完善，无需再次创建。</p>
        <PendingButton block color="neutral" variant="soft" @click="finishHome">返回首页</PendingButton>
      </div>

      <form v-else class="mt-6 flex flex-col gap-4" @submit.prevent="submit">
        <div class="grid gap-3">
          <UFormField
            label="用户名"
            required
            class="w-full"
            :error="showUsernameError ? usernameError : undefined"
            :help="showUsernameError ? undefined : '将会作为你的登录凭据。'"
          >
            <UInput
              v-model="username"
              name="username"
              placeholder="设置后可用于登录"
              autocomplete="username"
              :maxlength="32"
              autofocus
              class="w-full"
              :aria-invalid="showUsernameError"
              @update:model-value="onUsernameInput"
              @blur="touched.username = true"
            />
          </UFormField>

          <UFormField
            label="姓名"
            required
            class="w-full"
            :error="showNameError ? nameError : undefined"
            :help="
              showNameError
                ? undefined
                : '将会展示在各个页面上，推荐使用真实姓名，也可以使用你觉得不会被人误解的名称。'
            "
          >
            <UInput
              v-model="name"
              name="name"
              placeholder="张三"
              autocomplete="name"
              :maxlength="32"
              class="w-full"
              :aria-invalid="showNameError"
              @update:model-value="onNameInput"
              @blur="touched.name = true"
            />
          </UFormField>
        </div>

        <div class="flex items-center gap-3 py-1">
          <div class="h-px flex-1 bg-line" />
          <span class="text-[10px] font-semibold uppercase tracking-widest text-fg-subtle">
            登录信息
          </span>
          <div class="h-px flex-1 bg-line" />
        </div>

        <div class="flex flex-col gap-4 rounded-2xl border border-line p-4">
          <UFormField
            v-if="!hasBoundStudentId"
            label="学工号（选填）"
            help="学工号绑定后不可修改，绑定后可用统一身份认证登录或找回密码。"
          >
            <UInput
              v-model="studentId"
              placeholder="请输入学工号"
              autocomplete="off"
              :maxlength="32"
              class="w-full"
            />
          </UFormField>

          <div>
            <UFormField label="密码（选填）">
              <UInput
                v-model="password"
                type="password"
                :placeholder="hasExistingPassword ? '留空则不更改密码' : '至少 8 位'"
                :minlength="password ? 8 : undefined"
                autocomplete="new-password"
                class="w-full"
              />
            </UFormField>
            <p
              v-if="hasBoundStudentId && !hasExistingPassword"
              class="mt-1.5 text-[11px] leading-relaxed text-fg-subtle"
            >
              如果不设置密码，后续只能使用浙大统一身份认证登录；进入工作台后也可以重新设置 / 修改密码。
            </p>
            <template v-if="needsIdentityProof">
              <p class="mt-1.5 text-[11px] leading-relaxed text-fg-subtle">
                密码设置后可用于用户名 / 密码登录，进入工作台后也可以修改。
              </p>
              <p class="mt-1.5 text-[11px] leading-relaxed text-danger">
                至少要提供学工号或密码之一。
              </p>
            </template>
          </div>

          <div v-if="user" class="flex flex-col gap-1">
            <div class="flex items-center gap-3">
              <div
                class="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-500/10 text-brand-600 dark:text-brand-300"
              >
                <UIcon name="i-lucide-fingerprint" class="h-[18px] w-[18px] shrink-0" />
              </div>
              <span class="flex-1 text-xs font-semibold text-fg-muted">
                WebAuthn（选填）
              </span>
              <PendingButton
                size="sm"
                :variant="bound ? 'ghost' : 'soft'"
                :loading="binding"
                :disabled="bound"
                :icon="bound ? 'i-lucide-check' : 'i-lucide-plus'"
                @click="bindPasskey"
              >
                {{ bound ? '已绑定' : '立即绑定本设备' }}
              </PendingButton>
            </div>
            <p class="text-[11px] text-fg-subtle">Touch ID · Face ID · Windows Hello</p>
          </div>
        </div>

        <div v-if="captchaEnabled" class="flex justify-center">
          <HCaptcha
            :key="captchaTheme"
            :ref="setCaptchaRef"
            :sitekey="HCAPTCHA_SITEKEY"
            :theme="captchaTheme"
            language="zh"
            @verify="onCaptchaVerify"
            @expired="clearCaptchaToken"
            @error="clearCaptchaToken"
          />
        </div>

        <PendingButton
          type="submit"
          block
          size="lg"
          :loading="saving"
          :disabled="submitDisabled"
          class="mt-2 bg-gradient-to-r from-brand-600 to-brand-700 shadow-lg shadow-brand-600/25"
          icon="i-lucide-arrow-right"
          loading-label="创建中"
        >
          创建账号
        </PendingButton>
      </form>
    </div>
  </div>
</template>