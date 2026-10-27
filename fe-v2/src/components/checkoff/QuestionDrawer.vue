<script lang="ts">
export type QuestionMark = 'correct' | 'partial' | 'wrong'
</script>

<script setup lang="ts">
import { onUnmounted, ref } from 'vue'

import AvatarImage from '@/components/ui/AvatarImage.vue'
import IconAction from '@/components/ui/IconAction.vue'
import Markdown from '@/components/ui/Markdown.vue'
import Spinner from '@/components/ui/Spinner.vue'
import type { CheckoffQuestion, CheckoffStudent, QuestionUser } from '@/lib/api'
import { cn } from '@/lib/utils'
import { UButton, UIcon } from '@/ui'

const props = withDefaults(
  defineProps<{
    mode: 'random' | 'fixed'
    questions: CheckoffQuestion[]
    drawn: CheckoffQuestion[]
    marks: Record<string, QuestionMark | undefined>
    student: CheckoffStudent
    loading?: boolean
    questionIndex?: number
    showPager?: boolean
    drawCount?: number
    drawQuestions?: (questions: CheckoffQuestion[]) => CheckoffQuestion[]
  }>(),
  {
    loading: false,
    questionIndex: 0,
    showPager: false,
    drawCount: 3,
  },
)

const emit = defineEmits<{
  'update:drawn': [drawn: CheckoffQuestion[]]
  mark: [id: string, mark: QuestionMark]
  next: []
  skip: []
  questionIndex: [index: number]
}>()

const MARKS: {
  key: QuestionMark
  label: string
  icon: string
  idle: string
  active: string
}[] = [
  {
    key: 'correct',
    label: '对',
    icon: 'i-lucide-check',
    idle: 'border-line text-fg-muted hover:border-emerald-500/50 hover:text-emerald-500',
    active:
      'border-emerald-500 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
  },
  {
    key: 'partial',
    label: '半对',
    icon: 'i-lucide-minus',
    idle: 'border-line text-fg-muted hover:border-amber-500/50 hover:text-amber-500',
    active: 'border-amber-500 bg-amber-500/10 text-amber-600 dark:text-amber-400',
  },
  {
    key: 'wrong',
    label: '错',
    icon: 'i-lucide-x',
    idle: 'border-line text-fg-muted hover:border-red-500/50 hover:text-red-500',
    active: 'border-red-500 bg-red-500/10 text-red-600 dark:text-red-400',
  },
]

function shuffle<T>(items: T[]): T[] {
  const copy = [...items]
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[copy[i], copy[j]] = [copy[j], copy[i]]
  }
  return copy
}

function authorName(user?: QuestionUser): string {
  return user?.name || '未知'
}

const drawing = ref(false)
const revealed = ref<Record<string, boolean>>({})
let drawArmed = false
let drawTimer: ReturnType<typeof setTimeout> | null = null

function draw() {
  if (props.questions.length === 0) return
  drawing.value = true
  drawArmed = true
  if (drawTimer) clearTimeout(drawTimer)
  drawTimer = setTimeout(() => {
    drawTimer = null
    if (!drawArmed) return
    drawArmed = false
    const count = Math.min(props.drawCount, props.questions.length)
    emit(
      'update:drawn',
      props.drawQuestions ? props.drawQuestions(props.questions) : shuffle(props.questions).slice(0, count),
    )
    drawing.value = false
  }, 600)
}

function toggleReveal(id: string) {
  revealed.value = { ...revealed.value, [id]: !revealed.value[id] }
}

function toggleFixed(question: CheckoffQuestion) {
  if (props.drawn.some((item) => item.id === question.id)) {
    emit(
      'update:drawn',
      props.drawn.filter((item) => item.id !== question.id),
    )
  } else {
    emit('update:drawn', [...props.drawn, question])
  }
}

function goToQuestion(index: number) {
  emit('questionIndex', index)
}

function markClass(id: string, meta: (typeof MARKS)[number]): string {
  return props.marks[id] === meta.key ? meta.active : meta.idle
}

onUnmounted(() => {
  if (drawTimer) clearTimeout(drawTimer)
})
</script>

