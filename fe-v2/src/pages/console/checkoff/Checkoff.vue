<script setup lang="ts">
import type { DropdownMenuItem } from '@nuxt/ui'
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'

import CustomCardRail from '@/components/checkoff/CustomCardRail.vue'
import DemoStep from '@/components/checkoff/DemoStep.vue'
import ExperimentPicker from '@/components/checkoff/ExperimentPicker.vue'
import MasterSlavePanel from '@/components/checkoff/MasterSlavePanel.vue'
import PreferenceOnboarding from '@/components/checkoff/PreferenceOnboarding.vue'
import QuestionDrawer, {
  type QuestionMark,
} from '@/components/checkoff/QuestionDrawer.vue'
import ScoreForm from '@/components/checkoff/ScoreForm.vue'
import SpecialDrawIntroModal from '@/components/checkoff/SpecialDrawIntroModal.vue'
import StepIndicator from '@/components/checkoff/StepIndicator.vue'
import StudentFinder from '@/components/checkoff/StudentFinder.vue'
import AvatarImage from '@/components/ui/AvatarImage.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import IconAction from '@/components/ui/IconAction.vue'
import Markdown from '@/components/ui/Markdown.vue'
import Spinner from '@/components/ui/Spinner.vue'
import {
  fetchBankQuestions,
  fetchCheckoff,
  fetchCheckoffRecords,
  fetchClassSettings,
  listBanks,
  type CheckoffExperiment,
  type CheckoffQuestion,
  type CheckoffRecord,
  type CheckoffStudent,
  type ClassSettings,
  type QuestionBank,
  type Score,
} from '@/lib/api'
import { useAuthStore } from '@/lib/auth'
import { useCheckoffBankOverride } from '@/lib/checkoff-bank'
import {
  clearCheckoffPresence,
  notifyCheckoffStarted,
  useCheckoffMaster,
  useCheckoffWatch,
  type CheckoffMeta,
  type CheckoffStartedEvent,
  type SlaveCardState,
} from '@/lib/checkoff-socket'
import {
  createDefaultCustomCards,
  type CustomCard,
} from '@/lib/custom-cards'
import { getErrorMessage } from '@/lib/error'
import { formatLocaleDateTime } from '@/lib/format'
import { SCORE_TYPES } from '@/lib/scores'
import {
  DEFAULT_SCORE_RATIO,
  resolveScoreRatio,
  type ScoreRatio,
} from '@/lib/scoring'
import {
  clearSpecialDrawMachine,
  loadSpecialDrawBanks,
  loadSpecialDrawMachine,
  runSpecialDrawMachine,
  SPECIAL_DRAW_STORAGE_KEY,
  type SpecialDrawBank,
  type SpecialDrawMachine,
} from '@/lib/special-draw'
import { useCurrentClassComputed } from '@/lib/store'
import { useTheme } from '@/lib/theme'
import { toast } from '@/lib/toast'
import { cn } from '@/lib/utils'
import {
  UAlert,
  UButton,
  UDropdownMenu,
  UIcon,
  UModal,
  USelect,
} from '@/ui'

const TYPE_LABELS = new Map<number, string>(
  SCORE_TYPES.map((type) => [type.value, type.label]),
)

const FOLLOW_BANK = '__follow__'

const auth = useAuthStore()
const route = useRoute()
const router = useRouter()

const currentClass = useCurrentClassComputed()
const classId = computed(() => currentClass.value?.id ?? null)

