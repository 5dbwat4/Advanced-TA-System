<script setup lang="ts">
import { pinyin } from 'pinyin-pro'
import { computed, ref, watch } from 'vue'

import BackLink from '@/components/ui/BackLink.vue'
import ConfirmDialog from '@/components/ui/ConfirmDialog.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import IconAction from '@/components/ui/IconAction.vue'
import PageHeader from '@/components/ui/PageHeader.vue'
import PendingButton from '@/components/ui/PendingButton.vue'
import SearchInput from '@/components/ui/SearchInput.vue'
import SkeletonList from '@/components/ui/SkeletonList.vue'
import {
  addCheckpointStudent,
  deleteCheckpointStudents,
  fetchCheckpointClaims,
  listStudents,
  type CheckpointClaim,
} from '@/lib/api'
import { getErrorMessage } from '@/lib/error'
import { formatLocaleDateTime } from '@/lib/format'
import { useAsyncData } from '@/lib/request'
import { useCurrentClassComputed } from '@/lib/store'
import { toast } from '@/lib/toast'
import { UBadge, UButton, UCheckbox, UIcon, UInputMenu, UModal } from '@/ui'

type StudentOption = { id: string; name: string; studentId: string }
type DeleteTarget = { kind: 'single'; target: CheckpointClaim } | { kind: 'bulk' }

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

function matchStudent(query: string, student: { name: string; studentId: string }): boolean {
  const raw = query.trim().toLowerCase()
  if (!raw) return true
  const compact = raw.replace(/[\s_-]+/g, '')
  if (!compact) return true
  if (student.studentId.toLowerCase().includes(compact)) return true
  if (student.name.toLowerCase().includes(raw)) return true
  const { full, initials } = pinyinIndex(student.name)
  return full.includes(compact) || initials.includes(compact)
}

const currentClass = useCurrentClassComputed()
const classId = computed(() => currentClass.value?.id ?? null)

const editing = ref(false)
const selected = ref<Set<string>>(new Set())
const query = ref('')
const studentQuery = ref('')

const claims = ref<CheckpointClaim[]>([])
const loading = ref(true)

const {
  data: studentData,
  loading: studentsLoading,
  error: studentsError,
} = useAsyncData(
  () => (classId.value ? listStudents(classId.value) : Promise.resolve({ students: [] })),
  [classId],
)

watch(studentsError, (message) => {
  if (message) toast.error(message)
})

const students = computed(() => studentData.value?.students ?? [])

async function reload() {
  if (!classId.value) {
    claims.value = []
    loading.value = false
    return
  }
  loading.value = true
  try {
    const data = await fetchCheckpointClaims(classId.value)
    claims.value = data.claims
  } catch (error) {
    toast.error(getErrorMessage(error, '加载 Checkpoint 名单失败'))
  } finally {
    loading.value = false
  }
}

watch(classId, () => void reload(), { immediate: true })

const classStudents = computed(() =>
  students.value.filter((student) => student.classId === classId.value),
)

const rows = computed(() =>
  claims.value.filter((item) => matchStudent(query.value, item.student ?? { name: '', studentId: '' })),
)

const candidates = computed<StudentOption[]>(() => {
  const claimIds = new Set(claims.value.map((item) => item.userId))
  return classStudents.value
    .filter((student) => !claimIds.has(student.userId))
    .map((student) => ({
      id: student.userId,
      name: student.name,
      studentId: student.studentId,
    }))
})

const visibleCandidates = computed(() =>
  candidates.value.filter((item) => matchStudent(studentQuery.value, item)),
)

const allSelected = computed(
  () => rows.value.length > 0 && rows.value.every((row) => selected.value.has(row.id)),
)
const someSelected = computed(() => rows.value.some((row) => selected.value.has(row.id)))
const headerChecked = computed(() => {
  if (allSelected.value) return true
  if (someSelected.value) return 'indeterminate' as const
  return false
})

function toggleRow(id: string, checked: boolean) {
  const next = new Set(selected.value)
  if (checked) next.add(id)
  else next.delete(id)
  selected.value = next
}

function toggleAll(checked: boolean) {
  const next = new Set(selected.value)
  for (const row of rows.value) {
    if (checked) next.add(row.id)
    else next.delete(row.id)
  }
  selected.value = next
}

function selectAll() {
  selected.value = new Set(rows.value.map((row) => row.id))
}

function invertSelection() {
  const next = new Set(selected.value)
  for (const row of rows.value) {
    if (next.has(row.id)) next.delete(row.id)
    else next.add(row.id)
  }
  selected.value = next
}

