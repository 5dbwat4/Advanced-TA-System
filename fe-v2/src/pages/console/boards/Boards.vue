<script setup lang="ts">
import { pinyin } from 'pinyin-pro'
import { computed, ref, watch } from 'vue'
import { useRouter } from 'vue-router'

import BulkImportModal from '@/components/boards/BulkImportModal.vue'
import BackLink from '@/components/ui/BackLink.vue'
import Card from '@/components/ui/Card.vue'
import ConfirmDialog from '@/components/ui/ConfirmDialog.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import IconAction from '@/components/ui/IconAction.vue'
import PageHeader from '@/components/ui/PageHeader.vue'
import PendingButton from '@/components/ui/PendingButton.vue'
import SkeletonList from '@/components/ui/SkeletonList.vue'
import {
  borrowDevBoard,
  createDevBoard,
  deleteDevBoard,
  listDevBoards,
  listStudents,
  returnDevBoard,
  updateDevBoard,
  type DevBoard,
  type Student,
} from '@/lib/api'
import { getErrorMessage } from '@/lib/error'
import { useCurrentClassComputed } from '@/lib/store'
import { toast } from '@/lib/toast'
import { UBadge, UButton, UIcon, UInput, UInputMenu, UModal, UTabs } from '@/ui'

type BoardTab = 'all' | 'borrowed' | 'in-stock'

type StudentOption = { label: string; userId: string }

const router = useRouter()
const currentClass = useCurrentClassComputed()
const classId = computed(() => currentClass.value?.id ?? null)

const pinyinCache = new Map<string, { full: string; initials: string }>()

function pinyinIndex(name: string) {
  const cached = pinyinCache.get(name)
  if (cached) return cached
  const options = { toneType: 'none', nonZh: 'consecutive', separator: '' } as const
  const full = pinyin(name, { ...options, type: 'string' }).replace(/\s+/g, '').toLowerCase()
  const initials = pinyin(name, { ...options, type: 'string', pattern: 'first' })
    .replace(/\s+/g, '')
    .toLowerCase()
  const value = { full, initials }
  pinyinCache.set(name, value)
  return value
}

function matchStudent(query: string, student: { name: string; studentId: string }) {
  const raw = query.trim().toLowerCase()
  if (!raw) return true
  const compact = raw.replace(/[\s_-]+/g, '')
  if (compact.length === 0) return true
  if (student.studentId.toLowerCase().includes(compact)) return true
  if (student.name.toLowerCase().includes(raw)) return true
  const { full, initials } = pinyinIndex(student.name)
  return full.includes(compact) || initials.includes(compact)
}

function sortBoards(items: DevBoard[]) {
  return [...items].sort(
    (a, b) =>
      Number(b.borrowed) - Number(a.borrowed) ||
      a.dbId.localeCompare(b.dbId, 'zh-CN', { numeric: true }),
  )
}

const boards = ref<DevBoard[]>([])
const students = ref<Student[]>([])
const loading = ref(true)
const tab = ref<BoardTab>('all')
const importOpen = ref(false)
const studentQuery = ref('')

const tabItems = [
  { label: '状态', value: 'all' },
  { label: '已借出', value: 'borrowed' },
  { label: '在库', value: 'in-stock' },
]

const visibleStudentOptions = computed<StudentOption[]>(() =>
  students.value
    .filter((student) => matchStudent(studentQuery.value, student))
    .map((student) => ({
      label: `${student.name} ${student.studentId}`,
      userId: student.userId,
    })),
)

async function load() {
  const id = classId.value
  if (!id) {
    boards.value = []
    students.value = []
    loading.value = false
    return
  }
  loading.value = true
  try {
    const [boardRes, studentRes] = await Promise.all([listDevBoards(id), listStudents(id)])
    boards.value = boardRes.devBoards
    students.value = studentRes.students
  } catch (error) {
    toast.error(getErrorMessage(error, '加载开发板失败'))
  } finally {
    loading.value = false
  }
}

watch(
  classId,
  () => {
    void load()
  },
  { immediate: true },
)

function upsertBoard(board: DevBoard) {
  const exists = boards.value.some((item) => item.id === board.id)
  boards.value = exists
    ? boards.value.map((item) => (item.id === board.id ? board : item))
    : [...boards.value, board]
}

const formOpen = ref(false)
const editingBoard = ref<DevBoard | null>(null)
const dbIdDraft = ref('')
const boardIdDraft = ref('')
const phoneDraft = ref('')
const userIdDrafts = ref<string[]>([])
const saving = ref(false)

watch(formOpen, (open) => {
  if (!open) editingBoard.value = null
})

