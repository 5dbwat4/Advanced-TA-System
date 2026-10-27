<script setup lang="ts">
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
  addFocusStudent,
  deleteFocusStudents,
  fetchClassTables,
  listFocusStudents,
  updateFocusStudent,
  type FocusStudent,
} from '@/lib/api'
import { getErrorMessage } from '@/lib/error'
import { matchStudent } from '@/lib/pinyin'
import { useAsyncData } from '@/lib/request'
import { SCORE_TYPES, scoreKey } from '@/lib/scores'
import { useCurrentClassComputed } from '@/lib/store'
import { toast } from '@/lib/toast'
import { UBadge, UButton, UCheckbox, UIcon, UInput, UInputMenu, UModal, UTabs, UTooltip } from '@/ui'

type ViewTab = 'basic' | 'scores' | 'actions' | 'all'
type StudentOption = { id: string; name: string; studentId: string }
type DeleteTarget = { kind: 'single'; target: FocusStudent } | { kind: 'bulk' }

const VIEW_TABS: Array<{ value: ViewTab; label: string }> = [
  { value: 'basic', label: '基本信息' },
  { value: 'scores', label: '成绩情况' },
  { value: 'actions', label: '操作' },
  { value: 'all', label: '全部' },
]

const status = { label: '正常', tooltip: '一切正常', color: 'success' } as const

const currentClass = useCurrentClassComputed()
const classId = computed(() => currentClass.value?.id ?? null)

const editing = ref(false)
const selected = ref<Set<string>>(new Set())
const query = ref('')
const studentQuery = ref('')
const tab = ref<ViewTab>('all')

const focusStudents = ref<FocusStudent[]>([])
const loading = ref(true)

const {
  data: tableData,
  loading: tableLoading,
  error: tableError,
} = useAsyncData(() => fetchClassTables(classId.value ?? undefined), [classId])

watch(tableError, (message) => {
  if (message) toast.error(message)
})

const students = computed(() => tableData.value?.students ?? [])
const experiments = computed(() => tableData.value?.experiments ?? [])
const scores = computed(
  () =>
    new Map<string, number>(
      (tableData.value?.scores ?? []).map(
        (item) => [scoreKey(item.userId, item.type, item.indId), item.score] as const,
      ),
    ),
)

async function reload() {
  if (!classId.value) {
    focusStudents.value = []
    loading.value = false
    return
  }
  loading.value = true
  try {
    const data = await listFocusStudents(classId.value)
    focusStudents.value = data.focusStudents
  } catch (error) {
    toast.error(getErrorMessage(error, '加载重点关注学生失败'))
  } finally {
    loading.value = false
  }
}

watch(classId, () => void reload(), { immediate: true })

const classStudents = computed(() =>
  students.value.filter((student) => student.classId === classId.value),
)
const classExperiments = computed(() =>
  experiments.value.filter((experiment) => experiment.classId === classId.value),
)

const rows = computed(() =>
  focusStudents.value.filter((item) =>
    matchStudent(query.value, item.student ?? { name: '', studentId: '' }),
  ),
)

