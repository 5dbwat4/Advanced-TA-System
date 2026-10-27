<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import {
  collectReportGroups,
  decodeReviewContent,
} from '@/components/criteria/scoring'
import { deserializeItems } from '@/components/criteria/serialize'
import CreditsSection from '@/components/settings/CreditsSection.vue'
import Spinner from '@/components/ui/Spinner.vue'
import {
  ApiError,
  fetchStudentPreview,
  REMARK_TYPE_CHECKOFF,
  REMARK_TYPE_REPORT,
  type StudentPreviewData,
} from '@/lib/api'
import { useAuthStore } from '@/lib/auth'
import { getErrorMessage } from '@/lib/error'
import { formatDateTime } from '@/lib/format'
import { ratioPercentages } from '@/lib/scoring'
import { SCORE_TYPES } from '@/lib/scores'
import { studentHomePath } from '@/lib/student-route'
import { toast } from '@/lib/toast'
import { cn } from '@/lib/utils'
import { UButton, UIcon } from '@/ui'

const props = defineProps<{
  data?: StudentPreviewData
}>()

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()

const embedded = computed(() => props.data != null)
const token = computed(() => {
  const value = route.query.token
  return typeof value === 'string' ? value : null
})

const preview = ref<StudentPreviewData | null>(props.data ?? null)
const error = ref<string | null>(null)
const loading = ref(!embedded.value)
const entering = ref(false)

watch(
  () => props.data,
  (next) => {
    if (next) preview.value = next
  },
)

watch(
  token,
  async (value) => {
    if (embedded.value) return
    if (!value) {
      preview.value = null
      error.value = '缺少访问令牌，请使用完整链接打开'
      loading.value = false
      return
    }

    loading.value = true
    error.value = null
    try {
      preview.value = await fetchStudentPreview(value)
    } catch (err) {
      error.value =
        err instanceof ApiError ? err.message : getErrorMessage(err, '加载失败，请稍后重试')
    } finally {
      loading.value = false
    }
  },
  { immediate: true },
)

const percentages = computed(() => ratioPercentages(preview.value?.ratio ?? []))

type ReviewContent = ReturnType<typeof decodeReviewContent>
const emptyReviewContent: ReviewContent = { cards: {}, extras: {} }

const reportItems = computed(() =>
  preview.value?.report ? deserializeItems(preview.value.report.items) : [],
)
const reportContent = computed<ReviewContent>(() =>
  preview.value?.report ? decodeReviewContent(preview.value.report.ruleContent) : emptyReviewContent,
)
const reportGroups = computed(() =>
  reportItems.value.length
    ? collectReportGroups(reportItems.value, reportContent.value.cards, reportContent.value.extras)
    : [],
)

const infoItems = computed(() => {
  const experiment = preview.value?.experiment
  return [
    {
      icon: 'i-lucide-calendar-plus',
      label: '发布时间',
      value: formatDateTime(experiment?.publishTime ?? null),
    },
    {
      icon: 'i-lucide-calendar-clock',
      label: '验收截止',
      value: formatDateTime(experiment?.checkoffDeadline ?? null),
    },
    {
      icon: 'i-lucide-calendar-clock',
      label: '报告截止',
      value: formatDateTime(experiment?.reportDeadline ?? null),
    },
  ]
})

const remarkLabels = new Map<number, string>([
  [REMARK_TYPE_CHECKOFF, '验收附言'],
  [REMARK_TYPE_REPORT, '报告附言'],
])

function scoreRow(type: number) {
  return preview.value?.scores.find((item) => item.type === type) ?? null
}

function scoreText(type: number): string {
  const row = scoreRow(type)
  return row ? formatScore(row.score) : '—'
}

function scoreGrader(type: number): string {
  return scoreRow(type)?.graderName ?? '—'
}

function scoreUpdated(type: number): string {
  const row = scoreRow(type)
  return row ? formatDateTime(row.updatedAt) : '—'
}

function formatScore(value: number): string {
  return Number.isInteger(value) ? String(value) : String(Math.round(value * 10) / 10)
}

async function enterHome() {
  if (!preview.value) return
  const user = auth.user
  if (user?.role === 'STUDENT' && user.id === preview.value.student.userId) {
    await router.push(studentHomePath(user))
    return
  }
  if (!token.value) {
    await router.push('/login')
    return
  }
  entering.value = true
  try {
    const next = await auth.exchangeStudentPreview(token.value)
    toast.success('已进入学生主页')
    await router.push(studentHomePath(next))
  } catch (err) {
    toast.error(getErrorMessage(err, '进入学生主页失败'))
  } finally {
    entering.value = false
  }
}
</script>

