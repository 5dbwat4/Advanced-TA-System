<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'

import ScoreCell from '@/components/scores/ScoreCell.vue'
import ConfirmDialog from '@/components/ui/ConfirmDialog.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import IconAction from '@/components/ui/IconAction.vue'
import PageHeader from '@/components/ui/PageHeader.vue'
import PendingButton from '@/components/ui/PendingButton.vue'
import SkeletonList from '@/components/ui/SkeletonList.vue'
import {
  ApiError,
  apiFetch,
  applyRoster,
  fetchClassSettings,
  fetchClassTables,
  previewRoster,
  type ClassSettings,
  type Experiment,
  type RosterDiff,
  type Score,
  type Student,
} from '@/lib/api'
import { useAuthStore } from '@/lib/auth'
import { getErrorMessage } from '@/lib/error'
import {
  connectScoreSocket,
  disconnectScoreSocket,
  subscribeScores,
  type ScoreChangeEvent,
} from '@/lib/realtime'
import { useAsyncData } from '@/lib/request'
import { extraProjectNames, SCORE_TYPES, SCORE_TYPE_EXTRA, scoreKey } from '@/lib/scores'
import { resolveScoreRatio, weightedTotal } from '@/lib/scoring'
import { useCurrentClassComputed, useHasXzzdPermission } from '@/lib/store'
import { toast } from '@/lib/toast'
import { UAlert, UButton, UIcon, UModal } from '@/ui'

type SortDir = 'asc' | 'desc'
type SortState = { key: string; dir: SortDir }
type PendingRange = { student: Student; type: number; indId: string; score: number }

const STUDENT_SORT_KEY = 'student'
const SORT_SEP = '\u0000'

const router = useRouter()
const auth = useAuthStore()
const currentClass = useCurrentClassComputed()
const classId = computed(() => currentClass.value?.id ?? null)
const hasXzzd = computed(() => useHasXzzdPermission())

const students = ref<Student[]>([])
const experiments = ref<Experiment[]>([])
const scores = ref<Map<string, Score>>(new Map())
const sort = ref<SortState | null>(null)
const rosterBusy = ref(false)
const pendingDiff = ref<RosterDiff | null>(null)
const rosterOpen = ref(false)
const pendingRange = ref<PendingRange | null>(null)
const rangeOpen = ref(false)
const rangeBusy = ref(false)

function toScoreMap(list: Score[]): Map<string, Score> {
  return new Map(list.map((item) => [scoreKey(item.userId, item.type, item.indId), item]))
}

const tables = useAsyncData(() => fetchClassTables(classId.value ?? undefined), [classId])
const settingsQuery = useAsyncData<{ settings: ClassSettings | null }>(
  () =>
    classId.value ? fetchClassSettings(classId.value) : Promise.resolve({ settings: null }),
  [classId],
)

const loading = computed(() => tables.loading.value)
const classSettings = computed(() => settingsQuery.data.value?.settings ?? null)
const ratioError = computed(() => Boolean(settingsQuery.error.value))

watch(
  tables.data,
  (data) => {
    if (!data) return
    students.value = data.students
    experiments.value = data.experiments
    scores.value = toScoreMap(data.scores)
  },
  { immediate: true },
)

watch(tables.error, (message) => {
  if (message) toast.error(message)
})

watch(rosterOpen, (open) => {
  if (!open) pendingDiff.value = null
})

watch(rangeOpen, (open) => {
  if (!open) pendingRange.value = null
})

async function reload() {
  await tables.reload()
}

const visibleStudents = computed(() =>
  currentClass.value
    ? students.value.filter((student) => student.classId === currentClass.value?.id)
    : [],
)

const classExperiments = computed(() =>
  currentClass.value
    ? experiments.value.filter((exp) => exp.classId === currentClass.value?.id)
    : [],
)

const extraProjects = computed(() => extraProjectNames(scores.value.values()))

function scoreSortKey(indId: string, type: number): string {
  return `${indId}${SORT_SEP}${type}`
}

