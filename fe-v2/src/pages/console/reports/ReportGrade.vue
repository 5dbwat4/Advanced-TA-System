<script setup lang="ts">
import type { DropdownMenuItem } from '@nuxt/ui'
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'

import FilePreviewPanel from '@/components/reportgrade/FilePreviewPanel.vue'
import GradePanel from '@/components/reportgrade/GradePanel.vue'
import StudentListPanel from '@/components/reportgrade/StudentListPanel.vue'
import type { GradeStudent, ReportSync, StudentFlag } from '@/components/reportgrade/shared'
import Spinner from '@/components/ui/Spinner.vue'
import {
  apiFetch,
  fetchCheckpointClaims,
  fetchClassTables,
  fetchRemark,
  fetchReportReview,
  fetchXzzdPushPreview,
  listFocusStudents,
  REMARK_TYPE_REPORT,
  type ClassTables,
  type Experiment,
  type Score,
  type ZjuamHomeworkSubmission,
  type ZjuamHomeworkSyncData,
} from '@/lib/api'
import { useAuthStore } from '@/lib/auth'
import { getErrorMessage } from '@/lib/error'
import { useReportRoom, type ReportPeer, type ReportScoreEvent } from '@/lib/report-socket'
import { toast } from '@/lib/toast'
import { UAlert, UButton, UDropdownMenu, UIcon } from '@/ui'

const route = useRoute()
const router = useRouter()

const id = computed(() => {
  const raw = route.params.id
  return typeof raw === 'string' ? raw : (raw?.[0] ?? '')
})

const experiment = ref<Experiment | null>(null)
const syncData = ref<ZjuamHomeworkSyncData | null>(null)
const tables = ref<ClassTables | null>(null)
const scores = ref<Map<string, Score>>(new Map())
const focusByStuId = ref<Map<string, string>>(new Map())
const checkpointStuIds = ref<Set<string>>(new Set())
const selectedPersonId = ref<number | null>(null)
const loading = ref(true)
const error = ref<string | null>(null)

const peers = ref<ReportPeer[]>([])
const remoteSaves = ref<Map<string, ReportScoreEvent>>(new Map())
const sync = ref<ReportSync | null>(null)
const criteriaToken = ref(0)

const CO_TOAST_ID = 'report-grade-co-editors'
const SAVE_TOAST_ID = 'report-grade-save'

watch(
  id,
  (currentId, _previous, onCleanup) => {
    if (!currentId) {
      loading.value = false
      return
    }
    let cancelled = false
    onCleanup(() => {
      cancelled = true
    })
    loading.value = true
    error.value = null

    const run = async () => {
      try {
        const [experimentRes, preview] = await Promise.all([
          apiFetch<{ experiment: Experiment }>(`/api/experiments/${currentId}`),
          fetchXzzdPushPreview(currentId, 'report'),
        ])
        const classTables = await fetchClassTables(experimentRes.experiment.classId)
        const [focusRes, checkpointRes] = await Promise.all([
          listFocusStudents(experimentRes.experiment.classId).catch(() => null),
          fetchCheckpointClaims(experimentRes.experiment.classId).catch(() => null),
        ])
        if (cancelled) return
        experiment.value = experimentRes.experiment
        syncData.value = preview
        tables.value = classTables
        focusByStuId.value = new Map(
          (focusRes?.focusStudents ?? []).map((item) => [item.userId, item.reason] as const),
        )
        checkpointStuIds.value = new Set((checkpointRes?.claims ?? []).map((item) => item.userId))
        scores.value = new Map(
          classTables.scores
            .filter((score) => score.type === 2 && score.indId === currentId)
            .map((score) => [score.userId, score] as const),
        )
      } catch (err) {
        if (!cancelled) error.value = getErrorMessage(err, '加载批改数据失败')
      } finally {
        if (!cancelled) loading.value = false
      }
    }
    void run()
  },
  { immediate: true },
)

const studentsById = computed(
  () =>
    new Map((syncData.value?.students ?? []).map((student) => [student.id, student] as const)),
)

