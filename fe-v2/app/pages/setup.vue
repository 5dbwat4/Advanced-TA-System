<script setup lang="ts">
/**
 * 完善信息页 —— 移植自 `fe/src/pages/Setup.tsx`（161 行）
 *
 * 流程：用户名（必填）+ 密码（选填，≥8 位）+ 通行密钥（选填，本设备绑定），
 * 保存成功后 `navigateTo('/console', { replace: true })`。
 * 触发场景：`middleware/auth.global.ts` 里「已登录但还没有 username」会被弹到这里
 * （对应旧版 `auth.needsSetup`）。
 *
 * ────────────────────────────────────────────────────────────────────────
 * 迁移动作对照
 * ────────────────────────────────────────────────────────────────────────
 * 1) 原生约束校验（`required` / `minLength={password ? 8 : undefined}`）→ 与 LoginPanel
 *    一致：不引 zod，写普通 `validate()` 在提交时统一跑，红色 inline 文案
 *    （`text-xs text-danger`）+ 出错输入框 `:color="'error'"` + `<form novalidate>`。
 * 2) 通行密钥走 `~/lib/passkey` 的 `registerPasskey()`（Phase B 已建好，本文件不再内联实现）。
 * 3) pending 反馈只用 `is-pending`（AppButton 自带 spinner），作用域插槽里只切图标 / 文案。
 * 4) 绑定通行密钥成功后要 `auth.refresh()`：旧版靠 AppShell 的第二个 useEffect 重新拉
 *    `/api/auth/me`，这里改成显式刷新（见 bindPasskey 注释）。
 */
import { motion } from 'motion-v'

import ArrowRight from '~icons/lucide/arrow-right'
import Check from '~icons/lucide/check'
import Fingerprint from '~icons/lucide/fingerprint'
import Plus from '~icons/lucide/plus'

import { registerPasskey } from '~/lib/passkey'

definePageMeta({ layout: 'default' })

/** ease: cubic-bezier(0.16, 1, 0.3, 1)（= main.css 里的 --ease-out-expo） */
const EASE: [number, number, number, number] = [0.16, 1, 0.3, 1]

const auth = useAuthStore()
const toast = useToasts()

const username = ref('')
const password = ref('')
const saving = ref(false)
const bound = ref(auth.user?.hasWebauthn ?? false)
const binding = ref(false)

// 表单校验状态（红色 inline 提示）
const formError = ref('')
const formErrorField = ref<'username' | 'password' | null>(null)

function clearFormError() {
  formError.value = ''
  formErrorField.value = null
}

function setFormError(field: 'username' | 'password', message: string) {
  formError.value = message
  formErrorField.value = field
}

/** 旧版 username 上的 minLength={1} / password 上的 minLength={password ? 8 : undefined} */
function validate() {
  if (!username.value.trim()) {
    setFormError('username', '请填写姓名')
    return
  }
  if (password.value && password.value.length < 8) {
    setFormError('password', '密码至少 8 位')
  }
}

/**
 * 绑定通行密钥：成功要 `auth.refresh()`，让 AppShell 顶栏的班级/权限等派生状态
 * 立即跟着更新（旧版靠 AppShell 第二个 useEffect 重新拉 `/api/auth/me`）。
 */
async function bindPasskey() {
  binding.value = true
  try {
    const ok = await registerPasskey()
    if (!ok) return
    bound.value = true
    toast.success('已绑定通行密钥')
    // 旧版靠 AppShell 的第二个 useEffect 重新拉 /api/auth/me，这里改成显式刷新；
    // 刷新失败不影响「已绑定」的结论，所以单独 try
    try {
      await auth.refresh()
    } catch {
      // ignore
    }
  } catch (error) {
    toast.error(error instanceof Error ? error.message : '绑定失败')
  } finally {
    binding.value = false
  }
}

async function submit() {
  clearFormError()
  validate()
  if (formError.value) return

  saving.value = true
  try {
    await auth.completeSetup({
      username: username.value.trim(),
      password: password.value ? password.value : undefined,
    })
    toast.success('资料已完善')
    await navigateTo('/console', { replace: true })
  } catch (error) {
    toast.error(error instanceof Error ? error.message : '保存失败')
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

    <motion.div
      :initial="{ opacity: 0, y: 24 }"
      :animate="{ opacity: 1, y: 0 }"
      :transition="{ duration: 0.55, ease: EASE }"
      class="w-full max-w-sm"
    >
      <div class="text-center">
        <h1 class="text-2xl font-bold tracking-tight">完善信息</h1>
      </div>

      <form class="mt-6 flex flex-col gap-4" novalidate @submit.prevent="submit">
        <div>
          <label class="mb-1.5 block text-xs font-semibold text-fg-muted">姓名（必填）</label>
          <AppInput
            v-model="username"
            full-width
            :color="formErrorField === 'username' ? 'error' : 'neutral'"
            placeholder="张三"
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

        <div class="flex flex-col gap-4 rounded-2xl border border-line p-4">
          <div>
            <label class="mb-1.5 block text-xs font-semibold text-fg-muted">密码（选填）</label>
            <AppInput
              v-model="password"
              full-width
              type="password"
              :color="formErrorField === 'password' ? 'error' : 'neutral'"
              placeholder="至少 8 位"
              autocomplete="new-password"
            />
          </div>

          <div class="flex flex-col gap-1">
            <div class="flex items-center gap-3">
              <div class="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-500/10 text-brand-600 dark:text-brand-300">
                <Fingerprint :width="18" :height="18" class="shrink-0" />
              </div>
              <span class="flex-1 text-xs font-semibold text-fg-muted">Webauthn（选填）</span>
              <AppButton
                size="sm"
                :variant="bound ? 'ghost' : 'secondary'"
                :is-pending="binding"
                :is-disabled="bound"
                @press="bindPasskey"
              >
                <template #default="{ isPending }">
                  <Check v-if="!isPending && bound" :width="16" :height="16" class="shrink-0" />
                  <Plus v-else-if="!isPending" :width="16" :height="16" class="shrink-0" />
                  {{ bound ? '已绑定' : '立即绑定本设备' }}
                </template>
              </AppButton>
            </div>
            <p class="text-[11px] text-fg-subtle">Touch ID · Face ID · Windows Hello</p>
          </div>
        </div>

        <!-- 校验失败：红色 inline 文案 -->
        <p v-if="formError" class="text-xs text-danger">{{ formError }}</p>

        <AppButton
          type="submit"
          full-width
          size="lg"
          :is-pending="saving"
          class="mt-2 bg-gradient-to-r from-brand-600 to-brand-700 shadow-lg shadow-brand-600/25"
        >
          <template #default="{ isPending }">
            <ArrowRight v-if="!isPending" :width="16" :height="16" class="shrink-0" />
            {{ isPending ? '保存中' : '完成' }}
          </template>
        </AppButton>
      </form>
    </motion.div>
  </div>
</template>