<template>
  <div>
    <div class="mb-4 flex items-center gap-3 rounded-2xl border border-line bg-elevated px-4 py-3">
      <AvatarImage :id="props.student.avatar" :size="36">
        <template #fallback>{{ props.student.name.slice(0, 1) }}</template>
      </AvatarImage>
      <div class="min-w-0 flex-1">
        <span class="font-semibold text-fg">{{ props.student.name }}</span>
        <span class="tabular ml-2 text-xs text-fg-muted">{{ props.student.studentId }}</span>
      </div>
      <span
        class="rounded-lg border border-line bg-sunken px-2.5 py-1 text-[11px] font-semibold text-fg-muted"
      >
        {{ props.drawn.length }} 题
      </span>
    </div>

    <div v-if="props.loading" class="flex h-56 items-center justify-center">
      <Spinner size="lg" />
    </div>

    <template v-else-if="props.questions.length === 0">
      <div class="rounded-2xl border border-dashed border-line p-12 text-center">
        <div
          class="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-sunken text-fg-subtle"
        >
          <UIcon name="i-lucide-help-circle" class="size-5 shrink-0" />
        </div>
        <div class="mt-3 text-sm font-semibold text-fg">该实验暂无题目</div>
        <div class="mt-1 text-xs text-fg-subtle">可跳过抽题，直接录入成绩</div>
      </div>
      <div class="mt-5 flex items-center justify-between gap-3">
        <UButton size="sm" variant="ghost" @click="emit('skip')">
          <UIcon name="i-lucide-skip-forward" class="size-3.5 shrink-0" />
          跳过抽题
        </UButton>
        <UButton
          size="lg"
          class="bg-gradient-to-r from-brand-600 to-brand-700 shadow-lg shadow-brand-600/25"
          @click="emit('next')"
        >
          录入成绩
          <UIcon name="i-lucide-arrow-right" class="size-4 shrink-0" />
        </UButton>
      </div>
    </template>

    <template v-else-if="props.mode === 'random'">
      <div v-if="props.drawn.length === 0">
        <button
          type="button"
          class="flex w-full flex-col items-center gap-4 rounded-3xl border-2 border-dashed border-line py-16 transition-colors hover:border-brand-500/40 hover:bg-brand-500/5"
          @click="draw"
        >
          <div
            :class="
              cn(
                'rounded-2xl bg-gradient-to-br from-brand-500 to-brand-700 p-4 text-white shadow-lg shadow-brand-600/30 transition-transform',
                drawing && 'animate-spin',
              )
            "
          >
            <UIcon name="i-lucide-dices" class="size-7 shrink-0" />
          </div>
          <span class="text-sm font-semibold text-fg-muted">
            {{ drawing ? '抽取中…' : '现场抽题' }}
          </span>
        </button>
        <div class="mt-5 flex items-center justify-between gap-3">
          <UButton size="sm" variant="ghost" @click="emit('skip')">
            <UIcon name="i-lucide-skip-forward" class="size-3.5 shrink-0" />
            跳过抽题
          </UButton>
          <UButton
            size="lg"
            class="bg-gradient-to-r from-brand-600 to-brand-700 shadow-lg shadow-brand-600/25"
            @click="emit('next')"
          >
            录入成绩
            <UIcon name="i-lucide-arrow-right" class="size-4 shrink-0" />
          </UButton>
        </div>
      </div>

      <template v-else>
        <div class="space-y-3">
          <div
            v-for="(question, i) in props.drawn"
            :key="question.id"
            :class="
              cn(
                'animate-fade-up rounded-2xl border border-line bg-elevated p-5',
                props.showPager && i === props.questionIndex && 'border-brand-500 ring-2 ring-brand-500/40',
              )
            "
          >
            <div class="flex items-start gap-3">
              <span
                class="tabular mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-gradient-to-br from-brand-500/15 to-amber-500/10 text-xs font-bold text-brand-600 dark:text-brand-300"
              >
                {{ i + 1 }}
              </span>
              <div class="min-w-0 flex-1 text-sm leading-relaxed text-fg">
                <Markdown :text="question.question" />
                <div class="mt-1.5 flex items-center gap-1.5 text-[11px] font-normal text-fg-subtle">
                  <AvatarImage :id="question.user?.avatar ?? null" :size="18">
                    <template #fallback>{{ authorName(question.user).slice(0, 1) }}</template>
                  </AvatarImage>
                  <span>命题人：{{ authorName(question.user) }}</span>
                </div>
              </div>
            </div>
            <div class="mt-4 flex flex-wrap items-center gap-2 pl-9">
              <button
                v-for="meta in MARKS"
                :key="meta.key"
                type="button"
                :class="
                  cn(
                    'flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-semibold transition-all active:scale-95',
                    markClass(question.id, meta),
                  )
                "
                @click="emit('mark', question.id, meta.key)"
              >
                <UIcon :name="meta.icon" class="size-[13px] shrink-0" />
                {{ meta.label }}
              </button>
            </div>
            <div class="mt-3 pl-9">
              <div class="flex flex-col gap-2">
                <IconAction
                  :label="revealed[question.id] ? '隐藏答案' : '显示答案'"
                  @click="toggleReveal(question.id)"
                >
                  <UIcon
                    :name="revealed[question.id] ? 'i-lucide-eye-off' : 'i-lucide-eye'"
                    class="size-3.5 shrink-0"
                  />
                </IconAction>
                <div v-if="revealed[question.id]" class="overflow-hidden">
                  <div class="rounded-xl bg-sunken p-4">
                    <Markdown :text="question.answer" />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div
          :class="
            cn(
              'mt-4 flex',
              props.showPager && props.drawn.length > 0
                ? 'items-center justify-between'
                : 'justify-end',
            )
          "
        >
          <div v-if="props.showPager && props.drawn.length > 0" class="flex items-center gap-1.5">
            <UButton
              square
              size="sm"
              variant="ghost"
              :disabled="props.questionIndex === 0"
              aria-label="上一题"
              @click="goToQuestion(Math.max(0, props.questionIndex - 1))"
            >
              <UIcon name="i-lucide-chevron-left" class="size-[15px] shrink-0" />
            </UButton>
            <div class="flex gap-1.5">
              <button
                v-for="(question, i) in props.drawn"
                :key="question.id"
                type="button"
                :class="
                  cn(
                    'h-2 rounded-full transition-all duration-300',
                    i === props.questionIndex ? 'w-6 bg-brand-500' : 'w-2 bg-line hover:bg-fg-subtle',
                  )
                "
                :aria-label="`第 ${i + 1} 题`"
                @click="goToQuestion(i)"
              />
            </div>
            <UButton
              square
              size="sm"
              variant="ghost"
              :disabled="props.questionIndex >= props.drawn.length - 1"
              aria-label="下一题"
              @click="goToQuestion(Math.min(props.drawn.length - 1, props.questionIndex + 1))"
            >
              <UIcon name="i-lucide-chevron-right" class="size-[15px] shrink-0" />
            </UButton>
          </div>
          <UButton variant="ghost" size="sm" :loading="drawing" @click="draw">
            <UIcon name="i-lucide-shuffle" class="size-3.5 shrink-0" />
            重新抽题
          </UButton>
        </div>

        <div class="mt-5 flex items-center justify-between gap-3">
          <UButton size="sm" variant="ghost" @click="emit('skip')">
            <UIcon name="i-lucide-skip-forward" class="size-3.5 shrink-0" />
            跳过抽题
          </UButton>
          <UButton
            size="lg"
            class="bg-gradient-to-r from-brand-600 to-brand-700 shadow-lg shadow-brand-600/25"
            @click="emit('next')"
          >
            录入成绩
            <UIcon name="i-lucide-arrow-right" class="size-4 shrink-0" />
          </UButton>
        </div>
      </template>
    </template>

    <template v-else>
      <div class="space-y-2">
        <div
          v-for="question in props.questions"
          :key="question.id"
          :class="
            cn(
              'rounded-2xl border p-4 transition-colors',
              props.drawn.some((item) => item.id === question.id)
                ? 'border-brand-500/50 bg-brand-500/5'
                : 'border-line bg-elevated',
              props.showPager &&
                props.drawn.findIndex((item) => item.id === question.id) === props.questionIndex &&
                'ring-2 ring-brand-500/40',
            )
          "
        >
          <button
            type="button"
            class="flex w-full items-start gap-3 text-left"
            @click="toggleFixed(question)"
          >
            <span
              :class="
                cn(
                  'mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border transition-colors',
                  props.drawn.some((item) => item.id === question.id)
                    ? 'border-brand-500 bg-brand-500 text-white'
                    : 'border-line bg-elevated text-transparent',
                )
              "
            >
              <UIcon name="i-lucide-check" class="size-3 shrink-0" />
            </span>
            <span class="min-w-0 flex-1 text-sm leading-relaxed text-fg">
              <Markdown :text="question.question" />
            </span>
            <span
              v-if="props.drawn.some((item) => item.id === question.id)"
              class="tabular flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-gradient-to-br from-brand-500/15 to-amber-500/10 text-xs font-bold text-brand-600 dark:text-brand-300"
            >
              {{ props.drawn.findIndex((item) => item.id === question.id) + 1 }}
            </span>
          </button>

          <div class="mt-2 flex items-center gap-1.5 pl-8 text-[11px] font-normal text-fg-subtle">
            <AvatarImage :id="question.user?.avatar ?? null" :size="18">
              <template #fallback>{{ authorName(question.user).slice(0, 1) }}</template>
            </AvatarImage>
            <span>命题人：{{ authorName(question.user) }}</span>
          </div>

          <template v-if="props.drawn.some((item) => item.id === question.id)">
            <div class="mt-3 pl-8">
              <div class="flex gap-2">
                <button
                  v-for="meta in MARKS"
                  :key="meta.key"
                  type="button"
                  :class="
                    cn(
                      'flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-semibold transition-all active:scale-95',
                      markClass(question.id, meta),
                    )
                  "
                  @click="emit('mark', question.id, meta.key)"
                >
                  <UIcon :name="meta.icon" class="size-[13px] shrink-0" />
                  {{ meta.label }}
                </button>
              </div>
              <div class="mt-3 flex flex-col gap-2">
                <IconAction
                  :label="revealed[question.id] ? '隐藏答案' : '显示答案'"
                  @click="toggleReveal(question.id)"
                >
                  <UIcon
                    :name="revealed[question.id] ? 'i-lucide-eye-off' : 'i-lucide-eye'"
                    class="size-3.5 shrink-0"
                  />
                </IconAction>
                <div v-if="revealed[question.id]" class="overflow-hidden">
                  <div class="rounded-xl bg-sunken p-4">
                    <Markdown :text="question.answer" />
                  </div>
                </div>
              </div>
            </div>
          </template>
        </div>
      </div>

      <div v-if="props.showPager && props.drawn.length > 0" class="mt-4 flex items-center gap-1.5">
        <UButton
          square
          size="sm"
          variant="ghost"
          :disabled="props.questionIndex === 0"
          aria-label="上一题"
          @click="goToQuestion(Math.max(0, props.questionIndex - 1))"
        >
          <UIcon name="i-lucide-chevron-left" class="size-[15px] shrink-0" />
        </UButton>
        <div class="flex gap-1.5">
          <button
            v-for="(question, i) in props.drawn"
            :key="question.id"
            type="button"
            :class="
              cn(
                'h-2 rounded-full transition-all duration-300',
                i === props.questionIndex ? 'w-6 bg-brand-500' : 'w-2 bg-line hover:bg-fg-subtle',
              )
            "
            :aria-label="`第 ${i + 1} 题`"
            @click="goToQuestion(i)"
          />
        </div>
        <UButton
          square
          size="sm"
          variant="ghost"
          :disabled="props.questionIndex >= props.drawn.length - 1"
          aria-label="下一题"
          @click="goToQuestion(Math.min(props.drawn.length - 1, props.questionIndex + 1))"
        >
          <UIcon name="i-lucide-chevron-right" class="size-[15px] shrink-0" />
        </UButton>
      </div>

      <div class="mt-5 flex items-center justify-between gap-3">
        <UButton size="sm" variant="ghost" @click="emit('skip')">
          <UIcon name="i-lucide-skip-forward" class="size-3.5 shrink-0" />
          跳过抽题
        </UButton>
        <UButton
          size="lg"
          class="bg-gradient-to-r from-brand-600 to-brand-700 shadow-lg shadow-brand-600/25"
          @click="emit('next')"
        >
          录入成绩
          <UIcon name="i-lucide-arrow-right" class="size-4 shrink-0" />
        </UButton>
      </div>
    </template>
  </div>
</template>