const experiments = ref<CheckoffExperiment[]>([])
const classSettings = ref<ClassSettings | null>(null)
const ratioError = ref(false)
const loading = ref(true)
const experiment = ref<CheckoffExperiment | null>(null)
const student = ref<CheckoffStudent | null>(null)
const questions = ref<CheckoffQuestion[]>([])
const questionsLoaded = ref(false)
const questionsError = ref<string | null>(null)
const finderReloadKey = ref(0)
const drawn = ref<CheckoffQuestion[]>([])
const marks = ref<Record<string, QuestionMark | undefined>>({})
const existingScores = ref<Score[]>([])
const step = ref(0)
const searching = ref(false)
const questionIndex = ref(0)
const records = ref<CheckoffRecord[]>([])
const recordsLoading = ref(false)
const banks = ref<QuestionBank[]>([])
const draftBank = ref<string | null>(null)
const specialMachine = ref<SpecialDrawMachine | null>(loadSpecialDrawMachine())
const specialBanks = ref<SpecialDrawBank[]>([])
const specialLoading = ref(specialMachine.value !== null)
const specialError = ref<string | null>(null)
const masterPanelVisible = ref(true)
const customCardActive = ref(false)
const selectedCustomCard = ref<CustomCard | null>(null)
const activeCustomCardSlotId = ref<string | null>(null)
const cardRailOpen = ref(false)

const prefsOpen = ref(false)
const presenceOpen = ref(false)
const bankOpen = ref(false)
const specialDrawOpen = ref(false)
const customCardOpen = ref(false)

const { bankId: bankOverrideId, save: saveBankOverride } = useCheckoffBankOverride()

const isMulti = computed(() => auth.user?.preferences?.device === 'multi')
const { session: masterSession, pushState, switchQuestion } = useCheckoffMaster(
  isMulti,
  () => auth.user?.id,
)
const { isDark } = useTheme()

const preferences = computed(() => auth.user?.preferences ?? null)
const markdownStyle = computed(() => auth.user?.preferences?.markdownStyle ?? 'github')
const theme = computed<'light' | 'dark'>(() => (isDark.value ? 'dark' : 'light'))
const drawMode = computed<'random' | 'fixed'>(() => preferences.value?.draw ?? 'random')
const questionMode = computed<'random' | 'fixed'>(() =>
  specialMachine.value ? 'random' : drawMode.value,
)
const drawCount = computed(() => preferences.value?.drawCount ?? 3)

const preselectId = computed(() =>
  typeof route.query.experiment === 'string' ? route.query.experiment : null,
)

const checkoffMeta = computed<CheckoffMeta>(() => ({
  markdownStyle: markdownStyle.value,
  theme: theme.value,
  grader: { name: auth.user?.name ?? '', avatar: auth.user?.avatar ?? null },
  student: student.value
    ? { name: student.value.name, avatar: student.value.avatar }
    : null,
}))

const scoreRatio = computed<ScoreRatio>(() =>
  experiment.value
    ? resolveScoreRatio(classSettings.value, experiment.value.id)
    : DEFAULT_SCORE_RATIO,
)

const specialQuestionList = computed<CheckoffQuestion[]>(() => {
  if (!specialMachine.value) return []
  const seen = new Set<string>()
  const list: CheckoffQuestion[] = []
  for (const bank of specialBanks.value) {
    for (const question of bank.questions) {
      if (seen.has(question.id)) continue
      seen.add(question.id)
      list.push(question)
    }
  }
  return list
})

const activeQuestions = computed(() =>
  specialMachine.value ? specialQuestionList.value : questions.value,
)
const activeQuestionsLoading = computed(() =>
  specialMachine.value ? specialLoading.value : !questionsLoaded.value,
)
const activeQuestionsError = computed(() =>
  specialMachine.value ? specialError.value : questionsError.value,
)

const customCards = computed(() => preferences.value?.customCards ?? createDefaultCustomCards())
const activeCustomCardSlots = computed(() => {
  const byId = new Map(customCards.value.cards.map((card) => [card.id, card]))
  return customCards.value.slots.flatMap((slot) => {
    const card = slot.cardId ? byId.get(slot.cardId) : null
    return card ? [{ slot, card }] : []
  })
})
const bankOverrideName = computed(
  () => banks.value.find((bank) => bank.id === bankOverrideId.value)?.name,
)