const gradeStudents = computed<GradeStudent[]>(() => {
  if (!syncData.value || !tables.value) return []

  const userIdByNo = new Map(
    tables.value.students.map((student) => [student.studentId, student.userId] as const),
  )

  const latestByPerson = new Map<number, ZjuamHomeworkSubmission>()
  for (const submission of syncData.value.submissions) {
    const personId = submission.created_by?.id
    if (personId == null) continue
    const existing = latestByPerson.get(personId)
    if (!existing || submissionTime(submission) > submissionTime(existing)) {
      latestByPerson.set(personId, submission)
    }
  }

  const list: GradeStudent[] = []
  for (const personId of latestByPerson.keys()) {
    const upstream = studentsById.value.get(personId)
    const studentId = upstream?.studentId ?? ''
    const userId = studentId ? (userIdByNo.get(studentId) ?? null) : null
    list.push({
      personId,
      userId,
      name: upstream?.name ?? String(personId),
      studentId,
      score: userId ? (scores.value.get(userId) ?? null) : null,
    })
  }
  list.sort((a, b) => a.studentId.localeCompare(b.studentId))
  return list
})

watch(gradeStudents, (students) => {
  const fromHash = readHashStudent(students)
  if (fromHash) {
    selectedPersonId.value = fromHash.personId
    return
  }
  const current = selectedPersonId.value
  if (current != null && students.some((student) => student.personId === current)) return
  const firstUngraded = students.find((student) => student.score == null)
  selectedPersonId.value = (firstUngraded ?? students[0])?.personId ?? null
})

function onHashChange() {
  const student = readHashStudent(gradeStudents.value)
  if (student) selectedPersonId.value = student.personId
}

onMounted(() => {
  window.addEventListener('hashchange', onHashChange)
})

onBeforeUnmount(() => {
  window.removeEventListener('hashchange', onHashChange)
})

function selectStudent(personId: number) {
  selectedPersonId.value = personId
  const student = gradeStudents.value.find((item) => item.personId === personId)
  if (student) {
    const key = student.studentId || String(student.personId)
    window.history.replaceState(null, '', `#${encodeURIComponent(key)}`)
  }
}

const selectedStudent = computed(
  () =>
    gradeStudents.value.find((student) => student.personId === selectedPersonId.value) ?? null,
)
const gradedCount = computed(
  () => gradeStudents.value.filter((student) => student.score != null).length,
)

function handleScoreSaved(score: Score) {
  const next = new Map(scores.value)
  next.set(score.userId, score)
  scores.value = next
}

const auth = useAuthStore()
const myUserId = computed(() => auth.user?.id ?? null)
const selectedStuId = computed(() => selectedStudent.value?.userId ?? null)

function handleRemoteScore(event: ReportScoreEvent) {
  const next = new Map(scores.value)
  if (event.score) next.set(event.userId, event.score)
  else next.delete(event.userId)
  scores.value = next
  if (!event.score || event.byUserId === myUserId.value) return
  remoteSaves.value = new Map(remoteSaves.value).set(event.userId, event)
}

useReportRoom({
  experimentId: computed(() => id.value || undefined),
  studentId: selectedStuId,
  onPresence: (next) => {
    peers.value = next
  },
  onScore: handleRemoteScore,
})

const editorsByStuId = computed(() => {
  const map = new Map<string, string[]>()
  for (const peer of peers.value) {
    if (!peer.studentId || peer.userId === myUserId.value) continue
    const names = map.get(peer.studentId) ?? []
    if (!names.includes(peer.name)) names.push(peer.name)
    map.set(peer.studentId, names)
  }
  return map
})

const coEditors = computed(() =>
  selectedStuId.value ? (editorsByStuId.value.get(selectedStuId.value) ?? []) : [],
)
const coEditorsLabel = computed(() => coEditors.value.join('、'))
const saveNotice = computed(() =>
  selectedStuId.value ? (remoteSaves.value.get(selectedStuId.value) ?? null) : null,
)

const flagsByStuId = computed(() => {
  const map = new Map<string, StudentFlag>()
  for (const [userId, reason] of focusByStuId.value) {
    map.set(userId, { focusReason: reason, checkpoint: checkpointStuIds.value.has(userId) })
  }
  for (const userId of checkpointStuIds.value) {
    if (!map.has(userId)) map.set(userId, { focusReason: null, checkpoint: true })
  }
  return map
})

async function handleSync() {
  const notice = saveNotice.value
  if (!id.value || !notice) return
  const { userId } = notice
  try {
    const [review, remark] = await Promise.all([
      fetchReportReview(userId, id.value),
      fetchRemark(userId, id.value, REMARK_TYPE_REPORT),
    ])
    sync.value = {
      nonce: Date.now(),
      userId,
      ruleId: review?.ruleId ?? null,
      ruleContent: review?.ruleContent ?? null,
      remark: remark?.text ?? '',
    }
    const next = new Map(remoteSaves.value)
    next.delete(userId)
    remoteSaves.value = next
    toast.success('已同步对方成绩')
  } catch (err) {
    toast.error(getErrorMessage(err, '同步失败'))
  }
}

