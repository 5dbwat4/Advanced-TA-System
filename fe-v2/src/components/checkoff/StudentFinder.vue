<script setup lang="ts">
import { computed, ref, watch } from 'vue'

import AvatarImage from '@/components/ui/AvatarImage.vue'
import Spinner from '@/components/ui/Spinner.vue'
import {
  fetchCheckoff,
  type CheckoffQuestion,
  type CheckoffStudent,
  type Score,
} from '@/lib/api'
import { getErrorMessage } from '@/lib/error'
import { matchStudent } from '@/lib/pinyin'
import { toast } from '@/lib/toast'
import { UBadge, UIcon, UInput } from '@/ui'

const props = withDefaults(
  defineProps<{
    classId: string
    experimentId: string
    reloadKey?: number
    includeQuestions?: boolean
  }>(),
  {
    reloadKey: 0,
    includeQuestions: false,
  },
)

const emit = defineEmits<{
  select: [student: CheckoffStudent, scores: Score[]]
  questionsLoaded: [questions: CheckoffQuestion[]]
  loadError: [message: string]
  searchFocus: []
  searchBlur: []
}>()

const SUMMARY_LABELS: Record<number, string> = {
  0: '功能',
  1: '问答',
  2: '报告',
}

function summaryFor(scores: Score[]): string | null {
  if (scores.length === 0) return null
  return scores
    .map((score) => `${SUMMARY_LABELS[score.type] ?? score.type} ${score.score}`)
    .join(' · ')
}

const query = ref('')
const students = ref<CheckoffStudent[]>([])
const scores = ref<Score[]>([])
const loading = ref(true)

watch(
  [() => props.classId, () => props.experimentId, () => props.reloadKey, () => props.includeQuestions],
  ([classId, experimentId, , includeQuestions], _old, onCleanup) => {
    let cancelled = false
    onCleanup(() => {
      cancelled = true
    })
    loading.value = true
    fetchCheckoff({ classId, experimentId, includeQuestions })
      .then((res) => {
        if (cancelled) return
        students.value = res.students
        scores.value = res.scores
        if (includeQuestions) emit('questionsLoaded', res.questions ?? [])
      })
      .catch((error: unknown) => {
        if (cancelled) return
        const message = getErrorMessage(error, '加载名单失败')
        toast.error(message)
        if (includeQuestions) emit('loadError', getErrorMessage(error, '加载题目失败'))
      })
      .finally(() => {
        if (!cancelled) loading.value = false
      })
  },
  { immediate: true },
)

const filtered = computed(() =>
  students.value.filter((student) => matchStudent(query.value, student)),
)

function scoreFor(student: CheckoffStudent): Score[] {
  return scores.value.filter((score) => score.userId === student.userId)
}
</script>

<template>
  <div>
    <div
      class="animate-fade-up relative"
      @focusin="emit('searchFocus')"
      @focusout="emit('searchBlur')"
    >
      <UInput
        v-model="query"
        icon="i-lucide-scan-search"
        placeholder="输入姓名、学号、拼音或首字母搜索"
        aria-label="搜索学生"
        autofocus
        class="tabular w-full"
        size="lg"
        :ui="{ base: 'pl-11 pr-11 py-3.5 text-sm' }"
      >
        <template #trailing>
          <Spinner v-if="loading" size="sm" />
          <span v-else class="tabular pointer-events-none text-xs text-fg-subtle">
            {{ filtered.length }}/{{ students.length }}
          </span>
        </template>
      </UInput>
    </div>

    <div class="mt-4 space-y-2">
      <button
        v-for="(item, i) in filtered"
        :key="item.userId"
        type="button"
        class="animate-fade-up flex w-full items-center gap-4 rounded-2xl border border-line bg-elevated p-4 text-left transition-all hover:border-brand-500/40 hover:shadow-lg hover:shadow-brand-500/5"
        :style="{ animationDelay: `${Math.min(i, 8) * 30}ms` }"
        @click="emit('select', item, scoreFor(item))"
      >
        <AvatarImage
          v-if="item.avatar != null"
          :id="item.avatar"
          :size="44"
        >
          <template #fallback>{{ item.name.slice(0, 1) }}</template>
        </AvatarImage>
        <div
          v-else
          class="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-brand-500/15 to-amber-500/10 text-sm font-bold text-brand-600 dark:text-brand-300"
        >
          {{ item.name.slice(0, 1) }}
        </div>
        <div class="min-w-0 flex-1">
          <div class="truncate font-semibold text-fg">{{ item.name }}</div>
          <div class="tabular mt-0.5 text-xs text-fg-muted">{{ item.studentId }}</div>
        </div>
        <UBadge
          v-if="summaryFor(scoreFor(item))"
          size="sm"
          variant="soft"
          color="primary"
          class="tabular"
        >
          {{ summaryFor(scoreFor(item)) }}
        </UBadge>
        <UIcon v-else name="i-lucide-chevron-right" class="size-[18px] shrink-0 text-fg-subtle" />
      </button>

      <p v-if="!loading && filtered.length === 0" class="py-10 text-center text-sm text-fg-subtle">
        {{ query ? `未找到与“${query}”匹配的学生` : '暂无学生' }}
      </p>
    </div>
  </div>
</template>