const bankSelectItems = computed(() => [
  { label: '跟随实验设置', value: FOLLOW_BANK },
  ...banks.value.map((bank) => ({ label: bank.name, value: bank.id })),
])

function pickSpecialQuestions(): CheckoffQuestion[] {
  if (!specialMachine.value) return []
  const result = runSpecialDrawMachine(specialMachine.value, specialBanks.value)
  if (result.error) {
    toast.error(result.error)
    return []
  }
  return result.questions
}

function handleCheckoffStarted(event: CheckoffStartedEvent) {
  toast.info(`${event.userName}正在验收${event.studentName}。`, undefined, { duration: 10000 })
}

const peers = useCheckoffWatch(classId, handleCheckoffStarted)

function openPresence() {
  presenceOpen.value = true
  const id = classId.value
  if (!id) return
  recordsLoading.value = true
  fetchCheckoffRecords(id)
    .then((res) => {
      records.value = res.records
    })
    .catch((error: unknown) => toast.error(getErrorMessage(error, '加载记录失败')))
    .finally(() => {
      recordsLoading.value = false
    })
}

watch(
  [classId, step],
  ([id, current]) => {
    if (id && current <= 1) clearCheckoffPresence(id)
  },
  { immediate: true },
)

watch(
  [experiment, bankOverrideId, finderReloadKey],
  ([exp, override], _old, onCleanup) => {
    if (!exp || !override) return
    let cancelled = false
    onCleanup(() => {
      cancelled = true
    })
    questionsLoaded.value = false
    questionsError.value = null
    fetchBankQuestions(override)
      .then((res) => {
        if (cancelled) return
        questions.value = res.questions.map((question) => ({
          id: question.id,
          question: question.question,
          answer: question.answer,
          user: question.user,
        }))
        questionsLoaded.value = true
      })
      .catch((error: unknown) => {
        if (cancelled) return
        questionsError.value = getErrorMessage(error, '加载题目失败')
        questionsLoaded.value = false
      })
  },
  { immediate: true },
)

watch(
  [specialMachine, finderReloadKey],
  ([machine], _old, onCleanup) => {
    if (!machine) {
      specialBanks.value = []
      specialError.value = null
      specialLoading.value = false
      return
    }
    let cancelled = false
    onCleanup(() => {
      cancelled = true
    })
    specialLoading.value = true
    specialError.value = null
    loadSpecialDrawBanks(machine)
      .then((loaded) => {
        if (cancelled) return
        specialBanks.value = loaded
      })
      .catch((error: unknown) => {
        if (cancelled) return
        specialBanks.value = []
        specialError.value = getErrorMessage(error, '加载特殊抽题题目失败')
      })
      .finally(() => {
        if (!cancelled) specialLoading.value = false
      })
  },
  { immediate: true },
)

function loadBanks() {
  listBanks()
    .then((res) => {
      banks.value = res.banks
    })
    .catch((error: unknown) => toast.error(getErrorMessage(error, '加载题目集失败')))
}

function openBankPicker() {
  bankOpen.value = true
  draftBank.value = bankOverrideId.value
  loadBanks()
}

function openSpecialDrawIntro() {
  specialDrawOpen.value = true
}

function openSpecialDrawEditor() {
  void router.push('/console/checkoff/special')
}

function applySpecialDrawMachine(machine: SpecialDrawMachine) {
  saveBankOverride(null)
  specialMachine.value = machine
  drawn.value = []
  marks.value = {}
  questionIndex.value = 0
}

function resetSpecialDraw() {
  clearSpecialDrawMachine()
  specialMachine.value = null
  specialBanks.value = []
  specialError.value = null
  specialLoading.value = false
  drawn.value = []
  marks.value = {}
  questionIndex.value = 0
  toast.success('已恢复默认抽题方式')
}

