<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'

import ScoreCell from '@/components/scores/ScoreCell.vue'
import Card from '@/components/ui/Card.vue'
import ConfirmDialog from '@/components/ui/ConfirmDialog.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import IconAction from '@/components/ui/IconAction.vue'
import PageHeader from '@/components/ui/PageHeader.vue'
import SearchInput from '@/components/ui/SearchInput.vue'
import SkeletonList from '@/components/ui/SkeletonList.vue'
import { apiFetch, fetchClassTables, type Score, type Student } from '@/lib/api'
import { getErrorMessage } from '@/lib/error'
import { matchStudent } from '@/lib/pinyin'
import { useQuickScores } from '@/lib/quick-scores'
import {
  connectScoreSocket,
  disconnectScoreSocket,
  subscribeScores,
  type ScoreChangeEvent,
} from '@/lib/realtime'
import { useAsyncData } from '@/lib/request'
import { extraProjectNames, SCORE_LIMIT, SCORE_MAX, SCORE_TYPE_EXTRA, scoreKey } from '@/lib/scores'
import { useCurrentClassComputed } from '@/lib/store'
import { toast } from '@/lib/toast'
import { UButton, UIcon, UInput, UModal, USelect, UTabs } from '@/ui'

type RangeTarget = { student: Student; name: string; score: number }
type BulkScope = 'all' | 'empty'

const router = useRouter()
const currentClass = useCurrentClassComputed()
const classId = computed(() => currentClass.value?.id ?? null)

const students = ref<Student[]>([])
const scores = ref<Map<string, Score>>(new Map())
const selected = ref<string | null>(null)
const query = ref('')
const newName = ref('')
const applyValue = ref('')
const targetQuery = ref('')
const applying = ref(false)
const { values: quickScores, save: saveQuickScores } = useQuickScores()
const editingQuick = ref(false)
const quickDraft = ref('')
const pendingRange = ref<RangeTarget | null>(null)
const rangeOpen = ref(false)
const rangeBusy = ref(false)
const bulkValue = ref('')
const bulkScope = ref<BulkScope>('all')
const bulkBusy = ref(false)
const newOpen = ref(false)
const bulkOpen = ref(false)

const bulkScopeItems = [
  { label: '应用到全部', value: 'all' },
  { label: '应用到未填项', value: 'empty' },
]

const tables = useAsyncData(() => fetchClassTables(classId.value ?? undefined), [classId])
const loading = computed(() => tables.loading.value)

function toScoreMap(list: Score[]): Map<string, Score> {
  return new Map(list.map((item) => [scoreKey(item.userId, item.type, item.indId), item]))
}

watch(
  tables.data,
  (data) => {
    if (!data) return
    students.value = data.students
    scores.value = toScoreMap(data.scores)
  },
  { immediate: true },
)

watch(tables.error, (message) => {
  if (message) toast.error(message)
})

watch(newOpen, (open) => {
  if (!open) newName.value = ''
})

watch(rangeOpen, (open) => {
  if (!open) pendingRange.value = null
})

watch(bulkOpen, (open) => {
  if (!open) {
    bulkValue.value = ''
    bulkScope.value = 'all'
  }
})

async function reload() {
  await tables.reload()
}

const projects = computed(() => extraProjectNames(scores.value.values()))

const projectItems = computed(() => projects.value.map((name) => ({ label: name, value: name })))

watch(projects, (list) => {
  if (!selected.value || !list.includes(selected.value)) selected.value = list[0] ?? null
})

const visibleStudents = computed(() =>
  currentClass.value
    ? students.value.filter((student) => student.classId === currentClass.value?.id)
    : [],
)

const filteredStudents = computed(() =>
  query.value.trim()
    ? visibleStudents.value.filter((student) => matchStudent(query.value, student))
    : visibleStudents.value,
)

const recorded = computed(() =>
  selected.value
    ? visibleStudents.value.filter((student) =>
        scores.value.has(scoreKey(student.userId, SCORE_TYPE_EXTRA, selected.value as string)),
      ).length
    : 0,
)

const applyScore = computed(() => {
  const trimmed = applyValue.value.trim()
  if (trimmed === '') return null
  const parsed = Number(trimmed)
  return Number.isNaN(parsed) ? null : parsed
})

const targetMatches = computed(() => {
  if (applyScore.value === null || !targetQuery.value.trim()) return []
  return visibleStudents.value
    .filter((student) => matchStudent(targetQuery.value, student))
    .slice(0, 6)
})

const bulkScore = computed(() => {
  const trimmed = bulkValue.value.trim()
  if (trimmed === '') return null
  const parsed = Number(trimmed)
  return Number.isNaN(parsed) ? null : parsed
})