function openCreate() {
  editingBoard.value = null
  dbIdDraft.value = ''
  boardIdDraft.value = ''
  phoneDraft.value = ''
  userIdDrafts.value = []
  studentQuery.value = ''
  formOpen.value = true
}

function openEdit(board: DevBoard) {
  editingBoard.value = board
  dbIdDraft.value = board.dbId
  boardIdDraft.value = board.boardId ?? ''
  phoneDraft.value = board.phone ?? ''
  userIdDrafts.value = [...board.userIds]
  studentQuery.value = ''
  formOpen.value = true
}

function onFormStudentsUpdate(value: unknown) {
  userIdDrafts.value = Array.isArray(value) ? value.map(String) : []
}

async function submitForm() {
  const id = classId.value
  if (!id || !dbIdDraft.value.trim()) return
  saving.value = true
  try {
    const body = {
      dbId: dbIdDraft.value.trim(),
      boardId: boardIdDraft.value.trim() || null,
      phone: phoneDraft.value.trim() || null,
      userIds: userIdDrafts.value.map(String),
    }
    if (editingBoard.value) {
      const { devBoard } = await updateDevBoard(editingBoard.value.id, body)
      upsertBoard(devBoard)
      toast.success('已保存')
    } else {
      const { devBoard } = await createDevBoard(id, body)
      upsertBoard(devBoard)
      toast.success('已新建开发板')
    }
    formOpen.value = false
  } catch (error) {
    toast.error(getErrorMessage(error, editingBoard.value ? '保存失败' : '新建失败'))
  } finally {
    saving.value = false
  }
}

const borrowOpen = ref(false)
const borrowTarget = ref<DevBoard | null>(null)
const borrowStuIds = ref<string[]>([])
const borrowPhone = ref('')
const borrowing = ref(false)

watch(borrowOpen, (open) => {
  if (!open) borrowTarget.value = null
})

function openBorrow(board: DevBoard) {
  borrowTarget.value = board
  borrowStuIds.value = [...board.userIds]
  borrowPhone.value = board.phone ?? ''
  studentQuery.value = ''
  borrowOpen.value = true
}

function onBorrowStudentsUpdate(value: unknown) {
  borrowStuIds.value = Array.isArray(value) ? value.map(String) : []
}

async function submitBorrow() {
  if (!borrowTarget.value || borrowStuIds.value.length === 0) return
  borrowing.value = true
  try {
    const { devBoard } = await borrowDevBoard(borrowTarget.value.id, {
      userIds: borrowStuIds.value.map(String),
      phone: borrowPhone.value.trim() || null,
    })
    upsertBoard(devBoard)
    toast.success(`${devBoard.dbId} 已借出`)
    borrowOpen.value = false
  } catch (error) {
    toast.error(getErrorMessage(error, '借出失败'))
  } finally {
    borrowing.value = false
  }
}

const returningId = ref<string | null>(null)

async function doReturn(board: DevBoard) {
  returningId.value = board.id
  try {
    const { devBoard } = await returnDevBoard(board.id)
    upsertBoard(devBoard)
    toast.success(`${devBoard.dbId} 已归还`)
  } catch (error) {
    toast.error(getErrorMessage(error, '归还失败'))
  } finally {
    returningId.value = null
  }
}

const confirmOpen = ref(false)
const confirm = ref<{ kind: 'return' | 'delete'; board: DevBoard } | null>(null)
const deleting = ref(false)

watch(confirmOpen, (open) => {
  if (!open) confirm.value = null
})

function requestReturn(board: DevBoard) {
  confirm.value = { kind: 'return', board }
  confirmOpen.value = true
}

function requestDelete(board: DevBoard) {
  confirm.value = { kind: 'delete', board }
  confirmOpen.value = true
}

const isReturnConfirm = computed(() => confirm.value?.kind === 'return')

const confirmTitle = computed(() => (isReturnConfirm.value ? '归还开发板' : '删除开发板'))
const confirmDescription = computed(() => {
  if (!confirm.value) return ''
  return confirm.value.kind === 'return'
    ? `确定将 ${confirm.value.board.dbId} 标记为已归还吗？`
    : `确定删除 ${confirm.value.board.dbId} 吗？删除后无法恢复。`
})
const confirmLoading = computed(() =>
  isReturnConfirm.value ? returningId.value === confirm.value?.board.id : deleting.value,
)

async function submitConfirm() {
  if (!confirm.value) return
  if (confirm.value.kind === 'return') {
    await doReturn(confirm.value.board)
    confirmOpen.value = false
    return
  }
  const board = confirm.value.board
  deleting.value = true
  try {
    await deleteDevBoard(board.id)
    boards.value = boards.value.filter((item) => item.id !== board.id)
    toast.success('已删除')
    confirmOpen.value = false
  } catch (error) {
    toast.error(getErrorMessage(error, '删除失败'))
  } finally {
    deleting.value = false
  }
}