function resetBankOverride() {
  saveBankOverride(null)
  draftBank.value = null
  toast.success('已恢复默认题目集')
}

function onStorage(event: StorageEvent) {
  if (event.key !== SPECIAL_DRAW_STORAGE_KEY) return
  const next = loadSpecialDrawMachine()
  specialMachine.value = next
  if (next) saveBankOverride(null)
  drawn.value = []
  marks.value = {}
  questionIndex.value = 0
}

onMounted(() => window.addEventListener('storage', onStorage))
onUnmounted(() => window.removeEventListener('storage', onStorage))

function confirmBankOverride() {
  const next = draftBank.value
  saveBankOverride(next)
  if (next) {
    clearSpecialDrawMachine()
    specialMachine.value = null
    specialBanks.value = []
    specialError.value = null
    specialLoading.value = false
    drawn.value = []
    marks.value = {}
    questionIndex.value = 0
  }
  bankOpen.value = false
  toast.success(next ? '已切换题目集' : '已跟随实验设置')
}

watch(
  classId,
  (id, _old, onCleanup) => {
    if (!id) return
    let cancelled = false
    onCleanup(() => {
      cancelled = true
    })
    loading.value = true
    fetchCheckoff({ classId: id })
      .then((res) => {
        if (!cancelled) experiments.value = res.experiments
      })
      .catch((error: unknown) => {
        if (!cancelled) toast.error(getErrorMessage(error, '加载失败'))
      })
      .finally(() => {
        if (!cancelled) loading.value = false
      })
  },
  { immediate: true },
)

watch(
  classId,
  (id, _old, onCleanup) => {
    if (!id) return
    let cancelled = false
    onCleanup(() => {
      cancelled = true
    })
    ratioError.value = false
    fetchClassSettings(id)
      .then((res) => {
        if (!cancelled) classSettings.value = res.settings
      })
      .catch(() => {
        if (!cancelled) ratioError.value = true
      })
  },
  { immediate: true },
)

function selectExperiment(next: CheckoffExperiment) {
  experiment.value = next
  student.value = null
  drawn.value = []
  marks.value = {}
  existingScores.value = []
  questions.value = []
  questionsLoaded.value = false
  questionsError.value = null
  questionIndex.value = 0
  searching.value = false
  step.value = 1
}

watch(
  [experiment, experiments, preselectId],
  () => {
    if (experiment.value || !preselectId.value || experiments.value.length === 0) return
    const match = experiments.value.find((item) => item.id === preselectId.value)
    if (match) selectExperiment(match)
  },
  { immediate: true },
)

function selectStudent(next: CheckoffStudent, nextScores: Score[]) {
  student.value = next
  existingScores.value = nextScores
  drawn.value = []
  marks.value = {}
  questionIndex.value = 0
  searching.value = false
  step.value = 2
  if (classId.value) {
    notifyCheckoffStarted({ classId: classId.value, studentName: next.name })
  }
}

function mark(id: string, next: QuestionMark) {
  marks.value = {
    ...marks.value,
    [id]: marks.value[id] === next ? undefined : next,
  }
}

function handleSaved() {
  student.value = null
  drawn.value = []
  marks.value = {}
  existingScores.value = []
  questionIndex.value = 0
  searching.value = false
  step.value = 1
  if (classId.value) clearCheckoffPresence(classId.value)
}

function handleStep(next: number) {
  if (questionsError.value && next === 3) return
  if (next === 1) searching.value = false
  step.value = next
}

function handleQuestionIndex(index: number) {
  questionIndex.value = index
  const currentStudent = student.value
  const question = drawn.value[index]
  if (isMulti.value && currentStudent && question && !customCardActive.value) {
    switchQuestion({
      studentName: currentStudent.name,
      studentAvatar: currentStudent.avatar,
      questionAuthor: question.user?.name ?? '',
      questionAuthorAvatar: question.user?.avatar ?? null,
      index,
      total: drawn.value.length,
      content: question.question,
    })
  }
}

