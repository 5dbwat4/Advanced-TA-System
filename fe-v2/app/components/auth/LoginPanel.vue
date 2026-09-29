<script setup lang="ts">
/**
 * LoginPanel —— 移植自 `fe/src/components/auth/LoginPanel.tsx`（416 行）
 *
 * ────────────────────────────────────────────────────────────────────────
 * 一、迁移动作对照
 * ────────────────────────────────────────────────────────────────────────
 * 1) `location.state.from` → `useRoute().query.redirect`
 *    （旧版的 `from` 由 `RequireAuth` 用 history state 传，Vue 端的
 *     `middleware/auth.global.ts` 走 `?redirect=`，缺省仍是 `/console`）。
 * 2) `<Form validationBehavior>` + 每字段 `validate`：**不引 zod**（依赖里没有）。
 *    把校验函数写成普通函数 `validate()`，在提交时统一跑一遍，错误以
 *    「红色 inline 文案 + 出错输入框红色描边」呈现：
 *      - 文案类名 `text-xs text-danger`（与 Scores.tsx:532 / ExperimentDetail.tsx:501
 *        一致，是本站既有的红色提示写法）
 *      - 输入框用 AppInput 的 `:color="... 'error'"`（→ UInput 的 error ring）
 *      - `<form novalidate>` 关掉浏览器原生 required 气泡，改由我们统一提示
 *    服务端返回的失败（密码错误 / 通行密钥错误）仍走旧版的 `toast.error`。
 * 3) 通行密钥（WebAuthn）：`@simplewebauthn/browser` 的调用与 `apiFetch` 的
 *    `/api/auth/passkey/*` 请求逐行照搬。
 *    ⚠️ `~/lib/passkey` 属于 MIGRATION.md Phase B 的 lib 搬运清单、当前还不存在，
 *    本批**不新建 lib/**，所以 `getAuthenticationOptions` 在本文件内联实现；
 *    Phase B 建好 `app/lib/passkey.ts` 后请把这段换成 import。
 * 4) pending 反馈：`isPending` 直接给 AppButton（UButton 自带 spinner），
 *    作用域插槽里只做「图标切换 + 文案切换」，**不再手写 Spinner**（双 spinner）。
 * 5) 动效：`login-role-pill` / `login-method-pill` 两个 `layoutId` + spring，
 *    表单区 `AnimatePresence mode="wait"` 按 `role + method` 换 key 淡入淡出。
 */
import { startAuthentication, type PublicKeyCredentialRequestOptionsJSON } from '@simplewebauthn/browser'
import { AnimatePresence, motion } from 'motion-v'

import ArrowRight from '~icons/lucide/arrow-right'
import BookOpenCheck from '~icons/lucide/book-open-check'
import Cpu from '~icons/lucide/cpu'
import Ellipsis from '~icons/lucide/ellipsis'
import Fingerprint from '~icons/lucide/fingerprint'
import KeyRound from '~icons/lucide/key-round'
import ShieldCheck from '~icons/lucide/shield-check'
import University from '~icons/lucide/university'
import Users from '~icons/lucide/users'

import { ApiError, apiFetch } from '~/lib/api'
import { clearLastUser, getLastUser, lastUserIdentifier, type LastUser } from '~/lib/last-user'
import type { IconComponent } from '~/lib/nav'
import { cn } from '~/lib/utils'

type Role = 'TA' | 'TEACHER'
type Method = 'password' | 'zjuam'
/** 校验失败时定位到哪个字段（用于给输入框加 error 描边） */
type FieldName = 'account' | 'identifier' | 'password'

const ROLES: { key: Role; icon: IconComponent; label: string }[] = [
  { key: 'TA', icon: ShieldCheck, label: '助教' },
  { key: 'TEACHER', icon: BookOpenCheck, label: '教师' },
]

const METHODS: { key: Method; icon: IconComponent; label: string }[] = [
  { key: 'password', icon: KeyRound, label: '账号密码' },
  { key: 'zjuam', icon: University, label: '统一身份认证' },
]

/** ease: cubic-bezier(0.16, 1, 0.3, 1)（= main.css 里的 --ease-out-expo） */
const EASE: [number, number, number, number] = [0.16, 1, 0.3, 1]
/** 角色 / 登录方式切换胶囊的 spring（源文件 :255 / :290） */
const PILL_TRANSITION = { type: 'spring', stiffness: 500, damping: 35 }

const route = useRoute()
const auth = useAuthStore()
const toast = useToasts()