function sortStudents(
  list: Student[],
  state: SortState | null,
  scoreMap: Map<string, Score>,
): Student[] {
  if (!state) return list
  const factor = state.dir === 'asc' ? 1 : -1
  const [indId, typePart] = state.key === STUDENT_SORT_KEY ? [] : state.key.split(SORT_SEP)
  const type = typePart === undefined ? undefined : Number(typePart)
  const byName = (a: Student, b: Student) => a.name.localeCompare(b.name, 'zh-Hans-CN')
  const compare = (a: Student, b: Student): number => {
    if (!indId || type === undefined) {
      const cmp = byName(a, b)
      return cmp !== 0 ? cmp * factor : a.studentId.localeCompare(b.studentId)
    }
    const va = scoreMap.get(scoreKey(a.userId, type, indId))?.score ?? null
    const vb = scoreMap.get(scoreKey(b.userId, type, indId))?.score ?? null
    if (va === null || vb === null) {
      if (va === null && vb === null) return byName(a, b)
      return va === null ? 1 : -1
    }
    return va !== vb ? (va - vb) * factor : byName(a, b)
  }
  const out: Student[] = []
  for (const student of list) {
    let lo = 0
    let hi = out.length
    while (lo < hi) {
      const mid = (lo + hi) >> 1
      if (compare(out[mid], student) <= 0) lo = mid + 1
      else hi = mid
    }
    out.splice(lo, 0, student)
  }
  return out
}

const sortedStudents = computed(() =>
  sortStudents(visibleStudents.value, sort.value, scores.value),
)

function toggleSort(key: string) {
  const prev = sort.value
  if (!prev || prev.key !== key) {
    sort.value = { key, dir: 'asc' }
    return
  }
  if (prev.dir === 'asc') {
    sort.value = { key, dir: 'desc' }
    return
  }
  sort.value = null
}

function ariaSort(key: string): 'ascending' | 'descending' | 'none' {
  if (sort.value?.key !== key) return 'none'
  return sort.value.dir === 'asc' ? 'ascending' : 'descending'
}

function sortIconName(key: string): string {
  if (sort.value?.key !== key) return 'i-lucide-arrow-up-down'
  return sort.value.dir === 'asc' ? 'i-lucide-arrow-up' : 'i-lucide-arrow-down'
}

function sortIconClass(key: string): string {
  return sort.value?.key === key
    ? 'opacity-100'
    : 'opacity-30 transition-opacity group-hover/sort:opacity-70'
}

function commitExtra(student: Student, name: string, next: number | null) {
  return commitScore(student, SCORE_TYPE_EXTRA, name, next)
}

function rangeExtra(student: Student, name: string, next: number) {
  setPendingRange(student, SCORE_TYPE_EXTRA, name, next)
}

function experimentTotal(student: Student, experiment: Experiment): number | null {
  return weightedTotal(
    SCORE_TYPES.map(
      (type) => scores.value.get(scoreKey(student.userId, type.value, experiment.id))?.score ?? null,
    ),
    resolveScoreRatio(classSettings.value, experiment.id),
  )
}