function showCustomCard(slotId: string, card: CustomCard) {
  selectedCustomCard.value = card
  activeCustomCardSlotId.value = slotId
  if (!isMulti.value) {
    customCardOpen.value = true
    return
  }
  customCardActive.value = true
  pushState({ kind: 'custom_card', title: '', content: card.content }, checkoffMeta.value)
  toast.success('已切换到自定义 Card')
}

function cancelCustomCard() {
  customCardActive.value = false
  selectedCustomCard.value = null
  activeCustomCardSlotId.value = null
  customCardOpen.value = false
  toast.success('已取消自定义 Card')
}

watch(customCardOpen, (open) => {
  if (!open) {
    selectedCustomCard.value = null
    activeCustomCardSlotId.value = null
  }
})

watch(
  [
    isMulti,
    customCardActive,
    step,
    searching,
    experiment,
    student,
    drawn,
    questionIndex,
    checkoffMeta,
    () => masterSession.value.token,
  ],
  () => {
    if (!isMulti.value || customCardActive.value) return
    let state: SlaveCardState
    if (step.value === 0) {
      state = {
        kind: 'idle',
        experimentMark: experiment.value?.mark ?? '',
        experimentTitle: experiment.value?.title ?? '',
      }
    } else if (step.value === 1) {
      state = searching.value
        ? { kind: 'ask_name' }
        : {
            kind: 'idle',
            experimentMark: experiment.value?.mark ?? '',
            experimentTitle: experiment.value?.title ?? '',
          }
    } else if (step.value === 2) {
      state = { kind: 'ask_demo' }
    } else if (step.value === 3) {
      const current = drawn.value[Math.min(questionIndex.value, drawn.value.length - 1)]
      if (student.value && drawn.value.length > 0) {
        state = {
          kind: 'ask_question',
          studentName: student.value.name,
          studentAvatar: student.value.avatar,
          questionAuthor: current?.user?.name ?? '',
          questionAuthorAvatar: current?.user?.avatar ?? null,
          index: questionIndex.value,
          total: drawn.value.length,
          content: current?.question ?? '',
        }
      } else {
        state = { kind: 'ask_demo' }
      }
    } else {
      state = { kind: 'thank', studentName: student.value?.name }
    }
    pushState(state, checkoffMeta.value)
  },
  { immediate: true },
)

const menuItems = computed<DropdownMenuItem[][]>(() => {
  const items: DropdownMenuItem[] = [
    { label: '现在谁正在验收', icon: 'i-lucide-users', onSelect: openPresence },
    { label: '使用其它题目集', icon: 'i-lucide-notebook-text', onSelect: openBankPicker },
    { label: '特殊的抽题方式', icon: 'i-lucide-dices', onSelect: openSpecialDrawIntro },
  ]
  if (isMulti.value) {
    items.push({
      label: masterPanelVisible.value ? '隐藏从机配对信息' : '显示从机配对信息',
      icon: masterPanelVisible.value ? 'i-lucide-eye-off' : 'i-lucide-eye',
      onSelect: () => {
        masterPanelVisible.value = !masterPanelVisible.value
      },
    })
  }
  return [items]
})

function handleQuestionsLoaded(loaded: CheckoffQuestion[]) {
  questions.value = loaded
  questionsLoaded.value = true
  questionsError.value = null
}

function handleLoadError(message: string) {
  questionsError.value = message
  questionsLoaded.value = false
}

function handleSearchFocus() {
  if (step.value === 1) searching.value = true
}

function handleSearchBlur() {
  if (step.value === 1) searching.value = false
}

function retryQuestions() {
  questionsError.value = null
  specialError.value = null
  finderReloadKey.value += 1
}
</script>

