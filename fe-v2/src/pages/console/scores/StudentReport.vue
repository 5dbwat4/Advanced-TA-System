<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import EmptyState from '@/components/ui/EmptyState.vue'
import PageHeader from '@/components/ui/PageHeader.vue'
import Spinner from '@/components/ui/Spinner.vue'
import { getErrorMessage } from '@/lib/error'
import { SCORE_TYPES } from '@/lib/scores'
import {
  loadStudentCases,
  type StudentCase,
  type StudentCaseSet,
} from '@/lib/student-cases'
import { useCurrentClassComputed } from '@/lib/store'
import { UButton, UIcon } from '@/ui'

type Deduction = {
  rule: string
  detail: string
  score: number
  appendix: string
  section: string
}

const route = useRoute()
const router = useRouter()
const currentClass = useCurrentClassComputed()
const classId = computed(() => currentClass.value?.id ?? null)
const userId = computed(() => {
  const value = route.params.userId
  return typeof value === 'string' ? value : null
})

const data = ref<StudentCaseSet | null>(null)
const loading = ref(true)
const error = ref<string | null>(null)
let requestId = 0

async function load() {
  const cid = classId.value
  const uid = userId.value
  if (!cid || !uid) {
    loading.value = false
    return
  }
  const current = ++requestId
  loading.value = true
  error.value = null
  try {
    const result = await loadStudentCases(cid, uid)
    if (current !== requestId) return
    data.value = result
  } catch (err) {
    if (current === requestId) error.value = getErrorMessage(err, '加载学生信息失败')
  } finally {
    if (current === requestId) loading.value = false
  }
}

watch([classId, userId], () => void load(), { immediate: true })

const reportAverage = computed(() => {
  if (!data.value) return null
  const values = data.value.cases
    .map((item) => item.scores.find((score) => score.type === 2)?.score)
    .filter((score): score is number => score != null)
  if (values.length === 0) return null
  return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length)
})

function scoreFor(item: StudentCase, type: number): number | null {
  return item.scores.find((score) => score.type === type)?.score ?? null
}

function deductionsFor(item: StudentCase): Deduction[] {
  const groups = item.report?.groups ?? []
  return groups.flatMap<Deduction>((group) =>
    group.kind === 'card'
      ? [
          {
            rule: group.card.rule,
            detail: group.card.detail,
            score: group.card.score,
            appendix: group.card.appendix,
            section: '',
          },
        ]
      : group.cards.map((card) => ({
          rule: card.rule,
          detail: card.detail,
          score: card.score,
          appendix: card.appendix,
          section: group.title,
        })),
  )
}

function printReport() {
  window.print()
}
</script>

