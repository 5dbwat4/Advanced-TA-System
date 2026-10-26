import { Spinner } from '@heroui/react'
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'

import CalendarClock from '~icons/lucide/calendar-clock'
import ChevronRight from '~icons/lucide/chevron-right'
import FlaskConical from '~icons/lucide/flask-conical'
import MessageSquareText from '~icons/lucide/message-square-text'
import { PageHeader } from '@/components/ui/PageHeader'
import { fetchStudentOverview, type StudentOverview } from '@/lib/api'
import { getErrorMessage } from '@/lib/error'
import { formatDateTime } from '@/lib/format'
import { ratioPercentages } from '@/lib/scoring'
import { SCORE_TYPES } from '@/lib/scores'

export default function StudentScores() {
  const [data, setData] = useState<StudentOverview | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    fetchStudentOverview()
      .then((result) => {
        if (!cancelled) setData(result)
      })
      .catch((err) => {
        if (!cancelled) setError(getErrorMessage(err, '加载失败'))
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader title="实验成绩" />

      {loading ? (
        <div className="flex justify-center py-20">
          <Spinner size="lg" />
        </div>
      ) : error ? (
        <div className="rounded-3xl border border-line bg-elevated/80 p-8 text-center text-sm text-danger">
          {error}
        </div>
      ) : !data || data.experiments.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-line py-12 text-center text-sm text-fg-subtle">
          暂无实验
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {data.experiments.map((experiment) => {
            const percentages = ratioPercentages(experiment.ratio)
            return (
              <Link
                key={experiment.id}
                to={`/student-console/experiments/${experiment.id}`}
                className="group rounded-2xl border border-line bg-elevated/80 p-5 shadow-lg backdrop-blur-xl transition-colors hover:border-brand-500/40"
              >
                <div className="flex items-start gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-500/10 text-brand-600 dark:text-brand-300">
                    <FlaskConical width={18} height={18} className="shrink-0" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold tracking-widest text-fg-subtle">
                        {experiment.mark}
                      </span>
                      {experiment.hasReport && (
                        <span className="rounded-full bg-brand-500/10 px-2 py-0.5 text-[10px] font-semibold text-brand-600 dark:text-brand-300">
                          报告已批阅
                        </span>
                      )}
                      {experiment.remarkCount > 0 && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-semibold text-amber-600 dark:text-amber-300">
                          <MessageSquareText width={11} height={11} className="shrink-0" />
                          {experiment.remarkCount}
                        </span>
                      )}
                    </div>
                    <div className="mt-0.5 truncate text-base font-bold">{experiment.title}</div>
                    <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-fg-subtle">
                      {SCORE_TYPES.map(({ value, label }) => {
                        const row = experiment.scores.find((item) => item.type === value)
                        return (
                          <span key={value}>
                            {label}{' '}
                            <span className="tabular font-semibold text-fg-muted">
                              {row ? formatScore(row.score) : '—'}
                            </span>
                            {percentages[value] > 0 && (
                              <span className="text-[10px]"> ({percentages[value]}%)</span>
                            )}
                          </span>
                        )
                      })}
                    </div>
                    <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-fg-subtle">
                      <span className="inline-flex items-center gap-1">
                        <CalendarClock width={11} height={11} className="shrink-0" />
                        验收 {formatDateTime(experiment.checkoffDeadline)}
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <CalendarClock width={11} height={11} className="shrink-0" />
                        报告 {formatDateTime(experiment.reportDeadline)}
                      </span>
                    </div>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <div className="text-[10px] text-fg-subtle">总评</div>
                    <div className="tabular text-2xl font-bold leading-none">
                      {experiment.total == null ? '—' : formatScore(experiment.total)}
                    </div>
                    <ChevronRight
                      width={16}
                      height={16}
                      className="mt-2 text-fg-subtle transition-transform group-hover:translate-x-0.5"
                    />
                  </div>
                </div>
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}

function formatScore(value: number): string {
  return Number.isInteger(value) ? String(value) : String(Math.round(value * 10) / 10)
}