let coToastActive = false
watch(coEditorsLabel, (label) => {
  if (!label) {
    if (coToastActive) {
      toast.remove(CO_TOAST_ID)
      coToastActive = false
    }
    return
  }
  const message = `${label}也在批改这份报告`
  if (coToastActive) {
    toast.update(CO_TOAST_ID, {
      title: message,
      color: 'warning',
      duration: 0,
      icon: 'i-lucide-users',
    })
    return
  }
  toast.add({
    id: CO_TOAST_ID,
    title: message,
    color: 'warning',
    duration: 0,
    icon: 'i-lucide-users',
  })
  coToastActive = true
})

watch(saveNotice, (notice) => {
  toast.remove(SAVE_TOAST_ID)
  if (!notice) return
  toast.add({
    id: SAVE_TOAST_ID,
    title: `${notice.byName || '对方'}保存了这份报告的成绩`,
    description: '你可以同步成绩，同步将覆盖你当前做出的批改',
    color: 'info',
    duration: 0,
    icon: 'i-lucide-arrow-right-left',
    actions: [
      {
        label: '同步',
        color: 'primary',
        variant: 'soft',
        onClick: () => {
          void handleSync()
        },
      },
    ],
  })
})

onBeforeUnmount(() => {
  toast.remove(CO_TOAST_ID)
  toast.remove(SAVE_TOAST_ID)
})

const menuItems = computed<DropdownMenuItem[][]>(() => [
  [
    {
      label: '去向上游同步数据',
      icon: 'i-lucide-refresh-cw',
      onSelect: () => {
        if (id.value) void router.push(`/console/experiments/${id.value}/xzzd-push`)
      },
    },
    {
      label: '设置本实验评分标准',
      icon: 'i-lucide-clipboard-list',
      disabled: loading.value || !!error.value,
      onSelect: () => {
        criteriaToken.value += 1
      },
    },
  ],
])

const SPLIT_KEY = 'report-grade-layout'
const leftWidth = ref(22)
const rightWidth = ref(25)
const splitContainer = ref<HTMLElement | null>(null)
const dragging = ref<'left' | 'right' | null>(null)
let dragState: {
  side: 'left' | 'right'
  startX: number
  startLeft: number
  startRight: number
  total: number
} | null = null

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

function maxLeft() {
  return Math.max(14, Math.min(40, 70 - rightWidth.value))
}

function maxRight() {
  return Math.max(18, Math.min(45, 70 - leftWidth.value))
}

onMounted(() => {
  try {
    const raw = window.localStorage.getItem(SPLIT_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as { left?: unknown; right?: unknown }
      if (typeof parsed.left === 'number') leftWidth.value = parsed.left
      if (typeof parsed.right === 'number') rightWidth.value = parsed.right
    }
  } catch {
    // ignore malformed saved layout
  }
  leftWidth.value = clamp(leftWidth.value, 14, maxLeft())
  rightWidth.value = clamp(rightWidth.value, 18, maxRight())
})

watch([leftWidth, rightWidth], ([left, right]) => {
  try {
    window.localStorage.setItem(SPLIT_KEY, JSON.stringify({ left, right }))
  } catch {
    // storage may be unavailable
  }
})

function startResize(side: 'left' | 'right', event: PointerEvent) {
  const el = splitContainer.value
  if (!el) return
  const rect = el.getBoundingClientRect()
  if (rect.width <= 0) return
  dragState = {
    side,
    startX: event.clientX,
    startLeft: leftWidth.value,
    startRight: rightWidth.value,
    total: rect.width,
  }
  dragging.value = side
  window.addEventListener('pointermove', onResizeMove)
  window.addEventListener('pointerup', endResize, { once: true })
  event.preventDefault()
}

function onResizeMove(event: PointerEvent) {
  const state = dragState
  if (!state) return
  const delta = ((event.clientX - state.startX) / state.total) * 100
  if (state.side === 'left') {
    leftWidth.value = clamp(state.startLeft + delta, 14, Math.min(40, 70 - rightWidth.value))
  } else {
    rightWidth.value = clamp(state.startRight - delta, 18, Math.min(45, 70 - leftWidth.value))
  }
}

function endResize() {
  dragState = null
  dragging.value = null
  window.removeEventListener('pointermove', onResizeMove)
}