const bulkTargets = computed(() => {
  if (!selected.value) return []
  if (bulkScope.value === 'all') return visibleStudents.value
  return visibleStudents.value.filter(
    (student) =>
      !scores.value.has(scoreKey(student.userId, SCORE_TYPE_EXTRA, selected.value as string)),
  )
})

async function commitScore(student: Student, name: string, next: number | null) {
  const key = scoreKey(student.userId, SCORE_TYPE_EXTRA, name)
  try {
    if (next === null) {
      await apiFetch<{ ok: true }>('/api/scores', {
        method: 'DELETE',
        body: JSON.stringify({ userId: student.userId, type: SCORE_TYPE_EXTRA, indId: name }),
      })
      const map = new Map(scores.value)
      map.delete(key)
      scores.value = map
    } else {
      const res = await apiFetch<{ score: Score }>('/api/scores', {
        method: 'PUT',
        body: JSON.stringify({
          userId: student.userId,
          type: SCORE_TYPE_EXTRA,
          indId: name,
          score: next,
        }),
      })
      const map = new Map(scores.value)
      map.set(key, res.score)
      scores.value = map
    }
  } catch (error) {
    toast.error(getErrorMessage(error, '保存失败'))
    throw error
  }
}

async function confirmOutOfRange() {
  if (!pendingRange.value) return
  rangeBusy.value = true
  try {
    const target = pendingRange.value
    await commitScore(target.student, target.name, target.score)
  } catch {
    // commitScore 已提示
  } finally {
    rangeOpen.value = false
    rangeBusy.value = false
  }
}

async function applyTo(student: Student) {
  if (!selected.value || applyScore.value === null) return
  const value = applyScore.value
  const name = selected.value
  targetQuery.value = ''
  if (value < -SCORE_LIMIT || value > SCORE_LIMIT) {
    toast.error(`请输入 ${-SCORE_LIMIT}~${SCORE_LIMIT} 的分数`)
    return
  }
  if (value < 0 || value > SCORE_MAX) {
    pendingRange.value = { student, name, score: value }
    rangeOpen.value = true
    return
  }
  applying.value = true
  try {
    await commitScore(student, name, value)
    toast.success(`已将 ${value} 分应用于 ${student.name}`)
  } catch {
    // commitScore 已提示
  } finally {
    applying.value = false
  }
}

function applyFirst() {
  if (targetMatches.value.length > 0) void applyTo(targetMatches.value[0])
}

async function applyBulk() {
  if (!selected.value) return
  const name = selected.value
  if (bulkScore.value === null) {
    toast.error('请输入分数')
    return
  }
  if (bulkScore.value < -SCORE_LIMIT || bulkScore.value > SCORE_LIMIT) {
    toast.error(`请输入 ${-SCORE_LIMIT}~${SCORE_LIMIT} 的分数`)
    return
  }
  if (bulkTargets.value.length === 0) {
    toast.info('没有需要设置的学生')
    return
  }
  const value = bulkScore.value
  bulkBusy.value = true
  let done = 0
  for (const student of bulkTargets.value) {
    try {
      await commitScore(student, name, value)
      done += 1
    } catch {
      // commitScore 已提示
    }
  }
  bulkBusy.value = false
  bulkOpen.value = false
  toast.success(`已将 ${value} 分应用于 ${done} 名学生`)
}

function createProject() {
  const name = newName.value.trim()
  if (!name) {
    toast.error('请输入项目名称')
    return
  }
  if (projects.value.includes(name)) toast.info('已存在同名项目，已为你选中')
  selected.value = name
  newName.value = ''
  newOpen.value = false
}

function startEditQuick() {
  quickDraft.value = quickScores.value.join(', ')
  editingQuick.value = true
}

function commitQuick() {
  const parsed = quickDraft.value
    .split(/[,，\s]+/)
    .map((part) => Number(part))
    .filter((num) => Number.isFinite(num))
  saveQuickScores(parsed)
  editingQuick.value = false
}

function selectedScore(student: Student): Score | undefined {
  if (!selected.value) return undefined
  return scores.value.get(scoreKey(student.userId, SCORE_TYPE_EXTRA, selected.value))
}

function commitSelected(student: Student, next: number | null) {
  if (!selected.value) return Promise.resolve()
  return commitScore(student, selected.value, next)
}

function openRange(student: Student, next: number) {
  if (!selected.value) return
  pendingRange.value = { student, name: selected.value, score: next }
  rangeOpen.value = true
}

function onProjectSelect(value: string | number | undefined) {
  selected.value = value == null ? null : String(value)
}

function onBulkScope(value: string | number) {
  bulkScope.value = value === 'empty' ? 'empty' : 'all'
}

let socket: ReturnType<typeof connectScoreSocket> | null = null