/** 登录成功后回跳的原始路径：旧版是 history state.from，这里是 ?redirect= */
const from = computed(() => (typeof route.query.redirect === 'string' ? route.query.redirect : undefined))

const lastUser = ref<LastUser | null>(getLastUser())
const showFull = ref(false)
const role = ref<Role>('TA')
const method = ref<Method>('password')
const identifier = ref('')
const account = ref('')
const password = ref('')
const loading = ref(false)
const passkeyLoading = ref(false)
const prefilled = ref(false)

// 表单校验状态（红色 inline 提示）
const formError = ref('')
const formErrorField = ref<FieldName | null>(null)

const showLastCard = computed(() => Boolean(lastUser.value) && !showFull.value)
const lastIdentifier = computed(() => (lastUser.value ? lastUserIdentifier(lastUser.value) : ''))
const isZjuam = computed(() => role.value === 'TA' && method.value === 'zjuam')

function clearFormError() {
  formError.value = ''
  formErrorField.value = null
}

function setFormError(field: FieldName, message: string) {
  formError.value = message
  formErrorField.value = field
}

/**
 * 旧版 HeroUI `Form` 每字段 `validate` 的等价实现（不引 zod）：
 * 统一在提交时跑一遍，命中第一个错误就返回。
 */
function validate() {
  if (isZjuam.value) {
    if (!account.value.trim()) {
      setFormError('account', '请输入统一身份认证账号')
      return
    }
  } else if (!identifier.value.trim()) {
    setFormError('identifier', '请输入用户名或学号')
    return
  }
  if (!password.value) {
    setFormError('password', '请输入密码')
  }
}

function switchRole(next: Role) {
  if (next === role.value) return
  role.value = next
  method.value = 'password'
  identifier.value = ''
  account.value = ''
  password.value = ''
  clearFormError()
}

function switchMethod(next: Method) {
  if (next === method.value) return
  method.value = next
  identifier.value = ''
  account.value = ''
  password.value = ''
  clearFormError()
}

function continueWithOtherMethod() {
  if (!lastUser.value) return
  role.value = lastUser.value.role
  method.value = 'password'
  identifier.value = lastIdentifier.value
  account.value = ''
  password.value = ''
  prefilled.value = true
  showFull.value = true
  clearFormError()
}

function switchAccount() {
  clearLastUser()
  lastUser.value = null
  showFull.value = true
  prefilled.value = false
  role.value = 'TA'
  method.value = 'password'
  identifier.value = ''
  account.value = ''
  password.value = ''
  clearFormError()
}

async function submit() {
  clearFormError()
  validate()
  if (formError.value) return

  const zjuam = role.value === 'TA' && method.value === 'zjuam'
  const endpoint = zjuam
    ? '/api/auth/zjuam/login'
    : role.value === 'TEACHER'
      ? '/api/auth/login/teacher'
      : '/api/auth/login/ta'
  const body = zjuam ? { account: account.value.trim(), password: password.value } : { identifier: identifier.value.trim(), password: password.value }

  loading.value = true
  try {
    const user = await auth.login(endpoint, body)
    toast.success(`欢迎回来，${user.name}`)
    const dest = user.username ? (from.value ?? '/console') : '/setup'
    await navigateTo(dest, { replace: true })
  } catch (error) {
    toast.error(error instanceof Error ? error.message : '登录失败')
  } finally {
    loading.value = false
  }
}

/**
 * 旧版 `~/lib/passkey` 的 getAuthenticationOptions（本批内联，Phase B 换成 import）
 */
function getAuthenticationOptions(identifierHint?: string) {
  const query = identifierHint ? `?identifier=${encodeURIComponent(identifierHint)}` : ''
  return apiFetch<{
    options: PublicKeyCredentialRequestOptionsJSON
    challengeToken: string
  }>(`/api/auth/passkey/authentication-options${query}`)
}

async function passkeyLogin(hint?: string) {
  passkeyLoading.value = true
  try {
    const { options, challengeToken } = await getAuthenticationOptions(hint)
    const assertion = await startAuthentication({ optionsJSON: options })
    const user = await auth.login('/api/auth/passkey/authentication-verify', {
      response: assertion,
      challengeToken,
    })
    toast.success(`欢迎回来，${user.name}`)
    const dest = user.username ? (from.value ?? '/console') : '/setup'
    await navigateTo(dest, { replace: true })
  } catch (error) {
    if ((error as Error).name === 'NotAllowedError') return
    if (error instanceof ApiError && error.code === 'CREDENTIAL_NOT_FOUND') {
      toast.error('该通行密钥不可用，请改用密码登录')
      if (lastUser.value && !showFull.value) continueWithOtherMethod()
      return
    }
    toast.error(error instanceof Error ? error.message : '登录失败')
  } finally {
    passkeyLoading.value = false
  }
}
</script>

