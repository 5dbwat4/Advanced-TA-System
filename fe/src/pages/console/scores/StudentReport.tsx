import { Button, Spinner } from '@heroui/react'
import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { toast } from 'sonner'

import AlertTriangle from '~icons/lucide/alert-triangle'
import ArrowLeft from '~icons/lucide/arrow-left'
import Award from '~icons/lucide/award'
import CheckCircle2 from '~icons/lucide/check-circle-2'
import Minus from '~icons/lucide/minus'
import Sparkles from '~icons/lucide/sparkles'
import Target from '~icons/lucide/target'
import TrendingDown from '~icons/lucide/trending-down'
import TrendingUp from '~icons/lucide/trending-up'
import { PageHeader } from '@/components/ui/PageHeader'
import { PendingButton } from '@/components/ui/PendingButton'
import { useAiConfig } from '@/lib/ai-config'
import { AI_ENABLED } from '@/lib/ai-feature'
import {
  generateLearningReport,
  type LearningReport,
} from '@/lib/ai-learning-report'
import { useAuth } from '@/lib/auth'
import { getErrorMessage } from '@/lib/error'
import { formatLocaleDateTime } from '@/lib/format'
import { SCORE_TYPES } from '@/lib/scores'
import { loadStudentCases, type StudentCaseSet } from '@/lib/student-cases'
import { useCurrentClass } from '@/lib/store'
import { cn } from '@/lib/utils'

const TREND_META = {
  up: {
    label: '进步',
    icon: TrendingUp,
    className: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
  },
  steady: {
    label: '稳定',
    icon: Minus,
    className: 'bg-brand-500/10 text-brand-600 dark:text-brand-300',
  },
  down: {
    label: '需关注',
    icon: TrendingDown,
    className: 'bg-amber-500/10 text-amber-600 dark:text-amber-300',
  },
} as const

const PERFORMANCE_META = {
  excellent: {
    label: '优秀',
    className: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
  },
  good: {
    label: '良好',
    className: 'bg-brand-500/10 text-brand-600 dark:text-brand-300',
  },
  needs_work: {
    label: '待提升',
    className: 'bg-amber-500/10 text-amber-600 dark:text-amber-300',
  },
} as const

const reportStorageKey = (userId: string) => `tasaas.learning-report.${userId}`

function readCachedReport(userId: string): { report: LearningReport; savedAt: number } | null {
  try {
    const raw = window.localStorage.getItem(reportStorageKey(userId))
    if (!raw) return null
    const value = JSON.parse(raw) as { report?: LearningReport; savedAt?: number }
    return value?.report ? { report: value.report, savedAt: value.savedAt ?? 0 } : null
  } catch {
    return null
  }
}

