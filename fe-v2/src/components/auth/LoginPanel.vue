<script setup lang="ts">
import HCaptcha from '@hcaptcha/vue3-hcaptcha'
import { startAuthentication } from '@simplewebauthn/browser'
import { computed, onMounted, onUnmounted, ref, watch, type ComponentPublicInstance } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import { ApiError, isClassSelection, isLoginSelection } from '@/lib/api'
import { useAuthStore } from '@/lib/auth'
import { getErrorMessage } from '@/lib/error'
import { getLastUsers, lastUserIdentifier, type LastUser } from '@/lib/last-user'
import { getAuthenticationOptions } from '@/lib/passkey'
import { getRuntimeInfo, isLocalhostHost } from '@/lib/runtime'
import { homePathFor } from '@/lib/student-route'
import { useAppStore } from '@/lib/store'
import { useTheme } from '@/lib/theme'
import { toast } from '@/lib/toast'
import { cn } from '@/lib/utils'
import { UButton, UIcon, UInput } from '@/ui'

type Method = 'password' | 'zjuam'

const METHODS: { key: Method; icon: string; label: string }[] = [
  { key: 'password', icon: 'i-lucide-key-round', label: '账号密码' },
  { key: 'zjuam', icon: 'i-lucide-university', label: '统一身份认证' },
]

const HCAPTCHA_SITEKEY = import.meta.env.VITE_HCAPTCHA_SITEKEY ?? ''

const router = useRouter()
const route = useRoute()
const auth = useAuthStore()
const app = useAppStore()
const { isDark, toggleTheme } = useTheme()

const logoSrc = `${import.meta.env.BASE_URL}favicon.svg`

const lastUsers = getLastUsers()
const showFull = ref(false)
const showUserPicker = ref(false)
const method = ref<Method>('password')
const identifier = ref('')
const account = ref('')
const password = ref('')
const loading = ref(false)
const passkeyLoading = ref(false)
const prefilled = ref(false)
const captchaToken = ref<string | null>(null)
const captchaEnabled = ref(Boolean(HCAPTCHA_SITEKEY))
const captchaTheme = ref<'light' | 'dark'>(isDark.value ? 'dark' : 'light')
const captchaRef = ref<{ reset: () => void } | null>(null)

const lastUser = computed(() => lastUsers[0] ?? null)
const passkeyUsers = computed(() => lastUsers.filter((item) => item.hasWebauthn))
const showLastCard = computed(
  () => Boolean(lastUser.value) && !showFull.value && !showUserPicker.value,
)
const lastIdentifier = computed(() => (lastUser.value ? lastUserIdentifier(lastUser.value) : ''))
const isZjuam = computed(() => method.value === 'zjuam')

let cancelled = false

onMounted(() => {
  if (!HCAPTCHA_SITEKEY) return
  void getRuntimeInfo().then((info) => {
    if (cancelled || !info) return
    if (info.dev && isLocalhostHost()) captchaEnabled.value = false
  })
})

onUnmounted(() => {
  cancelled = true
})

watch([isDark, captchaToken], () => {
  if (!captchaToken.value) captchaTheme.value = isDark.value ? 'dark' : 'light'
})

function setCaptchaRef(el: Element | ComponentPublicInstance | null) {
  captchaRef.value = el as unknown as { reset: () => void } | null
}

function onCaptchaVerify(token: string) {
  captchaToken.value = token
}

function clearCaptchaToken() {
  captchaToken.value = null
}

function roleIcon(role: LastUser['role']): string {
  if (role === 'TEACHER') return 'i-lucide-book-open-check'
  if (role === 'STUDENT') return 'i-lucide-graduation-cap'
  if (role === 'VIEWER') return 'i-lucide-eye'
  return 'i-lucide-shield-check'
}

function roleLabel(role: LastUser['role']): string {
  if (role === 'TEACHER') return '教师'
  if (role === 'STUDENT') return '学生'
  if (role === 'VIEWER') return '观察者'
  return '助教'
}

