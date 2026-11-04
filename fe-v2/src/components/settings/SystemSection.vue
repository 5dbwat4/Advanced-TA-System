<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'

import Card from '@/components/ui/Card.vue'
import PendingButton from '@/components/ui/PendingButton.vue'
import Spinner from '@/components/ui/Spinner.vue'
import {
  addTa,
  apiFetch,
  listClasses,
  listTas,
  type ClassInfo,
  type Course,
  type Ta,
} from '@/lib/api'
import { useAuthStore } from '@/lib/auth'
import { getErrorMessage } from '@/lib/error'
import { toast } from '@/lib/toast'
import { cn } from '@/lib/utils'
import { getZjuamCredential } from '@/lib/zjuam'
import { UBadge, UButton, UIcon, UInput, UModal } from '@/ui'

const props = withDefaults(
  defineProps<{
    index?: number
  }>(),
  {
    index: 0,
  },
)

type CourseRow = {
  course: Course
  existingClass: ClassInfo | undefined
  joined: boolean
  adding: boolean
  clickable: boolean
  bindToken: string | undefined
}

const auth = useAuthStore()
const router = useRouter()

const courses = ref<Course[] | null>(null)
const loading = ref(false)
const error = ref<string | null>(null)
const tas = ref<Ta[] | null>(null)
const taLoading = ref(false)
const taError = ref<string | null>(null)
const taStudentId = ref('')
const taAdding = ref(false)
const classes = ref<ClassInfo[]>([])
const bindTokens = ref<Record<string, string>>({})
const courseOpen = ref(false)
const taOpen = ref(false)

const courseRows = computed<CourseRow[]>(() =>
  (courses.value ?? []).map((course) => {
    const existingClass = classes.value.find(
      (item) => String(item.xzzdClassId) === String(course.id),
    )
    const joined =
      existingClass !== undefined &&
      (auth.user?.classes.some((item) => item.id === existingClass.id) ?? false)
    const bindToken = bindTokens.value[String(course.id)]
    const adding = existingClass === undefined && course.isInstructor && Boolean(bindToken)
    const clickable =
      Boolean(bindToken) && (adding || (existingClass !== undefined && !joined))
    return { course, existingClass, joined, adding, clickable, bindToken }
  }),
)

async function fetchCourses() {
  loading.value = true
  error.value = null
  try {
    const local = getZjuamCredential()
    const body = local ? { account: local.account, password: local.password } : {}
    const data = await apiFetch<{ courses: Course[]; bindTokens?: Record<string, string> }>(
      '/api/auth/zjuam/courses',
      {
        method: 'POST',
        body: JSON.stringify(body),
      },
    )
    courses.value = data.courses
    bindTokens.value = data.bindTokens ?? {}
  } catch (err) {
    const message = getErrorMessage(err, '获取课程失败')
    error.value = message
    toast.error(message)
  } finally {
    loading.value = false
  }
}

async function fetchTas() {
  taLoading.value = true
  taError.value = null
  try {
    tas.value = await listTas()
  } catch (err) {
    const message = getErrorMessage(err, '获取助教失败')
    taError.value = message
    toast.error(message)
  } finally {
    taLoading.value = false
  }
}

async function fetchClasses() {
  try {
    classes.value = await listClasses()
  } catch (err) {
    toast.error(getErrorMessage(err, '获取课程列表失败'))
  }
}

function openCourseModal() {
  courseOpen.value = true
  void fetchClasses()
}

function openTaModal() {
  taOpen.value = true
  void fetchTas()
}

function openNewAccount(row: CourseRow) {
  if (!row.bindToken) {
    toast.error('没有该课程的绑定授权，请确认你是任课教师')
    return
  }
  const className = row.existingClass?.name ?? row.course.displayName ?? row.course.name
  if (row.existingClass) {
    void router.push({
      path: '/console/courses/new-account',
      state: { bindToken: row.bindToken, classId: row.existingClass.id, className },
    })
    return
  }
  void router.push({
    path: '/console/courses/new',
    state: {
      bindToken: row.bindToken,
      courseId: String(row.course.id),
      courseName: className,
    },
  })
}

async function submitTa() {
  if (taAdding.value) return
  const studentId = taStudentId.value.trim()
  if (!studentId) return
  taAdding.value = true
  try {
    await addTa(studentId)
    toast.success('已添加新助教')
    taStudentId.value = ''
    await fetchTas()
  } catch (err) {
    toast.error(getErrorMessage(err, '添加失败'))
  } finally {
    taAdding.value = false
  }
}