<template>
  <div class="flex h-dvh flex-col overflow-hidden">
    <header
      class="flex h-14 shrink-0 items-center gap-3 border-b border-line bg-elevated/60 px-4 backdrop-blur-xl"
    >
      <RouterLink
        to="/console"
        class="inline-flex items-center gap-1 text-xs font-semibold text-fg-subtle transition-colors hover:text-fg"
      >
        <UIcon name="i-lucide-arrow-left" class="size-3.5 shrink-0" />
        返回
      </RouterLink>
      <div class="h-5 w-px bg-line" />
      <div class="min-w-0 flex-1 truncate text-sm font-bold">验收</div>
      <div
        v-if="!auth.loading && currentClass && auth.user && auth.user.preferences"
        class="flex shrink-0 items-center gap-1"
      >
        <IconAction label="偏好" @click="prefsOpen = true">
          <UIcon name="i-lucide-settings-2" class="size-[15px] shrink-0" />
        </IconAction>
        <UDropdownMenu :items="menuItems" :content="{ side: 'bottom', align: 'end' }">
          <UButton square color="neutral" variant="ghost" aria-label="更多">
            <UIcon name="i-lucide-more-horizontal" class="size-4 shrink-0" />
          </UButton>
        </UDropdownMenu>
      </div>
    </header>

    <div class="min-h-0 flex-1 overflow-y-auto">
      <div class="mx-auto max-w-4xl px-4 py-6">
        <div v-if="auth.loading" class="flex h-64 items-center justify-center">
          <Spinner size="lg" />
        </div>

        <EmptyState
          v-else-if="!currentClass"
          icon="i-lucide-school"
          title="尚未绑定班级"
          hint="请先在设置中绑定班级"
        />

        <div v-else-if="!auth.user" />

        <div v-else-if="auth.user.preferences == null" class="flex min-h-[70vh] items-center justify-center">
          <div class="w-full max-w-xl">
            <PreferenceOnboarding :initial="null" />
          </div>
        </div>

        <template v-else>
          <div v-if="isMulti && masterPanelVisible" class="mb-4">
            <MasterSlavePanel :session="masterSession" @hide="masterPanelVisible = false" />
          </div>

          <div
            v-if="specialMachine"
            class="mb-4 flex flex-wrap items-center gap-2 rounded-xl border border-brand-500/25 bg-brand-500/5 px-3 py-2 text-xs"
          >
            <UIcon
              name="i-lucide-dices"
              class="size-[15px] shrink-0 text-brand-600 dark:text-brand-300"
            />
            <span class="font-semibold text-fg">特殊的抽题方式已启用</span>
            <div class="ml-auto flex items-center gap-1">
              <UButton size="sm" variant="ghost" @click="openSpecialDrawIntro">编辑</UButton>
              <UButton size="sm" variant="ghost" @click="resetSpecialDraw">恢复默认</UButton>
            </div>
          </div>

          <div
            v-if="bankOverrideId && !specialMachine"
            class="mb-4 flex flex-wrap items-center gap-2 rounded-xl border border-brand-500/25 bg-brand-500/5 px-3 py-2 text-xs"
          >
            <UIcon
              name="i-lucide-notebook-text"
              class="size-[15px] shrink-0 text-brand-600 dark:text-brand-300"
            />
            <span class="font-semibold text-fg">已使用其它题目集</span>
            <span v-if="bankOverrideName" class="text-fg-muted">{{ bankOverrideName }}</span>
            <div class="ml-auto flex items-center gap-1">
              <UButton size="sm" variant="ghost" @click="openBankPicker">编辑</UButton>
              <UButton size="sm" variant="ghost" @click="resetBankOverride">恢复默认</UButton>
            </div>
          </div>

          <div class="relative">
            <StepIndicator
              :step="step"
              :has-experiment="Boolean(experiment)"
              :has-student="Boolean(student)"
              @step="handleStep"
            />
            <div
              v-if="activeCustomCardSlots.length > 0"
              class="z-20 mt-3 lg:absolute lg:left-full lg:top-0 lg:ml-3 lg:mt-0"
            >
              <CustomCardRail
                :custom-cards="customCards"
                :open="cardRailOpen"
                :active-slot-id="activeCustomCardSlotId"
                :markdown-style="markdownStyle"
                @toggle="cardRailOpen = !cardRailOpen"
                @show="showCustomCard"
                @cancel="cancelCustomCard"
              />
            </div>
          </div>

          <UAlert
            v-if="ratioError"
            class="mt-4"
            color="warning"
            icon="i-lucide-triangle-alert"
            description="评分占比加载失败，总评按默认占比 2:5:0 估算，仅供参考"
          />

          <div class="mt-6">
            <div v-if="step === 0">
              <div v-if="loading" class="flex h-56 items-center justify-center">
                <Spinner size="lg" />
              </div>
              <ExperimentPicker v-else :experiments="experiments" @select="selectExperiment" />
            </div>

            <StudentFinder
              v-if="step === 1 && experiment"
              :key="experiment.id"
              :class-id="currentClass?.id ?? ''"
              :experiment-id="experiment.id"
              :reload-key="finderReloadKey"
              :include-questions="!bankOverrideId"
              @select="selectStudent"
              @questions-loaded="handleQuestionsLoaded"
              @load-error="handleLoadError"
              @search-focus="handleSearchFocus"
              @search-blur="handleSearchBlur"
            />

            <DemoStep v-if="step === 2 && experiment && student" @next="step = 3" />

            <div
              v-if="step === 3 && experiment && student && activeQuestionsError !== null"
              class="rounded-2xl border border-danger/40 bg-danger/5 p-8 text-center"
            >
              <p class="text-sm font-semibold text-danger">{{ activeQuestionsError }}</p>
              <div class="mt-4">
                <UButton
                  color="neutral" variant="soft"
                  size="sm"
                  :loading="activeQuestionsLoading"
                  @click="retryQuestions"
                >
                  重试
                </UButton>
              </div>
            </div>

            <QuestionDrawer
              v-if="step === 3 && experiment && student && activeQuestionsError === null"
              v-model:drawn="drawn"
              :mode="questionMode"
              :questions="activeQuestions"
              :marks="marks"
              :draw-count="drawCount"
              :draw-questions="specialMachine ? pickSpecialQuestions : undefined"
              :student="student"
              :loading="activeQuestionsLoading"
              :question-index="questionIndex"
              :show-pager="isMulti"
              @mark="mark"
              @question-index="handleQuestionIndex"
              @next="step = 4"
              @skip="step = 4"
            />

            <ScoreForm
              v-if="step === 4 && experiment && student"
              :experiment-id="experiment.id"
              :student="student"
              :marks="marks"
              :existing-scores="existingScores"
              :ratio="scoreRatio"
              @saved="handleSaved"
            />
          </div>
        </template>
      </div>
    </div>

    <UModal v-model:open="prefsOpen" :ui="{ content: 'sm:max-w-3xl' }">
      <template #body>
        <PreferenceOnboarding
          :initial="preferences"
          layout="rows"
          @saved="prefsOpen = false"
          @cancel="prefsOpen = false"
        />
      </template>
    </UModal>

    <UModal
      v-model:open="customCardOpen"
      title="自定义 Card"
      :ui="{ content: 'sm:max-w-2xl' }"
    >
      <template #body>
        <Markdown
          v-if="selectedCustomCard?.content.trim()"
          :text="selectedCustomCard.content"
        />
        <p v-else class="py-8 text-center text-sm text-fg-subtle">这张 Card 暂无内容</p>
      </template>
    </UModal>

    <UModal
      v-model:open="presenceOpen"
      title="现在谁正在验收"
      :ui="{ content: 'sm:max-w-lg' }"
    >
      <template #body>
        <div class="flex flex-col gap-5">
          <section class="flex flex-col gap-2">
            <div class="text-xs font-semibold tracking-wider text-fg-subtle">
              正在线上 {{ peers.length }}
            </div>
            <p
              v-if="peers.length === 0"
              class="rounded-xl border border-dashed border-line py-4 text-center text-xs text-fg-subtle"
            >
              暂无其他人在验收页
            </p>
            <div
              v-for="peer in peers"
              v-else
              :key="peer.userId"
              class="flex items-center gap-3 rounded-xl border border-line bg-sunken px-3 py-2"
            >
              <AvatarImage :id="peer.avatar" :size="32">
                <template #fallback>{{ peer.name.slice(0, 1) }}</template>
              </AvatarImage>
              <div class="min-w-0 flex-1 truncate text-sm font-semibold text-fg">
                {{ peer.name }}
                <span v-if="peer.userId === auth.user?.id" class="ml-1 text-xs font-normal text-fg-subtle"
                  >（我）</span
                >
              </div>
              <span
                :class="
                  cn(
                    'shrink-0 text-xs',
                    peer.studentName
                      ? 'font-medium text-brand-600 dark:text-brand-300'
                      : 'text-fg-subtle',
                  )
                "
              >
                {{ peer.studentName ? `正在验收 ${peer.studentName}` : '空闲' }}
              </span>
            </div>
          </section>

          <section class="flex flex-col gap-2">
            <div class="text-xs font-semibold tracking-wider text-fg-subtle">最近保存</div>
            <div v-if="recordsLoading" class="flex justify-center py-4">
              <Spinner size="sm" />
            </div>
            <p
              v-else-if="records.length === 0"
              class="rounded-xl border border-dashed border-line py-4 text-center text-xs text-fg-subtle"
            >
              暂无记录
            </p>
            <div
              v-for="(record, index) in records"
              v-else
              :key="`${record.userId}-${record.type}-${record.updatedAt}-${index}`"
              class="flex items-center gap-3 rounded-xl border border-line px-3 py-2"
            >
              <div class="min-w-0 flex-1">
                <div class="truncate text-sm font-semibold text-fg">
                  {{ record.studentName }}
                </div>
                <div class="truncate text-xs text-fg-muted">
                  {{ record.experimentMark ? `${record.experimentMark} · ` : ''
                  }}{{ record.experimentTitle }} ·
                  {{ TYPE_LABELS.get(record.type) ?? record.type }}
                </div>
              </div>
              <div class="shrink-0 text-right">
                <div class="tabular text-sm font-bold text-fg">{{ record.score }}</div>
                <div class="text-[11px] text-fg-subtle">
                  {{ record.graderName ?? '—' }} · {{ formatLocaleDateTime(record.updatedAt) }}
                </div>
              </div>
            </div>
          </section>
        </div>
      </template>
    </UModal>

    <UModal
      v-model:open="bankOpen"
      title="使用其它题目集"
      :ui="{ content: 'sm:max-w-md' }"
    >
      <template #body>
        <div class="flex flex-col gap-3">
          <p class="text-xs text-fg-subtle">
            选择后将覆盖实验设定的题目集；此设置仅保存在当前设备。
          </p>
          <USelect
            aria-label="题目集"
            class="w-full"
            placeholder="跟随实验设置"
            :model-value="draftBank ?? FOLLOW_BANK"
            :items="bankSelectItems"
            @update:model-value="
              (value) => {
                draftBank = value == null || value === FOLLOW_BANK ? null : String(value)
              }
            "
          />
        </div>
      </template>
      <template #footer>
        <UButton color="neutral" variant="soft" @click="bankOpen = false">取消</UButton>
        <UButton @click="confirmBankOverride">保存</UButton>
      </template>
    </UModal>

    <SpecialDrawIntroModal
      v-model:open="specialDrawOpen"
      @edit="openSpecialDrawEditor"
      @applied="applySpecialDrawMachine"
    />
  </div>
</template>