function onResizeKey(side: 'left' | 'right', event: KeyboardEvent) {
  if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
  event.preventDefault()
  const delta = event.key === 'ArrowLeft' ? -2 : 2
  if (side === 'left') {
    leftWidth.value = clamp(leftWidth.value + delta, 14, Math.min(40, 70 - rightWidth.value))
  } else {
    rightWidth.value = clamp(rightWidth.value - delta, 18, Math.min(45, 70 - leftWidth.value))
  }
}

onBeforeUnmount(() => {
  window.removeEventListener('pointermove', onResizeMove)
})

function submissionTime(submission: ZjuamHomeworkSubmission): number {
  const time = submission.created_at ? Date.parse(submission.created_at) : Number.NaN
  return Number.isFinite(time) ? time : submission.id
}

function readHashStudent(students: GradeStudent[]): GradeStudent | null {
  const raw = window.location.hash.replace(/^#/, '')
  if (!raw) return null
  let value = raw
  try {
    value = decodeURIComponent(raw)
  } catch {
    value = raw
  }
  return (
    students.find(
      (student) =>
        student.studentId === value ||
        String(student.personId) === value ||
        student.userId === value ||
        student.name === value,
    ) ?? null
  )
}
</script>

<template>
  <div v-if="id" class="flex h-dvh flex-col overflow-hidden">
    <header
      class="flex h-14 shrink-0 items-center gap-3 border-b border-line bg-elevated/60 px-4 backdrop-blur-xl"
    >
      <RouterLink
        to="/console/reports"
        class="inline-flex items-center gap-1 text-xs font-semibold text-fg-subtle transition-colors hover:text-fg"
      >
        <UIcon name="i-lucide-arrow-left" class="size-3.5 shrink-0" />
        返回
      </RouterLink>
      <div class="h-5 w-px bg-line" />
      <div class="min-w-0 flex-1 truncate text-sm font-bold">
        {{ experiment ? `${experiment.mark} · ${experiment.title}` : '报告批改' }}
      </div>
      <span v-if="gradeStudents.length > 0" class="tabular shrink-0 text-xs text-fg-subtle">
        已批改 <span class="font-semibold text-fg">{{ gradedCount }}</span> /
        {{ gradeStudents.length }}
      </span>
      <UDropdownMenu :items="menuItems">
        <UButton size="sm" square color="neutral" variant="soft" aria-label="更多操作">
          <UIcon name="i-lucide-ellipsis" class="h-4 w-4 shrink-0" />
        </UButton>
      </UDropdownMenu>
    </header>

    <div
      v-if="loading"
      class="flex min-h-0 flex-1 items-center justify-center gap-2 text-xs text-fg-subtle"
    >
      <Spinner size="sm" />
      正在加载批改数据…
    </div>
    <div v-else-if="error" class="flex min-h-0 flex-1 items-center justify-center p-6">
      <UAlert
        color="error"
        icon="i-lucide-circle-alert"
        :description="error ?? ''"
        class="max-w-md"
      />
    </div>
    <div v-else ref="splitContainer" class="flex min-h-0 flex-1 overflow-hidden">
      <div class="min-w-0 shrink-0 overflow-hidden" :style="{ width: `${leftWidth}%` }">
        <StudentListPanel
          :students="gradeStudents"
          :selected-person-id="selectedPersonId"
          :editors-by-stu-id="editorsByStuId"
          :flags-by-stu-id="flagsByStuId"
          @select="selectStudent"
        />
      </div>
      <div
        role="separator"
        aria-orientation="vertical"
        tabindex="0"
        class="w-1 shrink-0 cursor-col-resize bg-line transition-colors hover:bg-brand-500/60"
        :class="dragging === 'left' ? 'bg-brand-500/60' : ''"
        @pointerdown="startResize('left', $event)"
        @keydown="onResizeKey('left', $event)"
      />
      <div class="min-w-0 flex-1 overflow-hidden">
        <FilePreviewPanel :experiment-id="id" :student="selectedStudent" />
      </div>
      <div
        role="separator"
        aria-orientation="vertical"
        tabindex="0"
        class="w-1 shrink-0 cursor-col-resize bg-line transition-colors hover:bg-brand-500/60"
        :class="dragging === 'right' ? 'bg-brand-500/60' : ''"
        @pointerdown="startResize('right', $event)"
        @keydown="onResizeKey('right', $event)"
      />
      <div class="min-w-0 shrink-0 overflow-hidden" :style="{ width: `${rightWidth}%` }">
        <GradePanel
          :student="selectedStudent"
          :experiment-id="id"
          :sync="sync"
          :criteria-open-token="criteriaToken"
          @score-saved="handleScoreSaved"
        />
      </div>
    </div>
  </div>
</template>