const candidates = computed<StudentOption[]>(() => {
  const focusIds = new Set(focusStudents.value.map((item) => item.userId))
  return classStudents.value
    .filter((student) => !focusIds.has(student.userId))
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

const reasonOpen = ref(false)
const reasonTarget = ref<FocusStudent | null>(null)
const reasonDraft = ref('')
const savingReason = ref(false)

function openReasonModal(target: FocusStudent) {
  reasonTarget.value = target
  reasonDraft.value = target.reason
  reasonOpen.value = true
}

watch(reasonOpen, (open) => {
  if (!open) reasonTarget.value = null
})

async function saveReason() {
  if (!classId.value || !reasonTarget.value) return
  savingReason.value = true
  try {
    await updateFocusStudent(classId.value, reasonTarget.value.id, reasonDraft.value.trim())
    await reload()
    toast.success('已保存')
    reasonOpen.value = false
  } catch (error) {
    toast.error(getErrorMessage(error, '保存失败'))
  } finally {
    savingReason.value = false
  }
}

const addOpen = ref(false)
const addStuId = ref<string | undefined>(undefined)
const addReason = ref('')
const adding = ref(false)

watch(addOpen, (open) => {
  if (open) {
    addStuId.value = undefined
    addReason.value = ''
    studentQuery.value = ''
  }
})

async function submitAdd() {
  if (!classId.value || addStuId.value == null || addStuId.value === '') return
  adding.value = true
  try {
    await addFocusStudent(classId.value, {
      userId: String(addStuId.value),
      reason: addReason.value.trim() || undefined,
    })
    await reload()
    toast.success('已添加重点关注学生')
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
  confirmTarget.value?.kind === 'single' ? '移除重点关注学生' : '移除所选学生',
)
const confirmDescription = computed(() => {
  if (confirmTarget.value?.kind === 'single') {
    return `确定将 ${confirmTarget.value.target.student?.name ?? '该学生'} 从重点关注名单中移除吗？`
  }
  return `确定将选中的 ${selected.value.size} 名学生从重点关注名单中移除吗？`
})

function openDeleteSingle(target: FocusStudent) {
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
    await deleteFocusStudents(classId.value, ids)
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

const hasScoreCols = computed(() => tab.value === 'scores' || tab.value === 'all')
const hasActions = computed(() => tab.value === 'actions' || tab.value === 'all')
const constantRowSpan = computed(() => (hasScoreCols.value ? 2 : 1))

function setTab(value: string | number) {
  tab.value = String(value) as ViewTab
}
</script>

<template>
  <div class="mx-auto max-w-6xl">
    <BackLink to="/console/courses/settings">返回课程设置</BackLink>

    <PageHeader title="“重点关注学生”名单" />

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
          <SearchInput
            v-model="query"
            placeholder="搜索"
            aria-label="搜索重点关注学生"
            class="min-w-[12rem] flex-1"
          />
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
          <SearchInput
            v-model="query"
            placeholder="搜索"
            aria-label="搜索重点关注学生"
            class="min-w-[12rem] flex-1"
          />
          <IconAction
            label="一键导入（开发中）"
            variant="ghost"
            @click="toast.info('一键导入功能开发中')"
          >
            <UIcon name="i-lucide-import" class="h-[15px] w-[15px] shrink-0" />
          </IconAction>
          <UButton size="sm" color="primary" @click="addOpen = true">
            <UIcon name="i-lucide-plus" class="h-[15px] w-[15px] shrink-0" />
            添加
          </UButton>
          <div class="ms-auto flex items-center gap-2">
            <span class="text-xs font-semibold text-fg-muted">查看</span>
            <UTabs
              :model-value="tab"
              :items="VIEW_TABS"
              variant="pill"
              :content="false"
              @update:model-value="setTab"
            />
          </div>
        </template>
      </div>

      <div class="max-h-[65vh] overflow-auto rounded-2xl border border-line bg-elevated">
        <div v-if="loading || tableLoading" class="p-4">
          <SkeletonList :rows="4" class="h-10 rounded-xl" />
        </div>
        <div v-else-if="rows.length === 0" class="py-10 text-center text-sm text-fg-subtle">
          {{ focusStudents.length === 0 ? '暂无重点关注学生' : '未找到匹配的学生' }}
        </div>
        <table v-else class="w-full table-fixed border-separate border-spacing-0 text-sm">
          <colgroup>
            <col v-if="editing" class="w-12" />
            <col class="w-40" />
            <col class="w-36" />
            <col class="w-72" />
            <col class="w-32" />
            <template v-if="hasScoreCols">
              <template v-for="experiment in classExperiments" :key="experiment.id">
                <col v-for="type in SCORE_TYPES" :key="`${experiment.id}:${type.value}`" class="w-20" />
              </template>
            </template>
            <col v-if="hasActions" class="w-40" />
            <col />
          </colgroup>
          <thead class="sticky top-0 z-20">
            <tr>
              <th v-if="editing" class="sticky left-0 z-30 border-b border-r border-line bg-elevated px-4 py-2 text-left font-semibold">
                <UCheckbox
                  aria-label="全选"
                  :model-value="headerChecked"
                  @update:model-value="(value) => toggleAll(value === true)"
                />
              </th>
              <th
                :rowspan="constantRowSpan"
                :class="[
                  'border-b border-r border-line bg-elevated px-4 py-2 text-left font-semibold',
                  editing ? 'sticky left-12 z-30' : 'sticky left-0 z-30',
                ]"
              >
                姓名
              </th>
              <th :rowspan="constantRowSpan" class="border-b border-r border-line bg-elevated px-4 py-2 text-left font-semibold">
                学号
              </th>
              <th :rowspan="constantRowSpan" class="border-b border-r border-line bg-elevated px-4 py-2 text-left font-semibold">
                重点关注原因
              </th>
              <th :rowspan="constantRowSpan" class="border-b border-r border-line bg-elevated px-4 py-2 text-left font-semibold">
                当前状态
              </th>
              <template v-if="hasScoreCols">
                <th
                  v-for="experiment in classExperiments"
                  :key="experiment.id"
                  :colspan="SCORE_TYPES.length"
                  class="border-b border-r border-line bg-elevated px-4 py-2 text-center font-semibold"
                >
                  {{ experiment.mark }} · {{ experiment.title }}
                </th>
              </template>
              <th v-if="hasActions" :rowspan="constantRowSpan" class="border-b border-r border-line bg-elevated px-4 py-2 text-left font-semibold">
                操作
              </th>
              <th :rowspan="constantRowSpan" aria-hidden class="border-b border-r border-line bg-elevated px-4 py-2" />
            </tr>
            <tr v-if="hasScoreCols">
              <th v-if="editing" class="sticky left-0 z-30 border-b border-r border-line bg-elevated px-4 py-2" />
              <template v-for="experiment in classExperiments" :key="experiment.id">
                <th
                  v-for="type in SCORE_TYPES"
                  :key="`${experiment.id}:${type.value}`"
                  class="border-b border-r border-line bg-elevated px-2 py-2 text-center text-xs font-medium text-fg-muted"
                >
                  {{ type.label }}
                </th>
              </template>
            </tr>
          </thead>
          <tbody>
            <tr v-for="item in rows" :key="item.id" class="transition-colors hover:bg-sunken/40">
              <td v-if="editing" class="sticky left-0 z-10 border-b border-r border-line bg-elevated px-4 py-2">
                <UCheckbox
                  :aria-label="`选择 ${item.student?.name ?? ''}`"
                  :model-value="selected.has(item.id)"
                  @update:model-value="(checked) => toggleRow(item.id, checked === true)"
                />
              </td>
              <td
                :class="[
                  'sticky z-10 border-b border-r border-line bg-elevated px-4 py-2',
                  editing ? 'left-12' : 'left-0',
                ]"
              >
                <div class="font-bold">{{ item.student?.name ?? '—' }}</div>
              </td>
              <td class="tabular border-b border-r border-line px-4 py-2 text-fg-muted">
                {{ item.student?.studentId || '—' }}
              </td>
              <td class="border-b border-r border-line px-4 py-2">
                <div
                  v-if="item.reason"
                  class="max-w-[16rem] truncate text-fg-muted"
                  :title="item.reason"
                >
                  {{ item.reason }}
                </div>
                <span v-else class="text-fg-subtle">—</span>
              </td>
              <td class="border-b border-r border-line px-4 py-2">
                <UTooltip :text="status.tooltip" arrow>
                  <UBadge size="sm" variant="soft" :color="status.color">
                    {{ status.label }}
                  </UBadge>
                </UTooltip>
              </td>
              <template v-if="hasScoreCols">
                <template v-for="experiment in classExperiments" :key="experiment.id">
                  <td
                    v-for="type in SCORE_TYPES"
                    :key="`${experiment.id}:${type.value}`"
                    class="border-b border-r border-line px-2 py-1.5 text-center"
                  >
                    <span
                      :class="[
                        'tabular',
                        scores.get(scoreKey(item.userId, type.value, experiment.id)) == null &&
                          'text-fg-subtle',
                      ]"
                    >
                      {{ scores.get(scoreKey(item.userId, type.value, experiment.id)) ?? '—' }}
                    </span>
                  </td>
                </template>
              </template>
              <td v-if="hasActions" class="border-b border-r border-line px-2 py-1.5">
                <div class="flex items-center gap-1">
                  <UButton size="sm" variant="ghost" @click="openReasonModal(item)">修改</UButton>
                  <UButton size="sm" variant="ghost" color="error" @click="openDeleteSingle(item)">
                    删除
                  </UButton>
                </div>
              </td>
              <td aria-hidden class="border-b border-line" />
            </tr>
          </tbody>
        </table>
      </div>
    </template>

    <UModal
      v-model:open="reasonOpen"
      title="修改重点关注原因"
      :ui="{ content: 'sm:max-w-md' }"
    >
      <template #body>
        <div class="flex flex-col gap-1.5">
          <div class="text-xs font-semibold text-fg-muted">重点关注原因</div>
          <UInput
            v-model="reasonDraft"
            class="w-full"
            :maxlength="200"
            autofocus
            placeholder="如：Lab1 未通过，需重点跟进"
            aria-label="重点关注原因"
          />
        </div>
      </template>
      <template #footer>
        <UButton color="neutral" variant="soft" @click="reasonOpen = false">取消</UButton>
        <PendingButton
          color="primary"
          icon="i-lucide-pen"
          loading-label="保存中"
          :disabled="!reasonTarget"
          :loading="savingReason"
          @click="saveReason"
        >
          保存
        </PendingButton>
      </template>
    </UModal>

    <UModal
      v-model:open="addOpen"
      title="添加重点关注学生"
      :ui="{ content: 'sm:max-w-lg' }"
    >
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
          <div class="flex flex-col gap-1.5">
            <div class="text-xs font-semibold text-fg-muted">重点关注原因</div>
            <UInput
              v-model="addReason"
              class="w-full"
              :maxlength="200"
              placeholder="如：Lab1 未通过，需重点跟进"
              aria-label="重点关注原因"
            />
          </div>
        </div>
      </template>
      <template #footer>
        <UButton color="neutral" variant="soft" @click="addOpen = false">取消</UButton>
        <PendingButton
          color="primary"
          icon="i-lucide-plus"
          loading-label="添加中"
          :disabled="addStuId == null || addStuId === ''"
          :loading="adding"
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