const sortedBoards = computed(() => sortBoards(boards.value))

const visibleBoards = computed(() =>
  sortedBoards.value.filter((board) =>
    tab.value === 'all' ? true : tab.value === 'borrowed' ? board.borrowed : !board.borrowed,
  ),
)

const borrowedCount = computed(() => boards.value.filter((board) => board.borrowed).length)
</script>

<template>
  <div class="mx-auto max-w-6xl">
    <BackLink to="/console/courses/settings">返回课程设置</BackLink>

    <PageHeader title="开发板管理">
      <template #subtitle>
        <span class="tabular">{{ borrowedCount }}</span> /
        <span class="tabular">{{ boards.length }}</span> 已借出
      </template>
      <template #actions>
        <UButton color="secondary" variant="soft" :disabled="!classId" @click="importOpen = true">
          <UIcon name="i-lucide-upload" class="h-4 w-4 shrink-0" />
          批量导入
        </UButton>
        <UButton color="secondary" variant="soft" @click="openCreate">
          <UIcon name="i-lucide-plus" class="h-4 w-4 shrink-0" />
          新建开发板
        </UButton>
        <UButton color="primary" @click="router.push('/console/boards/scan')">
          <UIcon name="i-lucide-scan-line" class="h-4 w-4 shrink-0" />
          扫码
        </UButton>
      </template>
    </PageHeader>

    <EmptyState
      v-if="!classId"
      icon="i-lucide-school"
      title="未选择课程"
      hint="请先在右上角选择或绑定一个课程"
    />

    <template v-else>
      <div class="mb-4 flex flex-wrap items-center justify-between gap-3">
        <UTabs
          :model-value="tab"
          :items="tabItems"
          variant="pill"
          :content="false"
          class="w-fit"
          @update:model-value="(value: string | number) => (tab = String(value) as BoardTab)"
        />
        <div class="tabular text-sm text-fg-muted">
          {{ visibleBoards.length }} / {{ boards.length }}
        </div>
      </div>

      <SkeletonList v-if="loading" :rows="6" class="h-48 rounded-2xl" />

      <EmptyState
        v-else-if="visibleBoards.length === 0"
        icon="i-lucide-circuit-board"
        :title="boards.length === 0 ? '暂无开发板' : '暂无匹配的开发板'"
        :hint="boards.length === 0 ? '点击右上角「新建开发板」开始登记' : undefined"
      />

      <div v-else class="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <Card
          v-for="(board, index) in visibleBoards"
          :key="board.id"
          :index="Math.min(index, 8)"
          class="flex flex-col gap-3"
        >
          <div class="flex items-start justify-between gap-3">
            <div class="min-w-0">
              <div class="truncate text-xl font-bold tracking-tight">{{ board.dbId }}</div>
              <div class="tabular mt-0.5 truncate text-sm text-fg-muted">
                {{ board.boardId || '—' }}
              </div>
            </div>
            <UBadge :color="board.borrowed ? 'warning' : 'success'" variant="soft" size="sm">
              {{ board.borrowed ? '已借出' : '在库' }}
            </UBadge>
          </div>

          <div class="flex flex-col gap-1.5 text-sm">
            <div class="flex items-center gap-2">
              <UIcon name="i-lucide-user-round" class="h-[15px] w-[15px] shrink-0 text-fg-subtle" />
              <span
                :class="
                  board.students.length === 0 ? 'truncate text-fg-subtle' : 'truncate'
                "
              >
                {{
                  board.students.length > 0
                    ? board.students.map((student) => student.name).join('、')
                    : '未登记合用学生'
                }}
              </span>
            </div>
            <div class="flex items-center gap-2">
              <UIcon name="i-lucide-phone" class="h-[15px] w-[15px] shrink-0 text-fg-subtle" />
              <span
                :class="board.phone ? 'tabular truncate' : 'tabular truncate text-fg-subtle'"
              >
                {{ board.phone || '未登记联系电话' }}
              </span>
            </div>
          </div>

          <div class="mt-auto flex items-center gap-2 pt-1">
            <PendingButton
              v-if="board.borrowed"
              color="success"
              variant="soft"
              class="flex-1"
              :loading="returningId === board.id"
              @click="requestReturn(board)"
            >
              归还
            </PendingButton>
            <UButton
              v-else
              color="primary"
              variant="soft"
              class="flex-1"
              @click="openBorrow(board)"
            >
              借出
            </UButton>
            <IconAction label="编辑" variant="soft" @click="openEdit(board)">
              <UIcon name="i-lucide-pen" class="h-[15px] w-[15px] shrink-0" />
            </IconAction>
            <IconAction label="删除" variant="soft" @click="requestDelete(board)">
              <UIcon name="i-lucide-trash-2" class="h-[15px] w-[15px] shrink-0" />
            </IconAction>
          </div>
        </Card>
      </div>
    </template>

    <UModal
      v-model:open="formOpen"
      :title="editingBoard ? '编辑开发板' : '新建开发板'"
      :dismissible="!saving"
      :ui="{ content: 'sm:max-w-lg' }"
    >
      <template #body>
        <div class="flex flex-col gap-4">
          <div class="flex flex-col gap-1.5">
            <div class="text-xs font-semibold text-fg-muted">DB id</div>
            <UInput
              v-model="dbIdDraft"
              class="w-full"
              maxlength="64"
              placeholder="如：DB180BD"
              aria-label="DB id"
              autofocus
            />
          </div>
          <div class="flex flex-col gap-1.5">
            <div class="text-xs font-semibold text-fg-muted">id</div>
            <UInput
              v-model="boardIdDraft"
              class="w-full"
              maxlength="64"
              placeholder="如：21025306"
              aria-label="id"
            />
          </div>
          <div class="flex flex-col gap-1.5">
            <div class="text-xs font-semibold text-fg-muted">联系电话</div>
            <UInput
              v-model="phoneDraft"
              class="w-full"
              maxlength="32"
              placeholder="如：18989469811"
              aria-label="联系电话"
            />
          </div>
          <div class="flex flex-col gap-1.5">
            <div class="text-xs font-semibold text-fg-muted">合用学生</div>
            <UInputMenu
              :model-value="userIdDrafts"
              v-model:search-term="studentQuery"
              :items="visibleStudentOptions"
              multiple
              value-key="userId"
              ignore-filter
              placeholder="搜索并选择学生"
              class="w-full"
              @update:model-value="onFormStudentsUpdate"
            >
              <template #empty>没有匹配的学生</template>
            </UInputMenu>
          </div>
        </div>
      </template>
      <template #footer>
        <UButton color="neutral" variant="soft" @click="formOpen = false">取消</UButton>
        <PendingButton
          color="primary"
          :icon="editingBoard ? 'i-lucide-pen' : 'i-lucide-plus'"
          :loading="saving"
          loading-label="保存中"
          :disabled="!dbIdDraft.trim()"
          @click="submitForm"
        >
          {{ editingBoard ? '保存' : '新建' }}
        </PendingButton>
      </template>
    </UModal>

    <UModal
      v-model:open="borrowOpen"
      title="借出开发板"
      :dismissible="!borrowing"
      :ui="{ content: 'sm:max-w-lg' }"
    >
      <template #body>
        <div class="flex flex-col gap-4">
          <div class="text-sm text-fg-muted">
            DB id：
            <span class="font-semibold text-fg">{{ borrowTarget?.dbId ?? '—' }}</span>
          </div>
          <div class="flex flex-col gap-1.5">
            <div class="text-xs font-semibold text-fg-muted">合用学生</div>
            <UInputMenu
              :model-value="borrowStuIds"
              v-model:search-term="studentQuery"
              :items="visibleStudentOptions"
              multiple
              value-key="userId"
              ignore-filter
              placeholder="搜索并选择学生"
              class="w-full"
              @update:model-value="onBorrowStudentsUpdate"
            >
              <template #empty>没有匹配的学生</template>
            </UInputMenu>
          </div>
          <div class="flex flex-col gap-1.5">
            <div class="text-xs font-semibold text-fg-muted">联系电话</div>
            <UInput
              v-model="borrowPhone"
              class="w-full"
              maxlength="32"
              placeholder="如：18989469811"
              aria-label="联系电话"
            />
          </div>
        </div>
      </template>
      <template #footer>
        <UButton color="neutral" variant="soft" @click="borrowOpen = false">取消</UButton>
        <PendingButton
          color="primary"
          :loading="borrowing"
          loading-label="借出中"
          :disabled="borrowStuIds.length === 0"
          @click="submitBorrow"
        >
          确认借出
        </PendingButton>
      </template>
    </UModal>

    <ConfirmDialog
      v-model:open="confirmOpen"
      :icon="isReturnConfirm ? 'i-lucide-rotate-ccw' : 'i-lucide-trash-2'"
      :danger="!isReturnConfirm"
      :title="confirmTitle"
      :description="confirmDescription"
      :confirm-text="isReturnConfirm ? '归还' : '删除'"
      :loading="confirmLoading"
      @confirm="submitConfirm"
    />

    <BulkImportModal v-model:open="importOpen" :class-id="classId" @imported="load" />
  </div>
</template>