async function commitScore(
  student: Student,
  type: number,
  indId: string,
  next: number | null,
) {
  const key = scoreKey(student.userId, type, indId)
  try {
    if (next === null) {
      await apiFetch<{ ok: true }>('/api/scores', {
        method: 'DELETE',
        body: JSON.stringify({ userId: student.userId, type, indId }),
      })
      const map = new Map(scores.value)
      map.delete(key)
      scores.value = map
    } else {
      const res = await apiFetch<{ score: Score }>('/api/scores', {
        method: 'PUT',
        body: JSON.stringify({ userId: student.userId, type, indId, score: next }),
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
    await commitScore(target.student, target.type, target.indId, target.score)
    rangeOpen.value = false
  } catch {
    rangeOpen.value = false
  } finally {
    rangeBusy.value = false
  }
}

async function importRoster() {
  const klass = currentClass.value
  if (!klass) return
  rosterBusy.value = true
  try {
    const diff = await previewRoster(klass.id)
    if (diff.added.length === 0 && diff.removed.length === 0) {
      toast.success('名单已是最新')
      return
    }
    if (visibleStudents.value.length === 0) {
      await applyRoster(klass.id, {
        added: diff.added,
        removed: diff.removed.map((item) => item.studentId),
      })
      toast.success('名单已导入')
      await auth.refresh()
      await reload()
      return
    }
    pendingDiff.value = diff
    rosterOpen.value = true
  } catch (error) {
    toast.error(getErrorMessage(error, '操作失败'))
  } finally {
    rosterBusy.value = false
  }
}

async function confirmRoster() {
  const klass = currentClass.value
  const diff = pendingDiff.value
  if (!klass || !diff) return
  rosterBusy.value = true
  try {
    await applyRoster(klass.id, {
      added: diff.added,
      removed: diff.removed.map((item) => item.studentId),
      expectedSyncAt: klass.lastRosterSyncAt ?? undefined,
    })
    toast.success('名单已更新')
    await auth.refresh()
    await reload()
    rosterOpen.value = false
  } catch (error) {
    if (error instanceof ApiError && error.code === 'ROSTER_STALE') {
      toast.error(error.message)
      rosterOpen.value = false
      await auth.refresh()
      return
    }
    toast.error(getErrorMessage(error, '操作失败'))
  } finally {
    rosterBusy.value = false
  }
}

const rosterLabel = computed(() => (visibleStudents.value.length > 0 ? '更新名单' : '导入学生名单'))

const rosterSyncLabel = computed(() => {
  const at = currentClass.value?.lastRosterSyncAt
  return at ? `名单更新于 ${new Date(at).toLocaleString()}` : '尚未同步名单'
})

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

function openStudent(userId: string) {
  void router.push(`/console/scores/students/${userId}`)
}

function setPendingRange(student: Student, type: number, indId: string, next: number) {
  pendingRange.value = { student, type, indId, score: next }
  rangeOpen.value = true
}
</script>

<template>
  <div class="mx-auto max-w-6xl">
    <PageHeader title="分数和名单">
      <template #actions>
        <UButton
          v-if="currentClass"
          size="sm"
          color="neutral"
          variant="soft"
          @click="router.push('/console/scores/standalone')"
        >
          <UIcon name="i-lucide-list-plus" class="h-[15px] w-[15px] shrink-0" />
          独立计分项目
        </UButton>
        <PendingButton
          v-if="hasXzzd && currentClass"
          size="sm"
          color="neutral"
          variant="soft"
          icon="i-lucide-user-round-plus"
          :loading="rosterBusy"
          loading-label="更新名单"
          @click="importRoster"
        >
          {{ rosterLabel }}
        </PendingButton>
        <IconAction label="刷新" :disabled="loading" @click="reload">
          <UIcon name="i-lucide-refresh-cw" class="h-[15px] w-[15px] shrink-0" />
        </IconAction>
      </template>
    </PageHeader>

    <UModal v-model:open="rosterOpen" title="更新名单" :ui="{ content: 'sm:max-w-md' }">
      <template #body>
        <div v-if="pendingDiff" class="flex flex-col gap-4">
          <div class="flex flex-col gap-2">
            <div class="text-sm font-semibold text-fg">新增 {{ pendingDiff.added.length }} 人</div>
            <div
              v-if="pendingDiff.added.length === 0"
              class="rounded-xl border border-dashed border-line py-4 text-center text-xs text-fg-subtle"
            >
              无新增学生
            </div>
            <div v-else class="flex max-h-40 flex-col gap-1 overflow-auto">
              <div
                v-for="entry in pendingDiff.added"
                :key="entry.studentId"
                class="flex items-center gap-3 rounded-xl border border-line bg-sunken px-3 py-2"
              >
                <div class="min-w-0 flex-1 truncate text-sm font-semibold">{{ entry.name }}</div>
                <span class="tabular shrink-0 text-xs text-fg-subtle">{{ entry.studentId }}</span>
              </div>
            </div>
          </div>

          <div class="flex flex-col gap-2">
            <div class="text-sm font-semibold text-fg">移除 {{ pendingDiff.removed.length }} 人</div>
            <div
              v-if="pendingDiff.removed.length === 0"
              class="rounded-xl border border-dashed border-line py-4 text-center text-xs text-fg-subtle"
            >
              无移除学生
            </div>
            <template v-else>
              <div class="flex max-h-40 flex-col gap-1 overflow-auto">
                <div
                  v-for="entry in pendingDiff.removed"
                  :key="entry.studentId"
                  class="flex items-center gap-3 rounded-xl border border-line bg-sunken px-3 py-2"
                >
                  <div class="min-w-0 flex-1 truncate text-sm font-semibold">{{ entry.name }}</div>
                  <span class="tabular shrink-0 text-xs text-fg-subtle">{{ entry.studentId }}</span>
                </div>
              </div>
              <p class="text-xs text-danger">
                移除后学生将无法登录，历史成绩保留；重新加入名单后可恢复。
              </p>
            </template>
          </div>
        </div>
      </template>
      <template #footer>
        <UButton color="neutral" variant="soft" @click="rosterOpen = false">取消</UButton>
        <PendingButton
          color="error"
          :loading="rosterBusy"
          loading-label="更新名单"
          @click="confirmRoster"
        >
          更新名单
        </PendingButton>
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

    <SkeletonList v-if="loading" :rows="5" class="h-12 rounded-xl" />
    <EmptyState
      v-else-if="!currentClass"
      icon="i-lucide-school"
      title="尚未绑定班级"
      hint="请先在设置中绑定班级"
    />
    <template v-else>
      <div class="mb-4 flex flex-wrap items-center gap-3">
        <span class="text-sm font-semibold text-fg">{{ currentClass?.name }}</span>
        <span class="tabular text-xs text-fg-subtle">{{ visibleStudents.length }} 人</span>
        <span class="text-xs text-fg-subtle">{{ rosterSyncLabel }}</span>
      </div>

      <UAlert
        variant="subtle"
        v-if="ratioError"
        class="mb-4"
        color="warning"
        icon="i-lucide-triangle-alert"
        description="评分占比加载失败，总评按默认占比 2:5:0 估算，仅供参考"
      />

      <EmptyState
        v-if="classExperiments.length === 0 && extraProjects.length === 0"
        icon="i-lucide-flask-conical"
        title="暂无实验"
        hint="请先在实验页创建实验"
      />
      <EmptyState
        v-else-if="students.length === 0"
        icon="i-lucide-users"
        title="暂无学生"
        hint="请先导入学生名单"
      />
      <div v-else class="max-h-[70vh] overflow-auto rounded-2xl border border-line">
        <table class="w-full border-separate border-spacing-0 text-sm">
          <thead class="sticky top-0 z-20">
            <tr>
              <th
                rowspan="2"
                :aria-sort="ariaSort(STUDENT_SORT_KEY)"
                class="sticky left-0 z-30 border-b border-r border-line bg-elevated px-4 py-2 text-left font-semibold"
              >
                <button
                  type="button"
                  class="group/sort inline-flex items-center gap-1 rounded-md transition-colors hover:text-fg"
                  :aria-label="'按「学生」排序'"
                  @click="toggleSort(STUDENT_SORT_KEY)"
                >
                  学生
                  <UIcon
                    :name="sortIconName(STUDENT_SORT_KEY)"
                    class="h-3 w-3 shrink-0"
                    :class="sortIconClass(STUDENT_SORT_KEY)"
                  />
                </button>
              </th>
              <th
                v-for="exp in classExperiments"
                :key="exp.id"
                :colspan="SCORE_TYPES.length + 1"
                class="border-b border-r border-line bg-elevated px-4 py-2 text-center font-semibold"
              >
                {{ exp.mark }} · {{ exp.title }}
              </th>
              <th
                v-if="extraProjects.length > 0"
                :colspan="extraProjects.length"
                class="border-b border-r border-line bg-elevated px-4 py-2 text-center font-semibold"
              >
                独立计分项目
              </th>
            </tr>
            <tr>
              <template v-for="exp in classExperiments" :key="exp.id">
                <th
                  v-for="type in SCORE_TYPES"
                  :key="`${exp.id}:${type.value}`"
                  :aria-sort="ariaSort(scoreSortKey(exp.id, type.value))"
                  class="min-w-[5.5rem] border-b border-r border-line bg-elevated px-2 py-2 text-center text-xs font-medium text-fg-muted"
                >
                  <button
                    type="button"
                    class="group/sort inline-flex items-center gap-1 rounded-md transition-colors hover:text-fg"
                    :aria-label="`按「${type.label}」排序`"
                    @click="toggleSort(scoreSortKey(exp.id, type.value))"
                  >
                    {{ type.label }}
                    <UIcon
                      :name="sortIconName(scoreSortKey(exp.id, type.value))"
                      class="h-3 w-3 shrink-0"
                      :class="sortIconClass(scoreSortKey(exp.id, type.value))"
                    />
                  </button>
                </th>
                <th
                  class="min-w-[5.5rem] border-b border-r border-line bg-elevated px-2 py-2 text-center text-xs font-medium text-fg-muted"
                >
                  总评
                </th>
              </template>
              <th
                v-for="name in extraProjects"
                :key="`extra:${name}`"
                :aria-sort="ariaSort(scoreSortKey(name, SCORE_TYPE_EXTRA))"
                class="min-w-[5.5rem] border-b border-r border-line bg-elevated px-2 py-2 text-center text-xs font-medium text-fg-muted"
              >
                <button
                  type="button"
                  class="group/sort inline-flex items-center gap-1 rounded-md transition-colors hover:text-fg"
                  :aria-label="`按「${name}」排序`"
                  @click="toggleSort(scoreSortKey(name, SCORE_TYPE_EXTRA))"
                >
                  {{ name }}
                  <UIcon
                    :name="sortIconName(scoreSortKey(name, SCORE_TYPE_EXTRA))"
                    class="h-3 w-3 shrink-0"
                    :class="sortIconClass(scoreSortKey(name, SCORE_TYPE_EXTRA))"
                  />
                </button>
              </th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="student in sortedStudents"
              :key="student.userId"
              class="transition-colors hover:bg-sunken/40"
            >
              <td class="sticky left-0 z-10 border-b border-r border-line bg-elevated px-4 py-2">
                <button
                  type="button"
                  class="w-full text-left transition-colors hover:text-brand-600 dark:hover:text-brand-300"
                  title="查看学情报告"
                  @click="openStudent(student.userId)"
                >
                  <div class="font-bold">{{ student.name }}</div>
                  <div class="tabular text-xs text-fg-muted">{{ student.studentId }}</div>
                </button>
              </td>
              <template v-for="exp in classExperiments" :key="exp.id">
                <td
                  v-for="type in SCORE_TYPES"
                  :key="scoreKey(student.userId, type.value, exp.id)"
                  class="min-w-[5.5rem] border-b border-r border-line px-2 py-1.5 text-center"
                >
                  <ScoreCell
                    :score="scores.get(scoreKey(student.userId, type.value, exp.id)) ?? null"
                    :on-commit="
                      (next: number | null) => commitScore(student, type.value, exp.id, next)
                    "
                    :on-out-of-range="
                      (next: number) => setPendingRange(student, type.value, exp.id, next)
                    "
                  />
                </td>
                <td
                  class="tabular min-w-[5.5rem] border-b border-r border-line px-2 py-1.5 text-center font-bold"
                >
                  <span
                    v-if="experimentTotal(student, exp) == null"
                    class="font-normal text-fg-subtle"
                  >
                    —
                  </span>
                  <template v-else>{{ experimentTotal(student, exp)?.toFixed(1) }}</template>
                </td>
              </template>
              <td
                v-for="name in extraProjects"
                :key="`extra:${name}`"
                class="min-w-[5.5rem] border-b border-r border-line px-2 py-1.5 text-center"
              >
                <ScoreCell
                  :score="scores.get(scoreKey(student.userId, SCORE_TYPE_EXTRA, name)) ?? null"
                  :on-commit="(next: number | null) => commitExtra(student, name, next)"
                  :on-out-of-range="(next: number) => rangeExtra(student, name, next)"
                />
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </template>
  </div>
</template>