function goAddUser() {
  void router.push('/console/courses/users/new')
}
</script>

<template>
  <Card :index="props.index" class="flex flex-col gap-4 border-danger/50">
    <div class="flex items-center gap-2">
      <UIcon name="i-lucide-settings-2" class="h-4 w-4 shrink-0 text-danger" />
      <span class="text-sm font-bold text-danger">系统设置</span>
    </div>

    <div
      class="flex w-full cursor-pointer items-center gap-3 rounded-xl border border-line bg-sunken px-4 py-3 text-left transition-colors hover:border-danger/40"
      role="button"
      tabindex="0"
      @click="openCourseModal"
      @keydown.enter="openCourseModal"
    >
      <div class="flex h-10 w-10 items-center justify-center rounded-xl bg-danger/10 text-danger">
        <UIcon name="i-lucide-graduation-cap" class="h-4.5 w-4.5 shrink-0" />
      </div>
      <div class="min-w-0 flex-1">
        <div class="text-sm font-semibold">助教绑定课程</div>
        <div class="truncate text-xs text-fg-subtle">
          绑定新班级时会创建独立账号，当前账号保留在原班级
        </div>
      </div>
      <UIcon name="i-lucide-chevron-right" class="h-4.5 w-4.5 shrink-0 text-fg-subtle" />
    </div>

    <button
      type="button"
      class="flex w-full items-center gap-3 rounded-xl border border-line bg-sunken px-4 py-3 text-left transition-colors hover:border-danger/40"
      @click="goAddUser"
    >
      <div class="flex h-10 w-10 items-center justify-center rounded-xl bg-danger/10 text-danger">
        <UIcon name="i-lucide-user-plus" class="h-4.5 w-4.5 shrink-0" />
      </div>
      <div class="min-w-0 flex-1">
        <div class="text-sm font-semibold">为本课程添加用户</div>
        <div class="truncate text-xs text-fg-subtle">按学工号添加，或生成邀请链接</div>
      </div>
      <UIcon name="i-lucide-chevron-right" class="h-4.5 w-4.5 shrink-0 text-fg-subtle" />
    </button>

    <div
      class="flex w-full cursor-pointer items-center gap-3 rounded-xl border border-line bg-sunken px-4 py-3 text-left transition-colors hover:border-danger/40"
      role="button"
      tabindex="0"
      @click="openTaModal"
      @keydown.enter="openTaModal"
    >
      <div class="flex h-10 w-10 items-center justify-center rounded-xl bg-danger/10 text-danger">
        <UIcon name="i-lucide-user-plus" class="h-4.5 w-4.5 shrink-0" />
      </div>
      <div class="min-w-0 flex-1">
        <div class="text-sm font-semibold">添加新助教</div>
        <div class="truncate text-xs text-fg-subtle">
          输入助教学号，将其加入系统；新助教需等待首次登录后解封
        </div>
      </div>
      <UIcon name="i-lucide-chevron-right" class="h-4.5 w-4.5 shrink-0 text-fg-subtle" />
    </div>

    <UModal
      v-model:open="courseOpen"
      title="助教绑定课程"
      description="将使用你保存的浙大统一身份认证账号登录“学在浙大”，获取你的课程列表。每个班级使用独立账号，绑定后会自动切换到新账号。"
    >
      <template #body>
        <div class="flex flex-col gap-4">
          <div
            v-if="error"
            class="rounded-xl border border-dashed border-danger/40 py-10 text-center text-xs text-danger"
          >
            {{ error }}
          </div>
          <div
            v-else-if="loading"
            class="flex flex-col items-center gap-2 rounded-xl border border-dashed border-line py-10 text-center"
          >
            <Spinner size="sm" />
            <div class="text-xs text-fg-subtle">正在登录“学在浙大”并获取课程…</div>
          </div>
          <div
            v-else-if="courses === null"
            class="flex flex-col items-center gap-2 rounded-xl border border-dashed border-line py-10 text-center"
          >
            <UIcon name="i-lucide-graduation-cap" class="h-6 w-6 shrink-0 text-fg-subtle" />
            <div class="text-sm font-semibold text-fg-muted">尚未获取课程</div>
            <div class="text-xs text-fg-subtle">点击下方按钮开始获取</div>
          </div>
          <div
            v-else-if="courses.length === 0"
            class="rounded-xl border border-dashed border-line py-10 text-center text-xs text-fg-subtle"
          >
            未获取到课程
          </div>
          <div v-else class="flex max-h-80 flex-col gap-2 overflow-auto">
            <div
              v-for="row in courseRows"
              :key="row.course.id"
              :class="
                cn(
                  'flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left',
                  row.existingClass
                    ? 'border-brand-500/40 bg-brand-500/5'
                    : 'border-line bg-sunken',
                  row.clickable
                    ? 'cursor-pointer transition-colors hover:border-brand-500/40 hover:bg-brand-500/5'
                    : '',
                )
              "
              :role="row.clickable ? 'button' : undefined"
              :tabindex="row.clickable ? 0 : undefined"
              @click="row.clickable && openNewAccount(row)"
              @keydown.enter="row.clickable && openNewAccount(row)"
            >
              <div class="min-w-0 flex-1">
                <div class="truncate text-sm font-semibold">{{ row.course.name }}</div>
                <div v-if="row.course.courseCode" class="tabular truncate text-xs text-fg-subtle">
                  {{ row.course.courseCode }}
                </div>
              </div>
              <UBadge v-if="row.existingClass" color="primary" variant="subtle" size="sm">
                已录入
              </UBadge>
              <UBadge
                v-if="row.existingClass && !row.joined && !row.bindToken"
                color="error"
                variant="subtle"
                size="sm"
              >
                无授权
              </UBadge>
              <UBadge v-if="row.joined" color="warning" variant="subtle" size="sm">已加入</UBadge>
              <template v-if="row.adding">
                <UBadge color="primary" variant="subtle" size="sm">任课</UBadge>
                <UBadge color="primary" variant="subtle" size="sm">点击添加</UBadge>
              </template>
              <UIcon
                v-if="row.clickable"
                name="i-lucide-chevron-right"
                class="h-4 w-4 shrink-0 text-fg-subtle"
              />
              <span class="tabular text-[11px] text-fg-subtle">{{ row.course.id }}</span>
            </div>
          </div>
          <PendingButton :loading="loading" @click="fetchCourses">开始获取课程</PendingButton>
        </div>
      </template>
    </UModal>

    <UModal
      v-model:open="taOpen"
      title="添加新助教"
      description="输入助教的学号将其加入系统，新助教需等待首次登录后解封。"
    >
      <template #body>
        <div class="flex flex-col gap-4">
          <div class="flex items-center gap-2">
            <UInput
              v-model="taStudentId"
              class="flex-1"
              type="text"
              placeholder="请输入学号"
              inputmode="numeric"
              autocomplete="off"
              aria-label="助教学号"
            />
            <PendingButton
              :disabled="taStudentId.trim().length === 0"
              :loading="taAdding"
              @click="submitTa"
            >
              添加
            </PendingButton>
          </div>
          <div
            v-if="taError"
            class="rounded-xl border border-dashed border-danger/40 py-8 text-center text-xs text-danger"
          >
            {{ taError }}
          </div>
          <div
            v-else-if="taLoading"
            class="flex flex-col items-center gap-2 rounded-xl border border-dashed border-line py-8 text-center"
          >
            <Spinner size="sm" />
            <div class="text-xs text-fg-subtle">正在加载助教列表…</div>
          </div>
          <div
            v-else-if="tas === null || tas.length === 0"
            class="rounded-xl border border-dashed border-line py-8 text-center text-xs text-fg-subtle"
          >
            暂无助教
          </div>
          <div v-else class="flex max-h-80 flex-col gap-2 overflow-auto">
            <div
              v-for="ta in tas"
              :key="ta.id"
              class="flex items-center gap-3 rounded-xl border border-line bg-sunken px-3 py-2.5"
            >
              <div class="min-w-0 flex-1">
                <div v-if="ta.activated" class="truncate text-sm font-semibold">{{ ta.name }}</div>
                <div class="tabular truncate text-xs text-fg-subtle">{{ ta.studentId }}</div>
              </div>
              <div class="flex shrink-0 flex-col items-end gap-1">
                <UBadge :color="ta.activated ? 'primary' : 'warning'" variant="subtle" size="sm">
                  {{ ta.activated ? '已激活' : '未解封' }}
                </UBadge>
                <span class="max-w-32 truncate text-[11px] text-fg-subtle">
                  {{ ta.classes.length ? ta.classes.map((item) => item.name).join('、') : '未绑定' }}
                </span>
              </div>
            </div>
          </div>
        </div>
      </template>
    </UModal>
  </Card>
</template>
