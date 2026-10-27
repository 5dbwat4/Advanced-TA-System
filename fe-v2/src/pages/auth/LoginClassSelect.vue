<script setup lang="ts">
import { ref, watch } from 'vue'
import { useRouter } from 'vue-router'

import Logo from '@/components/ui/Logo.vue'
import PendingButton from '@/components/ui/PendingButton.vue'
import { ApiError, type ClassSelectCourse, type User } from '@/lib/api'
import { useAuthStore } from '@/lib/auth'
import { getErrorMessage } from '@/lib/error'
import { homePathFor } from '@/lib/student-route'
import { useAppStore } from '@/lib/store'
import { toast } from '@/lib/toast'
import { cn } from '@/lib/utils'
import { UButton, UIcon, UModal } from '@/ui'

type ClassSelectState = {
  selectionToken: string
  courses: ClassSelectCourse[]
  from?: string
}

type ClassType = '2026-sys1' | '2026-sys2' | '2026-sys3'

const TYPE_OPTIONS: Array<{ value: ClassType; label: string }> = [
  { value: '2026-sys1', label: '系统I' },
  { value: '2026-sys2', label: '系统II' },
  { value: '2026-sys3', label: '系统III' },
]

const router = useRouter()
const auth = useAuthStore()
const app = useAppStore()

const state = (window.history.state as ClassSelectState | null) ?? null
const ready = Boolean(state?.selectionToken)
if (!ready) void router.replace({ path: '/login', replace: true })

const selectionToken = state?.selectionToken ?? ''
const courses = state?.courses ?? []
const from = state?.from

const pendingKey = ref<string | null>(null)
const typeCourse = ref<ClassSelectCourse | null>(null)
const type = ref<ClassType>('2026-sys1')
const typeOpen = ref(false)

watch(typeOpen, (open) => {
  if (!open) typeCourse.value = null
})

function finish(user: User) {
  if (!user.username) {
    app.setOnboardingInfo({
      source: 'zjuam',
      identifier: user.studentId,
      className: user.classes[0]?.name ?? null,
      role: user.role,
    })
    app.setOnboarding(true)
  }
  toastSuccess(user)
  const dest = from ?? homePathFor(user)
  void router.replace(dest)
}

function toastSuccess(user: User) {
  toast.success(user.username ? `欢迎回来，${user.name}` : '班级已绑定，请完善信息')
}

async function choose(course: ClassSelectCourse, classType?: ClassType) {
  pendingKey.value = course.key
  try {
    const user = await auth.selectClass(selectionToken, course.key, classType)
    finish(user)
  } catch (error) {
    toast.error(getErrorMessage(error, '登录失败，请重新登录'))
    if (error instanceof ApiError && error.status === 401) {
      void router.replace('/login')
    }
  } finally {
    pendingKey.value = null
  }
}

function onCourse(course: ClassSelectCourse) {
  if (course.registered) {
    void choose(course)
    return
  }
  typeCourse.value = course
  typeOpen.value = true
}

function confirmCreate() {
  if (!typeCourse.value) return
  void choose(typeCourse.value, type.value)
}
</script>

<template>
  <div v-if="ready" class="diagonal-bg flex min-h-screen items-center justify-center px-5 py-10">
    <div class="w-full max-w-md">
      <div class="mb-6 flex flex-col items-center gap-3 text-center">
        <Logo :size="40" />
        <div>
          <h1 class="text-lg font-bold tracking-tight">选择你的班级</h1>
          <p class="mt-1 text-xs text-fg-subtle">请选择本次要进入的班级</p>
        </div>
      </div>

      <div
        v-if="courses.length === 0"
        class="rounded-2xl border border-dashed border-danger/40 py-10 text-center text-sm text-danger"
      >
        你目前没有可选择的班级，请联系课程教师。
      </div>
      <div v-else class="flex flex-col gap-2">
        <UButton
          v-for="course in courses"
          :key="course.key"
          color="neutral"
          variant="soft"
          block
          class="h-auto justify-start px-4 py-3"
          :disabled="pendingKey !== null"
          @click="onCourse(course)"
        >
          <span class="flex w-full items-center gap-3 text-left">
            <span
              class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-500/10 text-brand-600 dark:text-brand-300"
            >
              <UIcon
                :name="course.registered ? 'i-lucide-shield-check' : 'i-lucide-plus'"
                class="size-[18px] shrink-0"
              />
            </span>
            <span class="min-w-0 flex-1">
              <span class="block truncate text-sm font-semibold text-fg">{{ course.name }}</span>
              <span class="block truncate text-xs text-fg-subtle">
                {{ course.registered ? '已录入系统' : '未录入 · 选择后创建班级' }}
              </span>
            </span>
            <span v-if="pendingKey === course.key" class="text-xs text-fg-subtle">进入中…</span>
          </span>
        </UButton>
      </div>

      <UButton
        color="neutral"
        variant="ghost"
        block
        class="mt-4"
        @click="router.replace('/login')"
      >
        返回登录
      </UButton>
    </div>

    <UModal v-if="typeCourse" v-model:open="typeOpen" title="创建新班级">
      <template #body>
        <div class="flex flex-col gap-4">
          <p class="text-xs leading-relaxed text-fg-subtle">
            “{{ typeCourse?.name }}”尚未录入系统。请选择班级类型，确认后会创建班级并将你绑定为本班助教。
          </p>
          <div class="flex flex-wrap gap-2">
            <button
              v-for="option in TYPE_OPTIONS"
              :key="option.value"
              type="button"
              :aria-pressed="type === option.value"
              :class="
                cn(
                  'rounded-xl border px-4 py-2.5 text-sm font-semibold transition-colors',
                  type === option.value
                    ? 'border-brand-500/60 bg-brand-500/10 text-brand-600 dark:text-brand-300'
                    : 'border-line bg-sunken text-fg-muted hover:border-brand-500/40',
                )
              "
              @click="type = option.value"
            >
              {{ option.label }}
            </button>
          </div>
        </div>
      </template>
      <template #footer>
        <div class="flex w-full justify-end gap-2">
          <UButton color="neutral" variant="soft" @click="typeOpen = false">取消</UButton>
          <PendingButton
            block
            :loading="typeCourse ? pendingKey === typeCourse.key : false"
            @click="confirmCreate"
          >
            创建并进入
          </PendingButton>
        </div>
      </template>
    </UModal>
  </div>
</template>