<template>
  <div :class="embedded ? '' : 'diagonal-bg flex min-h-screen justify-center px-5 py-10'">
    <div :class="embedded ? '' : 'w-full max-w-2xl'">
      <template v-if="!embedded">
        <div
          class="mb-6 flex items-center justify-center gap-2 text-xs font-semibold uppercase tracking-widest text-fg-subtle"
        >
          <UIcon name="i-lucide-cpu" class="size-4 shrink-0" />
          计算机系统课程学生成绩
        </div>

        <div v-if="loading" class="flex justify-center py-20">
          <Spinner size="lg" />
        </div>

        <div
          v-else-if="error"
          class="rounded-3xl border border-line bg-elevated/80 p-8 text-center shadow-2xl backdrop-blur-xl"
        >
          <div class="text-lg font-bold text-fg">无法查看</div>
          <div class="mt-2 text-sm text-fg-subtle">{{ error }}</div>
        </div>
      </template>

      <template v-if="preview && (embedded || (!loading && !error))">
        <section class="rounded-3xl border border-line bg-elevated/80 p-6 shadow-2xl backdrop-blur-xl">
          <div
            class="flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-fg-subtle"
          >
            <UIcon name="i-lucide-flask-conical" class="size-3.5 shrink-0" />
            {{ preview.experiment.mark }}
          </div>
          <h1 class="mt-2 text-2xl font-bold tracking-tight text-fg">
            {{ preview.experiment.title }}
          </h1>
          <div class="mt-1 text-sm text-fg-subtle">
            {{ preview.experiment.className ?? '未知课程' }}
            {{
              preview.experiment.questionBankName
                ? ` · ${preview.experiment.questionBankName}`
                : ''
            }}
          </div>
          <div class="mt-5 grid gap-3 sm:grid-cols-3">
            <div
              v-for="item in infoItems"
              :key="item.label"
              class="rounded-2xl border border-line p-3"
            >
              <div class="flex items-center gap-1.5 text-xs text-fg-subtle">
                <UIcon :name="item.icon" class="size-3.5 shrink-0" />
                {{ item.label }}
              </div>
              <div class="tabular mt-1 text-sm font-semibold text-fg">{{ item.value }}</div>
            </div>
          </div>
        </section>

        <section class="mt-4 rounded-3xl border border-line bg-elevated/80 p-6 shadow-2xl backdrop-blur-xl">
          <div class="flex items-end justify-between gap-4">
            <div>
              <div class="flex items-center gap-2 text-lg font-bold text-fg">
                <UIcon
                  name="i-lucide-graduation-cap"
                  class="size-[18px] shrink-0 text-brand-600 dark:text-brand-300"
                />
                {{ preview.student.name }}
              </div>
              <div class="tabular mt-0.5 text-xs text-fg-subtle">
                {{ preview.student.studentId }}
              </div>
            </div>
            <div class="text-right">
              <div class="text-xs text-fg-subtle">总评</div>
              <div class="tabular text-3xl font-bold leading-none text-fg">
                {{ preview.total ?? '—' }}
              </div>
            </div>
          </div>

          <table class="mt-6 w-full border-collapse text-sm">
            <thead>
              <tr class="text-xs text-fg-subtle">
                <th class="border-b border-line py-2 text-left font-semibold">项目</th>
                <th class="border-b border-line py-2 text-right font-semibold">分数</th>
                <th class="border-b border-line py-2 pl-4 text-left font-semibold">评分人</th>
                <th class="border-b border-line py-2 text-right font-semibold">更新时间</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="scoreType in SCORE_TYPES" :key="scoreType.value">
                <td class="border-b border-line py-3">
                  {{ scoreType.label }}
                  <span class="ml-2 text-xs text-fg-subtle">
                    {{
                      percentages[scoreType.value] > 0
                        ? `占比 ${percentages[scoreType.value]}%`
                        : '不计入总评'
                    }}
                  </span>
                </td>
                <td class="tabular border-b border-line py-3 text-right font-bold">
                  {{ scoreText(scoreType.value) }}
                </td>
                <td class="border-b border-line py-3 pl-4 text-fg-muted">
                  {{ scoreGrader(scoreType.value) }}
                </td>
                <td class="tabular border-b border-line py-3 text-right text-fg-subtle">
                  {{ scoreUpdated(scoreType.value) }}
                </td>
              </tr>
            </tbody>
          </table>
        </section>

        <section class="mt-4 rounded-3xl border border-line bg-elevated/80 p-6 shadow-2xl backdrop-blur-xl">
          <div
            class="flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-fg-subtle"
          >
            <UIcon name="i-lucide-clipboard-list" class="size-3.5 shrink-0" />
            报告得分详情
          </div>

          <div v-if="reportGroups.length > 0" class="mt-4 flex flex-col gap-3">
            <template
              v-for="group in reportGroups"
              :key="group.kind === 'section' ? group.id : group.card.id"
            >
              <div v-if="group.kind === 'section'" class="rounded-xl border border-line bg-sunken p-3">
                <div class="flex flex-wrap items-center gap-2 text-xs font-semibold">
                  <UIcon
                    name="i-lucide-rows-3"
                    class="size-3.5 shrink-0 text-brand-600 dark:text-brand-300"
                  />
                  <span class="min-w-0 flex-1 truncate">{{ group.title || '未命名小节' }}</span>
                  <span class="tabular shrink-0 text-brand-600 dark:text-brand-300">
                    {{ formatScore(group.score) }} 分
                  </span>
                </div>
                <div
                  v-if="group.cards.length > 0"
                  class="mt-2 flex flex-col gap-1.5 border-s border-line ps-3"
                >
                  <div
                    v-for="card in group.cards"
                    :key="card.id"
                    class="flex items-start gap-2 rounded-lg border border-line bg-elevated px-2.5 py-2"
                  >
                    <span
                      :class="
                        cn(
                          'tabular shrink-0 rounded px-1.5 py-0.5 text-[11px] font-semibold',
                          card.mode === 'add'
                            ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                            : 'bg-danger/10 text-danger',
                        )
                      "
                    >
                      {{ card.mode === 'add' ? '+' : '−' }}{{ formatScore(card.score) }}
                    </span>
                    <div class="min-w-0 flex-1">
                      <div class="text-xs font-medium text-fg">
                        {{ card.rule || '（未填写规则）' }}
                      </div>
                      <div
                        v-if="card.detail"
                        class="mt-0.5 whitespace-pre-wrap text-[11px] text-fg-subtle"
                      >
                        {{ card.detail }}
                      </div>
                      <div
                        v-if="card.appendix"
                        class="mt-1 whitespace-pre-wrap text-[11px] text-fg-muted"
                      >
                        附注：{{ card.appendix }}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div
                v-else
                class="flex items-start gap-2 rounded-lg border border-line bg-elevated px-2.5 py-2"
              >
                <span
                  :class="
                    cn(
                      'tabular shrink-0 rounded px-1.5 py-0.5 text-[11px] font-semibold',
                      group.card.mode === 'add'
                        ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                        : 'bg-danger/10 text-danger',
                    )
                  "
                >
                  {{ group.card.mode === 'add' ? '+' : '−' }}{{ formatScore(group.card.score) }}
                </span>
                <div class="min-w-0 flex-1">
                  <div class="text-xs font-medium text-fg">
                    {{ group.card.rule || '（未填写规则）' }}
                  </div>
                  <div
                    v-if="group.card.detail"
                    class="mt-0.5 whitespace-pre-wrap text-[11px] text-fg-subtle"
                  >
                    {{ group.card.detail }}
                  </div>
                  <div
                    v-if="group.card.appendix"
                    class="mt-1 whitespace-pre-wrap text-[11px] text-fg-muted"
                  >
                    附注：{{ group.card.appendix }}
                  </div>
                </div>
              </div>
            </template>
          </div>
          <p v-else class="mt-3 text-sm text-fg-subtle">无批阅记录。</p>
        </section>

        <section
          v-if="preview.remarks.length > 0"
          class="mt-4 rounded-3xl border border-line bg-elevated/80 p-6 shadow-2xl backdrop-blur-xl"
        >
          <div
            class="flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-fg-subtle"
          >
            <UIcon name="i-lucide-message-square-text" class="size-3.5 shrink-0" />
            附言
          </div>

          <div class="mt-4 flex flex-col gap-3">
            <div
              v-for="remark in preview.remarks"
              :key="remark.type"
              class="rounded-2xl border border-line p-3"
            >
              <div class="text-[11px] font-medium text-fg-subtle">
                {{ remarkLabels.get(remark.type) ?? '附言' }}
              </div>
              <div class="mt-0.5 whitespace-pre-wrap text-sm text-fg">{{ remark.text }}</div>
            </div>
          </div>
        </section>

        <template v-if="!embedded">
          <div class="mt-4">
            <UButton
              variant="soft"
              color="neutral"
              block
              :disabled="entering"
              icon="i-lucide-house"
              @click="enterHome"
            >
              进入我的主页
            </UButton>
          </div>
          <div class="my-4 h-px bg-line" />
          <div>
            <CreditsSection />
          </div>
        </template>
      </template>
    </div>
  </div>
</template>