function handleScoreChange(event: ScoreChangeEvent) {
  const map = new Map(scores.value)
  if (event.action === 'upsert') {
    const { userId, type, indId } = event.score
    map.set(scoreKey(userId, type, indId), event.score)
  } else {
    map.delete(scoreKey(event.userId, event.type, event.indId))
  }
  scores.value = map
}

function handleConnect() {
  if (socket && classId.value) subscribeScores(socket, classId.value)
  void reload()
}

onMounted(() => {
  socket = connectScoreSocket()
  socket.on('connect', handleConnect)
  socket.on('score:change', handleScoreChange)
  if (socket.connected) handleConnect()
})

watch(classId, (id) => {
  if (socket?.connected && id) subscribeScores(socket, id)
})

onUnmounted(() => {
  socket?.off('connect', handleConnect)
  socket?.off('score:change', handleScoreChange)
  disconnectScoreSocket()
  socket = null
})
</script>

<template>
  <div class="mx-auto max-w-5xl">
    <PageHeader title="录入分数">
      <template v-if="currentClass" #subtitle>
        {{ currentClass?.name }} · 独立计分项目
      </template>
      <template #actions>
        <USelect
          class="w-48"
          aria-label="选择项目"
          placeholder="选择项目"
          :disabled="loading || projects.length === 0"
          :model-value="selected ?? undefined"
          :items="projectItems"
          @update:model-value="onProjectSelect"
        />
        <UButton size="sm" color="neutral" variant="soft" @click="newOpen = true">
          <UIcon name="i-lucide-plus" class="h-[15px] w-[15px] shrink-0" />
          新建项目
        </UButton>
        <IconAction label="返回分数和名单" @click="router.push('/console/scores')">
          <UIcon name="i-lucide-arrow-left" class="h-[15px] w-[15px] shrink-0" />
        </IconAction>
      </template>
    </PageHeader>

    <SkeletonList v-if="loading" :rows="6" class="h-14 rounded-xl" />
    <EmptyState
      v-else-if="!currentClass"
      icon="i-lucide-school"
      title="尚未绑定班级"
      hint="请先在设置中绑定班级"
    />
    <EmptyState
      v-else-if="visibleStudents.length === 0"
      icon="i-lucide-users"
      title="暂无学生"
      hint="请先在「分数和名单」导入学生名单"
    />
    <EmptyState
      v-else-if="!selected"
      icon="i-lucide-list-plus"
      title="还没有独立计分项目"
      hint="点击右上角「新建项目」创建第一个项目"
    />
    <div v-else class="flex flex-col gap-6 lg:flex-row lg:items-start">
      <div class="min-w-0 flex-1">
        <div class="mb-3 flex flex-wrap items-center gap-3">
          <span class="text-sm font-semibold text-fg">{{ selected }}</span>
          <span class="tabular text-xs text-fg-subtle">
            {{ recorded }}/{{ visibleStudents.length }} 已录入
          </span>
        </div>

        <SearchInput
          v-model="query"
          class="mb-4"
          placeholder="输入姓名、学号、拼音或首字母搜索"
          aria-label="搜索学生"
        />

        <div class="max-h-[70vh] overflow-auto rounded-2xl border border-line">
          <div
            v-for="student in filteredStudents"
            :key="student.userId"
            class="flex items-center gap-3 border-b border-line px-4 py-2 transition-colors last:border-b-0 hover:bg-sunken/40"
          >
            <div class="min-w-0 flex-1">
              <div class="font-bold">{{ student.name }}</div>
              <div class="tabular text-xs text-fg-muted">{{ student.studentId }}</div>
            </div>
            <ScoreCell
              :score="selectedScore(student) ?? null"
              :on-commit="(next) => commitSelected(student, next)"
              :on-out-of-range="(next) => openRange(student, next)"
            />
          </div>
          <div v-if="filteredStudents.length === 0" class="py-10 text-center text-sm text-fg-subtle">
            未找到与“{{ query }}”匹配的学生
          </div>
        </div>
      </div>

      <Card class="flex w-full flex-col gap-5 lg:w-80 lg:shrink-0">
        <div class="flex items-center gap-2">
          <UIcon name="i-lucide-target" class="h-4 w-4 shrink-0 text-brand-600 dark:text-brand-300" />
          <span class="text-sm font-semibold text-fg">将分数应用于…</span>
        </div>

        <div class="flex flex-col gap-2">
          <label class="text-xs font-medium text-fg-subtle" for="apply-value">分数</label>
          <UInput
            id="apply-value"
            v-model="applyValue"
            type="number"
            placeholder="输入固定分值"
            aria-label="固定分值"
            class="tabular w-full"
          />
          <div v-if="editingQuick" class="flex items-center gap-2">
            <UInput
              v-model="quickDraft"
              autofocus
              placeholder="如 100, 50, 0"
              aria-label="编辑快捷分值"
              class="tabular w-full"
              @keydown.enter.prevent="commitQuick"
              @keydown.esc="editingQuick = false"
            />
            <UButton size="sm" color="primary" class="shrink-0" @click="commitQuick">保存</UButton>
          </div>
          <div v-else class="flex flex-wrap items-center gap-1">
            <span class="text-xs text-fg-subtle">快捷：</span>
            <UButton
              v-for="value in quickScores"
              :key="value"
              size="sm"
              color="neutral"
              variant="ghost"
              class="tabular"
              @click="applyValue = String(value)"
            >
              {{ value }}
            </UButton>
            <button
              type="button"
              class="inline-flex items-center gap-1 px-2 text-xs text-fg-subtle transition-colors hover:text-fg"
              @click="startEditQuick"
            >
              <UIcon name="i-lucide-pencil" class="h-3 w-3 shrink-0" />
              编辑
            </button>
          </div>
        </div>

        <div class="flex flex-col gap-2">
          <label class="text-xs font-medium text-fg-subtle" for="apply-target">
            姓名 / 拼音 / 学号
          </label>
          <UInput
            id="apply-target"
            v-model="targetQuery"
            :disabled="applyScore === null"
            :placeholder="applyScore === null ? '请先输入分数' : '输入后回车应用'"
            aria-label="应用到学生"
            class="w-full"
            @keydown.enter.prevent="applyFirst"
          />
          <div class="flex flex-col gap-1">
            <button
              v-for="student in targetMatches"
              :key="student.userId"
              type="button"
              :disabled="applying"
              class="flex items-center gap-3 rounded-xl border border-line bg-sunken px-3 py-2 text-left transition-all hover:border-brand-500/40 hover:shadow-sm disabled:opacity-50"
              @click="applyTo(student)"
            >
              <div class="min-w-0 flex-1">
                <div class="truncate text-sm font-semibold text-fg">{{ student.name }}</div>
                <div class="tabular text-xs text-fg-muted">{{ student.studentId }}</div>
              </div>
              <span
                v-if="selectedScore(student)"
                class="tabular shrink-0 text-xs text-fg-subtle"
              >
                {{ selectedScore(student)?.score }}
              </span>
            </button>
          </div>
        </div>

        <div class="flex flex-col gap-2 border-t border-line pt-4">
          <UButton full-width color="neutral" variant="soft" @click="bulkOpen = true">
            <UIcon name="i-lucide-list-checks" class="h-[15px] w-[15px] shrink-0" />
            全部设为…
          </UButton>
        </div>
      </Card>
    </div>

    <UModal v-model:open="newOpen" title="新建独立计分项目" :ui="{ content: 'sm:max-w-sm' }">
      <template #body>
        <UInput
          v-model="newName"
          autofocus
          placeholder="项目名称，例如：课堂参与"
          aria-label="项目名称"
          @keydown.enter.prevent="createProject"
        />
        <p class="mt-2 text-xs text-fg-subtle">
          项目名保存后不可重命名；无需预先创建，录入第一个分数即生效。
        </p>
      </template>
      <template #footer>
        <UButton color="neutral" variant="soft" @click="newOpen = false">取消</UButton>
        <UButton color="primary" @click="createProject">创建</UButton>
      </template>
    </UModal>

    <UModal v-model:open="bulkOpen" title="全部设为…" :ui="{ content: 'sm:max-w-sm' }">
      <template #body>
        <div class="flex flex-col gap-5">
          <div class="flex flex-col gap-2">
            <label class="text-xs font-medium text-fg-subtle" for="bulk-value">分数</label>
            <UInput
              id="bulk-value"
              v-model="bulkValue"
              type="number"
              autofocus
              placeholder="输入要设置的分数"
              aria-label="批量分值"
              class="tabular w-full"
              @keydown.enter.prevent="applyBulk"
            />
          </div>
          <div class="flex flex-col gap-2">
            <span class="text-xs font-medium text-fg-subtle">应用范围</span>
            <UTabs
              :model-value="bulkScope"
              :items="bulkScopeItems"
              variant="pill"
              :content="false"
              class="w-full"
              @update:model-value="onBulkScope"
            />
            <p class="text-xs text-fg-subtle">将影响 {{ bulkTargets.length }} 名学生</p>
          </div>
        </div>
      </template>
      <template #footer>
        <UButton color="neutral" variant="soft" @click="bulkOpen = false">取消</UButton>
        <UButton color="primary" :disabled="bulkBusy" @click="applyBulk">确定</UButton>
      </template>
    </UModal>

    <ConfirmDialog
      v-model:open="rangeOpen"
      icon="i-lucide-triangle-alert"
      :danger="false"
      title="分数超出范围"
      description="你确定要将分数值设置为在0~100以外的数目吗？"
      confirm-text="确定"
      :loading="rangeBusy"
      @confirm="confirmOutOfRange"
    />
  </div>
</template>