<template>
  <div v-if="loading" class="flex min-h-[60vh] items-center justify-center gap-2 text-xs text-fg-subtle">
    <Spinner size="sm" />
    正在加载学生信息…
  </div>

  <div v-else-if="error || !data" class="mx-auto max-w-4xl">
    <UButton
      variant="ghost"
      size="sm"
      class="mb-3"
      @click="router.push('/console/scores')"
    >
      <UIcon name="i-lucide-arrow-left" class="h-[15px] w-[15px] shrink-0" />
      返回分数和名单
    </UButton>
    <div class="rounded-2xl border border-dashed border-danger/40 p-10 text-center text-sm text-danger">
      {{ error ?? '未找到该学生' }}
    </div>
  </div>

  <div v-else class="mx-auto max-w-4xl">
    <UButton
      variant="ghost"
      size="sm"
      class="mb-3"
      @click="router.push('/console/scores')"
    >
      <UIcon name="i-lucide-arrow-left" class="h-[15px] w-[15px] shrink-0" />
      返回分数和名单
    </UButton>
    <PageHeader :title="`${data.student.name} · 学情报告`">
      <template #actions>
        <UButton size="sm" color="neutral" variant="soft" @click="printReport">
          <UIcon name="i-lucide-printer" class="h-[15px] w-[15px] shrink-0" />
          打印 / 导出 PDF
        </UButton>
      </template>
    </PageHeader>

    <div class="flex flex-col gap-4">
      <div class="flex flex-wrap items-center gap-4 rounded-2xl border border-line bg-elevated p-5">
        <div
          class="flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-500/10 text-lg font-bold text-brand-600 dark:text-brand-300"
        >
          {{ data.student.name.slice(0, 1) }}
        </div>
        <div class="min-w-0 flex-1">
          <div class="text-lg font-bold">{{ data.student.name }}</div>
          <div class="tabular text-xs text-fg-subtle">
            {{ data.student.studentId }} · {{ currentClass?.name ?? '当前班级' }}
          </div>
        </div>
        <div class="rounded-xl border border-line bg-sunken px-4 py-2 text-center">
          <div class="text-[10px] font-semibold uppercase tracking-widest text-fg-subtle">
            报告平均
          </div>
          <div class="tabular text-xl font-bold text-brand-600 dark:text-brand-300">
            {{ reportAverage ?? '—' }}
          </div>
        </div>
      </div>

      <section class="flex flex-col gap-3">
        <h2 class="text-sm font-bold">实验情况</h2>
        <EmptyState
          v-if="data.cases.length === 0"
          icon="i-lucide-flask-conical"
          title="当前班级还没有实验"
        />
        <template v-else>
          <div
            v-for="item in data.cases"
            :key="item.experiment.id"
            class="rounded-2xl border border-line bg-elevated p-4"
          >
          <div class="flex flex-wrap items-center gap-2">
            <span class="rounded-md bg-sunken px-2 py-0.5 text-[11px] font-semibold text-fg-muted">
              {{ item.experiment.mark }}
            </span>
            <span class="text-sm font-bold">{{ item.experiment.title }}</span>
            <div class="ms-auto flex flex-wrap items-center gap-1.5">
              <span
                v-for="type in SCORE_TYPES"
                :key="type.value"
                class="tabular rounded-md px-2 py-0.5 text-[11px] font-semibold"
                :class="
                  scoreFor(item, type.value) != null
                    ? 'bg-brand-500/10 text-brand-600 dark:text-brand-300'
                    : 'bg-sunken text-fg-subtle'
                "
              >
                {{ type.label }} {{ scoreFor(item, type.value) ?? '—' }}
              </span>
              <span
                v-if="scoreFor(item, 2) == null"
                class="rounded-md bg-amber-500/10 px-2 py-0.5 text-[11px] font-semibold text-amber-600 dark:text-amber-300"
              >
                未评报告
              </span>
            </div>
          </div>

          <div v-if="deductionsFor(item).length > 0" class="mt-3 flex flex-col gap-1.5">
            <div class="text-[11px] font-semibold text-fg-subtle">扣分项</div>
            <div
              v-for="(deduction, index) in deductionsFor(item)"
              :key="`${deduction.rule}-${index}`"
              class="rounded-xl border border-line bg-sunken px-3 py-2 text-xs"
            >
              <span class="font-semibold text-fg">
                {{ deduction.section ? `${deduction.section} · ` : '' }}
                {{ deduction.rule || deduction.detail }}
              </span>
              <span class="tabular ms-2 font-semibold text-danger">
                -{{ Math.abs(deduction.score) }}
              </span>
              <div v-if="deduction.appendix" class="mt-1 text-[11px] text-fg-muted">
                {{ deduction.appendix }}
              </div>
            </div>
          </div>

          <div
            v-if="item.reportRemark?.text || item.checkoffRemark?.text"
            class="mt-3 flex flex-col gap-2 text-xs"
          >
            <div
              v-if="item.reportRemark?.text"
              class="rounded-xl border border-line bg-sunken px-3 py-2"
            >
              <div class="mb-0.5 text-[11px] font-semibold text-fg-subtle">报告评语</div>
              <div class="whitespace-pre-wrap text-fg-muted">{{ item.reportRemark.text }}</div>
            </div>
            <div
              v-if="item.checkoffRemark?.text"
              class="rounded-xl border border-line bg-sunken px-3 py-2"
            >
              <div class="mb-0.5 text-[11px] font-semibold text-fg-subtle">验收评语</div>
              <div class="whitespace-pre-wrap text-fg-muted">{{ item.checkoffRemark.text }}</div>
            </div>
          </div>
          </div>
        </template>
      </section>
    </div>
  </div>
</template>