function startEditing() {
  editing.value = true
  selected.value = new Set()
}

function finishEditing() {
  editing.value = false
  selected.value = new Set()
}

const addOpen = ref(false)
const addStuId = ref<string | undefined>(undefined)
const adding = ref(false)

watch(addOpen, (open) => {
  if (open) {
    addStuId.value = undefined
    studentQuery.value = ''
  }
})

async function submitAdd() {
  if (!classId.value || addStuId.value == null) return
  adding.value = true
  try {
    await addCheckpointStudent(classId.value, { userId: String(addStuId.value) })
    await reload()
    toast.success('已加入 Checkpoint 名单')
    addOpen.value = false
  } catch (error) {
    toast.error(getErrorMessage(error, '添加失败'))
  } finally {
    adding.value = false
  }
}

const confirmOpen = ref(false)
const confirmTarget = ref<DeleteTarget | null>(null)
const deleting = ref(false)

watch(confirmOpen, (open) => {
  if (!open) confirmTarget.value = null
})

const confirmTitle = computed(() =>
  confirmTarget.value?.kind === 'single' ? '移除 Checkpoint 学生' : '移除所选学生',
)

const confirmDescription = computed(() => {
  if (confirmTarget.value?.kind === 'single') {
    return `确定将 ${confirmTarget.value.target.student?.name ?? '该学生'} 从 Checkpoint 名单中移除吗？`
  }
  return `确定将选中的 ${selected.value.size} 名学生从 Checkpoint 名单中移除吗？`
})

function openDeleteSingle(target: CheckpointClaim) {
  confirmTarget.value = { kind: 'single', target }
  confirmOpen.value = true
}

function openDeleteBulk() {
  confirmTarget.value = { kind: 'bulk' }
  confirmOpen.value = true
}

async function submitDelete() {
  if (!classId.value || !confirmTarget.value) return
  const ids =
    confirmTarget.value.kind === 'single'
      ? [confirmTarget.value.target.id]
      : Array.from(selected.value)
  if (ids.length === 0) return
  deleting.value = true
  try {
    await deleteCheckpointStudents(classId.value, ids)
    if (confirmTarget.value.kind === 'bulk') {
      const next = new Set(selected.value)
      for (const id of ids) next.delete(id)
      selected.value = next
    }
    await reload()
    toast.success('已移除')
    confirmOpen.value = false
  } catch (error) {
    toast.error(getErrorMessage(error, '删除失败'))
  } finally {
    deleting.value = false
  }
}
</script>