function currentFrom(): string | undefined {
  const queryFrom = route.query.from
  if (typeof queryFrom === 'string' && queryFrom) return queryFrom
  const state = window.history.state as { from?: unknown } | null
  return typeof state?.from === 'string' ? state.from : undefined
}

function switchMethod(next: Method) {
  if (next === method.value) return
  method.value = next
  captchaToken.value = null
  identifier.value = ''
  account.value = ''
  password.value = ''
}

function continueWithOtherMethod(value = lastIdentifier.value) {
  if (!lastUser.value) return
  showUserPicker.value = false
  method.value = 'password'
  captchaToken.value = null
  identifier.value = value
  account.value = ''
  password.value = ''
  prefilled.value = true
  showFull.value = true
}

function switchUser() {
  if (passkeyUsers.value.length > 1) {
    showUserPicker.value = true
    showFull.value = false
    captchaToken.value = null
    return
  }

  showUserPicker.value = false
  showFull.value = true
  prefilled.value = false
  method.value = 'password'
  captchaToken.value = null
  identifier.value = ''
  account.value = ''
  password.value = ''
}

async function submit() {
  if (captchaEnabled.value && !captchaToken.value) {
    toast.error('请先完成人机验证')
    return
  }

  loading.value = true

  const zjuam = method.value === 'zjuam'
  const endpoint = zjuam ? '/api/auth/zjuam/login' : '/api/auth/login'
  const body = zjuam
    ? {
        account: account.value.trim(),
        password: password.value,
        captchaToken: captchaToken.value ?? undefined,
      }
    : {
        identifier: identifier.value.trim(),
        password: password.value,
        captchaToken: captchaToken.value ?? undefined,
      }

  const from = currentFrom()
  try {
    const result = await auth.login(endpoint, body)
    if (isLoginSelection(result)) {
      void router.replace({
        path: '/login/select',
        state: {
          selectionToken: result.selectionToken,
          candidates: result.candidates,
          from,
        },
      })
      return
    }
    if (isClassSelection(result)) {
      void router.replace({
        path: '/login/class',
        state: {
          selectionToken: result.selectionToken,
          courses: result.courses,
          from,
        },
      })
      return
    }
    const user = result.user
    if (!user.username) {
      app.setOnboardingInfo({
        source: zjuam ? 'zjuam' : 'login',
        identifier: zjuam ? account.value.trim() : identifier.value.trim(),
        className: user.classes[0]?.name ?? null,
        role: user.role,
      })
      app.setOnboarding(true)
    }
    toast.success(`欢迎回来，${user.name}`)
    const dest = from ?? homePathFor(user)
    void router.replace(dest)
  } catch (error) {
    if (captchaEnabled.value) {
      captchaRef.value?.reset()
      captchaToken.value = null
    }
    toast.error(getErrorMessage(error, '登录失败'))
  } finally {
    loading.value = false
  }
}

async function passkeyLogin(hint?: string) {
  passkeyLoading.value = true
  try {
    const { options, challengeToken } = await getAuthenticationOptions(hint)
    const assertion = await startAuthentication({ optionsJSON: options })
    const result = await auth.login('/api/auth/passkey/authentication-verify', {
      response: assertion,
      challengeToken,
    })
    if (isLoginSelection(result) || isClassSelection(result)) return
    const user = result.user
    if (!user.username) {
      app.setOnboardingInfo({
        source: 'login',
        identifier: user.studentId ?? hint ?? null,
        className: user.classes[0]?.name ?? null,
        role: user.role,
      })
      app.setOnboarding(true)
    }
    toast.success(`欢迎回来，${user.name}`)
    const from = currentFrom()
    void router.replace(from ?? homePathFor(user))
  } catch (error) {
    if ((error as Error).name === 'NotAllowedError') return
    if (error instanceof ApiError && error.code === 'CREDENTIAL_NOT_FOUND') {
      toast.error('该通行密钥不可用，请改用密码登录')
      if (lastUser.value && !showFull.value) continueWithOtherMethod(hint ?? lastIdentifier.value)
      return
    }
    toast.error(getErrorMessage(error, '登录失败'))
  } finally {
    passkeyLoading.value = false
  }
}
</script>