export default function StudentReport() {
  const { userId } = useParams<{ userId: string }>()
  const currentClass = useCurrentClass()
  const classId = currentClass?.id ?? null
  const navigate = useNavigate()
  const { user } = useAuth()
  const aiConfig = useAiConfig(user?.id)

  const [data, setData] = useState<StudentCaseSet | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [report, setReport] = useState<LearningReport | null>(null)
  const [savedAt, setSavedAt] = useState<number | null>(null)
  const [generating, setGenerating] = useState(false)

  useEffect(() => {
    if (!classId || !userId) return
    let cancelled = false
    setLoading(true)
    setError(null)
    loadStudentCases(classId, userId)
      .then((result) => {
        if (cancelled) return
        setData(result)
        const cached = readCachedReport(userId)
        setReport(cached?.report ?? null)
        setSavedAt(cached?.savedAt ?? null)
      })
      .catch((err) => {
        if (!cancelled) setError(getErrorMessage(err, '加载学生信息失败'))
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [classId, userId])

  const reportAverage = useMemo(() => {
    if (!data) return null
    const values = data.cases
      .map((item) => item.scores.find((score) => score.type === 2)?.score)
      .filter((score): score is number => score != null)
    if (values.length === 0) return null
    return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length)
  }, [data])

  const generate = async () => {
    if (!data || !userId) return
    setGenerating(true)
    try {
      const result = await generateLearningReport({
        studentName: data.student.name,
        cases: data.cases,
        config: aiConfig,
      })
      setReport(result)
      const timestamp = Date.now()
      setSavedAt(timestamp)
      window.localStorage.setItem(
        reportStorageKey(userId),
        JSON.stringify({ report: result, savedAt: timestamp }),
      )
      toast.success('学情报告已生成')
    } catch (err) {
      toast.error(getErrorMessage(err, '生成学情报告失败'))
    } finally {
      setGenerating(false)
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center gap-2 text-xs text-fg-subtle">
        <Spinner size="sm" />
        正在加载学生信息…
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="mx-auto max-w-4xl">
        <Button variant="ghost" size="sm" className="mb-3" onPress={() => navigate('/console/scores')}>
          <ArrowLeft width={15} height={15} className="shrink-0" />
          返回分数和名单
        </Button>
        <div className="rounded-2xl border border-dashed border-danger/40 p-10 text-center text-sm text-danger">
          {error ?? '未找到该学生'}
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-4xl">
      <Button variant="ghost" size="sm" className="mb-3" onPress={() => navigate('/console/scores')}>
        <ArrowLeft width={15} height={15} className="shrink-0" />
        返回分数和名单
      </Button>
      <PageHeader title={`${data.student.name} · 学情报告`} />

      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-4 rounded-2xl border border-line bg-elevated p-5">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-500/10 text-lg font-bold text-brand-600 dark:text-brand-300">
            {data.student.name.slice(0, 1)}
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-lg font-bold">{data.student.name}</div>
            <div className="tabular text-xs text-fg-subtle">
              {data.student.studentId} · {currentClass?.name ?? '当前班级'}
            </div>
          </div>
          <div className="rounded-xl border border-line bg-sunken px-4 py-2 text-center">
            <div className="text-[10px] font-semibold uppercase tracking-widest text-fg-subtle">
              报告平均
            </div>
            <div className="tabular text-xl font-bold text-brand-600 dark:text-brand-300">
              {reportAverage ?? '—'}
            </div>
          </div>
          {AI_ENABLED && (
            <PendingButton
              isPending={generating}
              onPress={() => void generate()}
              icon={Sparkles}
            >
              {report ? '重新生成学情报告' : '生成学情报告'}
            </PendingButton>
          )}
        </div>

        <section className="flex flex-col gap-3">
          <h2 className="text-sm font-bold">实验情况</h2>
          {data.cases.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-line p-8 text-center text-xs text-fg-subtle">
              当前班级还没有实验
            </div>
          ) : (
            data.cases.map((item) => {
              const reportScore = item.scores.find((score) => score.type === 2)?.score ?? null
              const deductions = item.report?.groups.flatMap((group) =>
                group.kind === 'card'
                  ? [{ rule: group.card.rule, detail: group.card.detail, score: group.card.score, appendix: group.card.appendix, section: '' }]
                  : group.cards.map((card) => ({
                      rule: card.rule,
                      detail: card.detail,
                      score: card.score,
                      appendix: card.appendix,
                      section: group.title,
                    })),
              ) ?? []
              return (
                <div
                  key={item.experiment.id}
                  className="rounded-2xl border border-line bg-elevated p-4"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-md bg-sunken px-2 py-0.5 text-[11px] font-semibold text-fg-muted">
                      {item.experiment.mark}
                    </span>
                    <span className="text-sm font-bold">{item.experiment.title}</span>
                    <div className="ms-auto flex flex-wrap items-center gap-1.5">
                      {SCORE_TYPES.map((type) => {
                        const score = item.scores.find((entry) => entry.type === type.value)
                        return (
                          <span
                            key={type.value}
                            className={cn(
                              'tabular rounded-md px-2 py-0.5 text-[11px] font-semibold',
                              score
                                ? 'bg-brand-500/10 text-brand-600 dark:text-brand-300'
                                : 'bg-sunken text-fg-subtle',
                            )}
                          >
                            {type.label} {score?.score ?? '—'}
                          </span>
                        )
                      })}
                      {reportScore == null && (
                        <span className="rounded-md bg-amber-500/10 px-2 py-0.5 text-[11px] font-semibold text-amber-600 dark:text-amber-300">
                          未评报告
                        </span>
                      )}
                    </div>
                  </div>

                  {deductions.length > 0 && (
                    <div className="mt-3 flex flex-col gap-1.5">
                      <div className="text-[11px] font-semibold text-fg-subtle">扣分项</div>
                      {deductions.map((deduction, index) => (
                        <div
                          key={`${deduction.rule}-${index}`}
                          className="rounded-xl border border-line bg-sunken px-3 py-2 text-xs"
                        >
                          <span className="font-semibold text-fg">
                            {deduction.section ? `${deduction.section} · ` : ''}
                            {deduction.rule || deduction.detail}
                          </span>
                          <span className="tabular ms-2 font-semibold text-danger">
                            -{Math.abs(deduction.score)}
                          </span>
                          {deduction.appendix && (
                            <div className="mt-1 text-[11px] text-fg-muted">{deduction.appendix}</div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  {(item.reportRemark?.text || item.checkoffRemark?.text) && (
                    <div className="mt-3 flex flex-col gap-2 text-xs">
                      {item.reportRemark?.text && (
                        <div className="rounded-xl border border-line bg-sunken px-3 py-2">
                          <div className="mb-0.5 text-[11px] font-semibold text-fg-subtle">
                            报告评语
                          </div>
                          <div className="whitespace-pre-wrap text-fg-muted">
                            {item.reportRemark.text}
                          </div>
                        </div>
                      )}
                      {item.checkoffRemark?.text && (
                        <div className="rounded-xl border border-line bg-sunken px-3 py-2">
                          <div className="mb-0.5 text-[11px] font-semibold text-fg-subtle">
                            验收评语
                          </div>
                          <div className="whitespace-pre-wrap text-fg-muted">
                            {item.checkoffRemark.text}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )
            })
          )}
        </section>

        {AI_ENABLED && report ? (
          <section className="flex flex-col gap-4">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-sm font-bold">AI 学情报告</h2>
              <span className="text-[11px] text-fg-subtle">
                {savedAt ? `生成于 ${formatLocaleDateTime(new Date(savedAt).toISOString())}` : ''}
              </span>
            </div>

            <div className="overflow-hidden rounded-2xl border border-line bg-gradient-to-br from-brand-950 to-brand-900 p-6 text-white">
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-lg bg-white/10 px-2 py-0.5 text-[11px] font-semibold">
                  总览
                </span>
                {(() => {
                  const meta = TREND_META[report.trend]
                  const Icon = meta.icon
                  return (
                    <span className={cn('rounded-lg px-2 py-0.5 text-[11px] font-semibold', meta.className)}>
                      <Icon width={12} height={12} className="mr-1 inline shrink-0" />
                      {meta.label}
                    </span>
                  )
                })()}
              </div>
              <div className="mt-3 text-xl font-bold">{report.headline}</div>
              <p className="mt-2 text-sm leading-relaxed text-white/70">{report.summary}</p>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/5 p-5">
                <div className="flex items-center gap-2 text-sm font-bold text-emerald-600 dark:text-emerald-400">
                  <CheckCircle2 width={15} height={15} className="shrink-0" />
                  优势
                </div>
                <ul className="mt-3 flex flex-col gap-2">
                  {report.strengths.map((item, index) => (
                    <li key={index} className="text-xs leading-relaxed text-fg-muted">
                      · {item}
                    </li>
                  ))}
                </ul>
              </div>
              <div className="rounded-2xl border border-amber-500/30 bg-amber-500/5 p-5">
                <div className="flex items-center gap-2 text-sm font-bold text-amber-600 dark:text-amber-300">
                  <AlertTriangle width={15} height={15} className="shrink-0" />
                  待提升
                </div>
                <ul className="mt-3 flex flex-col gap-2">
                  {report.weaknesses.map((item, index) => (
                    <li key={index} className="text-xs leading-relaxed text-fg-muted">
                      · {item}
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            <div className="flex flex-col gap-3">
              {report.experiments.map((item) => {
                const meta = PERFORMANCE_META[item.performance]
                return (
                  <div key={item.experimentId} className="rounded-2xl border border-line bg-elevated p-5">
                    <div className="flex flex-wrap items-center gap-2">
                      <Award width={15} height={15} className="shrink-0 text-brand-600 dark:text-brand-300" />
                      <span className="text-sm font-bold">{item.title}</span>
                      <span className={cn('ms-auto rounded-md px-2 py-0.5 text-[11px] font-semibold', meta.className)}>
                        {meta.label}
                      </span>
                    </div>
                    <p className="mt-2 text-xs leading-relaxed text-fg-muted">{item.highlight}</p>
                    {item.deductions.length > 0 && (
                      <div className="mt-3 flex flex-col gap-1.5">
                        <div className="text-[11px] font-semibold text-fg-subtle">主要扣分</div>
                        {item.deductions.map((deduction, index) => (
                          <div key={index} className="rounded-lg bg-sunken px-3 py-1.5 text-[11px] text-fg-muted">
                            {deduction}
                          </div>
                        ))}
                      </div>
                    )}
                    <div className="mt-3 rounded-xl border border-brand-500/20 bg-brand-500/5 px-3 py-2 text-[11px] leading-relaxed text-fg-muted">
                      <span className="font-semibold text-brand-600 dark:text-brand-300">建议：</span>
                      {item.advice}
                    </div>
                  </div>
                )
              })}
            </div>

            <div className="rounded-2xl border border-line bg-elevated p-5">
              <div className="flex items-center gap-2 text-sm font-bold">
                <Target width={15} height={15} className="shrink-0 text-brand-600 dark:text-brand-300" />
                行动计划
              </div>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                {report.actionPlan.map((item, index) => (
                  <div key={index} className="rounded-xl border border-line bg-sunken p-3">
                    <div className="text-xs font-semibold text-fg">{item.title}</div>
                    <div className="mt-1 text-[11px] leading-relaxed text-fg-muted">{item.detail}</div>
                  </div>
                ))}
              </div>
            </div>

            <p className="rounded-2xl border border-line bg-sunken p-4 text-xs leading-relaxed text-fg-muted">
              {report.closing}
            </p>
          </section>
        ) : AI_ENABLED ? (
          <div className="rounded-2xl border border-dashed border-line p-10 text-center">
            <Sparkles width={22} height={22} className="mx-auto shrink-0 text-fg-subtle" />
            <div className="mt-2 text-sm font-semibold">还没有学情报告</div>
            <div className="mt-1 text-xs text-fg-subtle">
              点击上方「生成学情报告」，将全部报告评分、评语和扣分项交给 AI 汇总。
            </div>
          </div>
        ) : null}
      </div>
    </div>
  )
}