<template>
  <div class="relative flex flex-1 flex-col items-center justify-center px-6 py-12">
    <div class="absolute right-4 top-4 flex items-center gap-1">
      <ThemeToggle />
    </div>

    <motion.div
      :initial="{ opacity: 0, y: 24 }"
      :animate="{ opacity: 1, y: 0 }"
      :transition="{ duration: 0.6, ease: EASE }"
      class="w-full max-w-sm"
    >
      <!-- mobile logo -->
      <div class="mb-8 flex items-center gap-3 lg:hidden">
        <div class="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-brand-500 to-brand-700 text-white shadow-lg shadow-brand-500/25">
          <Cpu :width="20" :height="20" class="shrink-0" />
        </div>
        <div>
          <div class="font-bold tracking-tight">欢迎回来</div>
          <div class="text-xs text-fg-subtle">登录 CS-II 助教系统</div>
        </div>
      </div>

      <div class="hidden lg:block">
        <h2 class="text-2xl font-bold tracking-tight">欢迎回来</h2>
        <p class="mt-1 text-sm text-fg-muted">使用助教或教师账号登录</p>
      </div>

      <motion.div
        v-if="showLastCard && lastUser"
        :initial="{ opacity: 0, y: 12 }"
        :animate="{ opacity: 1, y: 0 }"
        :transition="{ duration: 0.3, ease: EASE }"
        class="mt-6 flex flex-col gap-4"
      >
        <div class="flex items-center gap-3 rounded-2xl border border-line bg-sunken p-4">
          <div class="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-brand-500/10 text-brand-600 dark:text-brand-300">
            <BookOpenCheck v-if="lastUser.role === 'TEACHER'" :width="20" :height="20" class="shrink-0" />
            <ShieldCheck v-else :width="20" :height="20" class="shrink-0" />
          </div>
          <div class="min-w-0 flex-1">
            <div class="truncate text-sm font-semibold text-fg">{{ lastUser.name }}</div>
            <div class="truncate text-xs text-fg-subtle">
              {{ lastIdentifier || '—' }} · {{ lastUser.role === 'TEACHER' ? '教师' : '助教' }}
            </div>
          </div>
          <span class="shrink-0 rounded-full bg-elevated px-2 py-0.5 text-[10px] font-semibold text-fg-subtle">
            上次登录
          </span>
        </div>

        <AppButton
          v-if="lastUser.hasWebauthn"
          type="button"
          full-width
          :is-pending="passkeyLoading"
          @press="passkeyLogin(lastIdentifier || undefined)"
        >
          <template #default="{ isPending }">
            <Fingerprint v-if="!isPending" :width="16" :height="16" class="shrink-0" />
            {{ isPending ? '验证中' : '使用通行密钥继续' }}
          </template>
        </AppButton>

        <AppButton type="button" full-width variant="secondary" @press="continueWithOtherMethod">
          <Ellipsis :width="16" :height="16" class="shrink-0" />
          其它登录方式
        </AppButton>

        <AppButton type="button" full-width variant="secondary" @press="switchAccount">
          <Users :width="16" :height="16" class="shrink-0" />
          切换账号
        </AppButton>
      </motion.div>

      <template v-else>
        <!-- role selector -->
        <div class="mt-6 grid grid-cols-2 gap-2 rounded-2xl border border-line bg-sunken p-1.5">
          <button
            v-for="item in ROLES"
            :key="item.key"
            type="button"
            :class="cn(
              'relative flex flex-col items-center gap-1 rounded-xl py-2.5 text-xs font-semibold transition-colors',
              role === item.key ? 'text-fg' : 'text-fg-subtle hover:text-fg-muted',
            )"
            @click="switchRole(item.key)"
          >
            <motion.span
              v-if="role === item.key"
              layout-id="login-role-pill"
              class="absolute inset-0 rounded-xl bg-elevated shadow-sm ring-1 ring-line"
              :transition="PILL_TRANSITION"
            />
            <component
              :is="item.icon"
              :width="18"
              :height="18"
              :class="cn('shrink-0', 'relative', role === item.key && 'text-brand-600 dark:text-brand-300')"
            />
            <span class="relative">{{ item.label }}</span>
          </button>
        </div>

        <!-- login method selector (TA only) -->
        <div v-if="role === 'TA'" class="mt-4">
          <div class="mb-1.5 text-xs font-semibold text-fg-muted">登录方式</div>
          <div class="grid grid-cols-2 gap-1 rounded-2xl border border-line bg-sunken p-1.5">
            <button
              v-for="item in METHODS"
              :key="item.key"
              type="button"
              :class="cn(
                'relative flex items-center justify-center gap-1.5 rounded-xl py-2 text-xs font-semibold transition-colors',
                method === item.key ? 'text-fg' : 'text-fg-subtle hover:text-fg-muted',
              )"
              @click="switchMethod(item.key)"
            >
              <motion.span
                v-if="method === item.key"
                layout-id="login-method-pill"
                class="absolute inset-0 rounded-xl bg-elevated shadow-sm ring-1 ring-line"
                :transition="PILL_TRANSITION"
              />
              <component
                :is="item.icon"
                :width="16"
                :height="16"
                :class="cn('shrink-0', 'relative', method === item.key && 'text-brand-600 dark:text-brand-300')"
              />
              <span class="relative">{{ item.label }}</span>
            </button>
          </div>
        </div>

        <AnimatePresence mode="wait">
          <motion.form
            :key="role + method"
            :initial="{ opacity: 0, y: 12 }"
            :animate="{ opacity: 1, y: 0 }"
            :exit="{ opacity: 0, y: -8 }"
            :transition="{ duration: 0.3, ease: EASE }"
            class="mt-6 flex flex-col gap-4"
            novalidate
            @submit.prevent="submit"
          >
            <div v-if="isZjuam">
              <label class="mb-1.5 block text-xs font-semibold text-fg-muted">
                统一身份认证账号
              </label>
              <AppInput
                v-model="account"
                full-width
                :color="formErrorField === 'account' ? 'error' : 'neutral'"
                placeholder="请输入统一身份认证账号"
                autocomplete="username"
                autofocus
                required
              />
            </div>
            <div v-else>
              <label class="mb-1.5 block text-xs font-semibold text-fg-muted">
                用户名 / 学号
              </label>
              <AppInput
                v-model="identifier"
                full-width
                :color="formErrorField === 'identifier' ? 'error' : 'neutral'"
                placeholder="请输入用户名或学号"
                autocomplete="username"
                :autofocus="!prefilled"
                required
              />
            </div>
            <div>
              <label class="mb-1.5 block text-xs font-semibold text-fg-muted">密码</label>
              <AppInput
                v-model="password"
                full-width
                type="password"
                :color="formErrorField === 'password' ? 'error' : 'neutral'"
                placeholder="请输入密码"
                autocomplete="current-password"
                :autofocus="prefilled && !isZjuam"
                required
              />
            </div>
            <p v-if="isZjuam" class="text-xs text-fg-subtle">使用学校统一身份认证登录，无需本地账号</p>
            <!-- 校验失败：红色 inline 文案（旧版靠浏览器原生气泡，这里统一自己提示） -->
            <p v-if="formError" class="text-xs text-danger">{{ formError }}</p>
            <AppButton type="submit" full-width :is-pending="loading" class="mt-2">
              <template #default="{ isPending }">
                <ArrowRight v-if="!isPending" :width="16" :height="16" class="shrink-0" />
                {{ isPending ? '登录中' : '登录' }}
              </template>
            </AppButton>
          </motion.form>
        </AnimatePresence>

        <div v-if="role === 'TA'" class="mt-6 flex flex-col gap-4">
          <div class="flex items-center gap-3">
            <div class="h-px flex-1 bg-line" />
            <span class="text-[10px] font-semibold uppercase tracking-widest text-fg-subtle">
              或
            </span>
            <div class="h-px flex-1 bg-line" />
          </div>
          <AppButton
            type="button"
            variant="ghost"
            full-width
            :is-pending="passkeyLoading"
            @press="passkeyLogin(identifier.trim() || undefined)"
          >
            <template #default="{ isPending }">
              <Fingerprint v-if="!isPending" :width="16" :height="16" class="shrink-0" />
              {{ isPending ? '验证中' : '使用通行密钥登录' }}
            </template>
          </AppButton>
        </div>
      </template>

      <p class="mt-6 text-center text-xs text-fg-subtle">
        学生登录暂未开放，敬请期待
      </p>
    </motion.div>
  </div>
</template>