<template>
  <div class="relative flex min-h-full flex-col items-center justify-center px-6 py-12">
    <div class="absolute right-4 top-4 flex items-center gap-1">
      <UButton
        type="button"
        color="neutral"
        variant="ghost"
        square
        aria-label="切换主题"
        :icon="isDark ? 'i-lucide-moon' : 'i-lucide-sun'"
        @click="toggleTheme"
      />
    </div>

    <div class="w-full max-w-sm animate-fade-up">
      <div class="mb-8 flex items-center gap-3 lg:hidden">
        <img
          :src="logoSrc"
          width="40"
          height="40"
          alt=""
          aria-hidden="true"
          draggable="false"
          class="shrink-0 select-none"
        />
        <div>
          <div class="font-bold tracking-tight">欢迎回来</div>
          <div class="text-xs text-fg-subtle">登录计算机系统课程助教系统</div>
        </div>
      </div>

      <div class="hidden lg:block">
        <h2 class="text-2xl font-bold tracking-tight">欢迎回来</h2>
      </div>

      <template v-if="showUserPicker">
        <div class="mt-6 flex flex-col gap-3">
          <div class="flex items-center gap-2 text-xs font-semibold text-fg-muted">
            <UIcon name="i-lucide-users" class="size-4 shrink-0" />
            选择上次登录用户
          </div>
          <div class="flex flex-col gap-2">
            <button
              v-for="item in passkeyUsers"
              :key="item.id"
              type="button"
              :disabled="passkeyLoading"
              class="flex items-center gap-3 rounded-2xl border border-line bg-sunken p-3 text-left transition-colors hover:bg-elevated disabled:cursor-not-allowed disabled:opacity-60"
              @click="passkeyLogin(lastUserIdentifier(item) || undefined)"
            >
              <div
                class="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-500/10 text-brand-600 dark:text-brand-300"
              >
                <UIcon :name="roleIcon(item.role)" class="size-[18px] shrink-0" />
              </div>
              <div class="min-w-0 flex-1">
                <div class="truncate text-sm font-semibold text-fg">{{ item.name }}</div>
                <div class="truncate text-xs text-fg-subtle">
                  {{ lastUserIdentifier(item) || '—' }} · 通行密钥
                </div>
              </div>
              <UIcon
                name="i-lucide-fingerprint"
                class="size-[18px] shrink-0 text-brand-600 dark:text-brand-300"
              />
            </button>
          </div>
          <UButton type="button" block variant="ghost" color="neutral" @click="showUserPicker = false">
            返回
          </UButton>
        </div>
      </template>

      <template v-else-if="showLastCard && lastUser">
        <div class="mt-6 flex flex-col gap-4">
          <div class="flex items-center gap-3 rounded-2xl border border-line bg-sunken p-4">
            <div
              class="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-brand-500/10 text-brand-600 dark:text-brand-300"
            >
              <UIcon :name="roleIcon(lastUser.role)" class="size-5 shrink-0" />
            </div>
            <div class="min-w-0 flex-1">
              <div class="truncate text-sm font-semibold text-fg">{{ lastUser.name }}</div>
              <div class="truncate text-xs text-fg-subtle">
                {{ lastIdentifier || '—' }} · {{ roleLabel(lastUser.role) }}
              </div>
            </div>
            <span
              class="shrink-0 rounded-full bg-elevated px-2 py-0.5 text-[10px] font-semibold text-fg-subtle"
            >
              上次登录
            </span>
          </div>

          <UButton
            v-if="lastUser.hasWebauthn"
            type="button"
            block
            :loading="passkeyLoading"
            icon="i-lucide-fingerprint"
            @click="passkeyLogin(lastIdentifier || undefined)"
          >
            {{ passkeyLoading ? '验证中' : '使用通行密钥继续' }}
          </UButton>

          <UButton
            type="button"
            block
            variant="soft"
            color="neutral"
            icon="i-lucide-ellipsis"
            @click="continueWithOtherMethod()"
          >
            其它登录方式
          </UButton>

          <UButton
            type="button"
            block
            variant="soft"
            color="neutral"
            icon="i-lucide-users"
            @click="switchUser"
          >
            切换用户
          </UButton>
        </div>
      </template>

      <template v-else>
        <div class="mt-6">
          <div class="mb-1.5 text-xs font-semibold text-fg-muted">登录方式</div>
          <div class="grid grid-cols-2 gap-1 rounded-2xl border border-line bg-sunken p-1.5">
            <button
              v-for="item in METHODS"
              :key="item.key"
              type="button"
              :class="
                cn(
                  'relative flex items-center justify-center gap-1.5 rounded-xl py-2 text-xs font-semibold transition-colors',
                  method === item.key ? 'text-fg' : 'text-fg-subtle hover:text-fg-muted',
                )
              "
              @click="switchMethod(item.key)"
            >
              <span
                v-if="method === item.key"
                class="absolute inset-0 rounded-xl bg-elevated shadow-sm ring-1 ring-line"
              />
              <UIcon
                :name="item.icon"
                :class="
                  cn(
                    'relative size-4 shrink-0',
                    method === item.key && 'text-brand-600 dark:text-brand-300',
                  )
                "
              />
              <span class="relative">{{ item.label }}</span>
            </button>
          </div>
        </div>

        <form :key="method" class="mt-6 flex flex-col gap-4" @submit.prevent="submit">
          <div v-if="isZjuam">
            <label for="login-account" class="mb-1.5 block text-xs font-semibold text-fg-muted">
              统一身份认证账号
            </label>
            <UInput
              id="login-account"
              v-model="account"
              class="w-full"
              placeholder="请输入统一身份认证账号"
              autocomplete="username"
              autofocus
              required
            />
          </div>
          <div v-else>
            <label for="login-identifier" class="mb-1.5 block text-xs font-semibold text-fg-muted">
              用户名 / 学号
            </label>
            <UInput
              id="login-identifier"
              v-model="identifier"
              class="w-full"
              placeholder="请输入用户名或学号"
              autocomplete="username"
              :autofocus="!prefilled"
              required
            />
          </div>
          <div>
            <label for="login-password" class="mb-1.5 block text-xs font-semibold text-fg-muted">
              密码
            </label>
            <UInput
              id="login-password"
              v-model="password"
              class="w-full"
              type="password"
              placeholder="请输入密码"
              autocomplete="current-password"
              :autofocus="prefilled && !isZjuam"
              required
            />
          </div>
          <p v-if="isZjuam" class="text-xs text-fg-subtle">
            使用学校统一身份认证登录，无需本地账号
          </p>
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
          <UButton
            type="submit"
            block
            class="mt-2"
            :loading="loading"
            icon="i-lucide-arrow-right"
          >
            {{ loading ? '登录中' : '登录' }}
          </UButton>
        </form>

        <div class="mt-6 flex flex-col gap-4">
          <div class="flex items-center gap-3">
            <div class="h-px flex-1 bg-line" />
            <span class="text-[10px] font-semibold uppercase tracking-widest text-fg-subtle">
              或
            </span>
            <div class="h-px flex-1 bg-line" />
          </div>
          <UButton
            type="button"
            block
            variant="ghost"
            color="neutral"
            :loading="passkeyLoading"
            icon="i-lucide-fingerprint"
            @click="passkeyLogin(identifier.trim() || undefined)"
          >
            {{ passkeyLoading ? '验证中' : '使用通行密钥登录' }}
          </UButton>
        </div>
      </template>

      <UButton
        type="button"
        block
        variant="soft"
        color="neutral"
        class="mt-4"
        icon="i-lucide-monitor-smartphone"
        @click="router.push('/checkin')"
      >
        验收从机
      </UButton>
    </div>
  </div>
</template>