<template>
  <div class="mx-auto max-w-6xl">
    <BackLink to="/console/courses/settings">返回课程设置</BackLink>

    <PageHeader title="「Checkpoint」名单" />

    <EmptyState
      v-if="!classId"
      icon="i-lucide-school"
      title="未选择课程"
      hint="请先在右上角选择或绑定一个课程"
    />

    <template v-else>
      <div class="mb-4 flex flex-wrap items-center gap-2">
        <template v-if="editing">
          <IconAction label="完成" variant="soft" @click="finishEditing">
            <UIcon name="i-lucide-check" class="h-[15px] w-[15px] shrink-0" />
          </IconAction>
          <SearchInput v-model="query" placeholder="搜索" aria-label="搜索 Checkpoint 学生" class="min-w-[12rem] flex-1" />
          <div class="ms-auto flex flex-wrap items-center gap-2">
            <IconAction
              label="删除所选"
              variant="soft"
              @click="selected.size > 0 && openDeleteBulk()"
            >
              <UIcon name="i-lucide-trash-2" class="h-[15px] w-[15px] shrink-0" />
            </IconAction>
            <IconAction label="反选" variant="soft" @click="invertSelection">
              <UIcon name="i-lucide-flip-horizontal-2" class="h-[15px] w-[15px] shrink-0" />
            </IconAction>
            <IconAction label="全选" variant="soft" @click="selectAll">
              <UIcon name="i-lucide-square-check-big" class="h-[15px] w-[15px] shrink-0" />
            </IconAction>
            <span class="tabular text-xs font-semibold text-fg-muted">
              当前已选中（{{ selected.size }}）
            </span>
          </div>
        </template>
        <template v-else>
          <IconAction label="编辑" variant="soft" @click="startEditing">
            <UIcon name="i-lucide-pen" class="h-[15px] w-[15px] shrink-0" />
          </IconAction>
          <SearchInput v-model="query" placeholder="搜索" aria-label="搜索 Checkpoint 学生" class="min-w-[12rem] flex-1" />
          <UButton size="sm" color="primary" @click="addOpen = true">
            <UIcon name="i-lucide-plus" class="h-[15px] w-[15px] shrink-0" />
            添加
          </UButton>
        </template>
      </div>

      <div class="max-h-[65vh] overflow-auto rounded-2xl border border-line bg-elevated">
        <div v-if="loading || studentsLoading" class="p-4">
          <SkeletonList :rows="4" class="h-10 rounded-xl" />
        </div>
        <div v-else-if="rows.length === 0" class="py-10 text-center text-sm text-fg-subtle">
          {{
            claims.length === 0
              ? '暂无 Checkpoint 学生，点击「添加」加入名单'
              : '未找到匹配的学生'
          }}
        </div>
        <table v-else class="w-full border-separate border-spacing-0 text-sm">
          <thead class="sticky top-0 z-20">
            <tr>
              <th v-if="editing" class="border-b border-r border-line bg-elevated px-4 py-2 text-left font-semibold">
                <UCheckbox
                  aria-label="全选"
                  :model-value="headerChecked"
                  @update:model-value="(value) => toggleAll(value === true)"
                />
              </th>
              <th class="sticky left-0 z-30 border-b border-r border-line bg-elevated px-4 py-2 text-left font-semibold">
                姓名
              </th>
              <th class="border-b border-r border-line bg-elevated px-4 py-2 text-left font-semibold">学号</th>
              <th class="border-b border-r border-line bg-elevated px-4 py-2 text-left font-semibold">已应用规则</th>
              <th class="border-b border-r border-line bg-elevated px-4 py-2 text-left font-semibold">添加时间</th>
              <th class="border-b border-r border-line bg-elevated px-4 py-2 text-left font-semibold">操作</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="item in rows" :key="item.id" class="transition-colors hover:bg-sunken/40">
              <td v-if="editing" class="border-b border-r border-line px-4 py-2">
                <UCheckbox
                  :aria-label="`选择 ${item.student?.name ?? ''}`"
                  :model-value="selected.has(item.id)"
                  @update:model-value="(checked) => toggleRow(item.id, checked === true)"
                />
              </td>
              <td class="sticky left-0 z-10 border-b border-r border-line bg-elevated px-4 py-2">
                <div class="font-bold">{{ item.student?.name ?? '—' }}</div>
              </td>
              <td class="tabular border-b border-r border-line px-4 py-2 text-fg-muted">
                {{ item.student?.studentId || '—' }}
              </td>
              <td class="border-b border-r border-line px-4 py-2">
                <span v-if="item.appliedRuleLabels.length === 0" class="text-fg-subtle">—</span>
                <div v-else class="flex flex-wrap items-center gap-1">
                  <UBadge
                    v-for="label in item.appliedRuleLabels"
                    :key="label"
                    size="sm"
                    variant="soft"
                    color="primary"
                  >
                    {{ label }}
                  </UBadge>
                </div>
              </td>
              <td class="border-b border-r border-line px-4 py-2 text-xs text-fg-muted">
                {{ formatLocaleDateTime(item.createdAt) }}
              </td>
              <td class="border-b border-r border-line px-2 py-1.5">
                <UButton size="sm" color="error" variant="ghost" @click="openDeleteSingle(item)">
                  删除
                </UButton>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </template>

    <UModal v-model:open="addOpen" title="添加 Checkpoint 学生" :ui="{ content: 'sm:max-w-lg' }">
      <template #body>
        <div class="flex flex-col gap-4">
          <div>
            <label class="mb-1.5 block text-xs font-semibold text-fg-muted">学生</label>
            <UInputMenu
              v-model="addStuId"
              v-model:search-term="studentQuery"
              :items="visibleCandidates"
              value-key="id"
              label-key="name"
              description-key="studentId"
              ignore-filter
              placeholder="搜索并选择学生"
              class="w-full"
              autofocus
            >
              <template #empty>没有匹配的学生</template>
            </UInputMenu>
          </div>
        </div>
      </template>
      <template #footer>
        <UButton color="neutral" variant="soft" @click="addOpen = false">取消</UButton>
        <PendingButton
          color="primary"
          icon="i-lucide-plus"
          loading-label="添加中"
          :loading="adding"
          :disabled="addStuId == null"
          @click="submitAdd"
        >
          添加
        </PendingButton>
      </template>
    </UModal>

    <ConfirmDialog
      v-model:open="confirmOpen"
      :title="confirmTitle"
      :description="confirmDescription"
      :loading="deleting"
      @confirm="submitDelete"
    />
  </div>
</template>
