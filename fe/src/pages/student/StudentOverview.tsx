import { Spinner } from '@heroui/react'
import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'

import ChevronRight from '~icons/lucide/chevron-right'
import FileQuestion from '~icons/lucide/file-question'
import { ExperimentGantt } from '@/components/experiments/ExperimentGantt'
import {
  fetchStudentCheckoffQuestions,
  fetchStudentOverview,
  type StudentOverview,
} from '@/lib/api'
import { getErrorMessage } from '@/lib/error'

export default function StudentOverview() {
  const navigate = useNavigate()
  const [data, setData] = useState<StudentOverview | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  /** 助教是否已把本次验收题目推送给我（用于顶部提示条） */
  const [hasSharedQuestions, setHasSharedQuestions] = useState(false)

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
    // 题目提示条只是附加信息：失败静默，不影响概览主体
    fetchStudentCheckoffQuestions()
      .then((result) => {
        if (!cancelled) setHasSharedQuestions(result.items.length > 0)
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [])

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <Spinner size="lg" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="rounded-3xl border border-line bg-elevated/80 p-8 text-center text-sm text-danger">
        {error}
      </div>
    )
  }

  if (!data) return null

  const scored = data.experiments.filter((experiment) => experiment.total != null)

  return (
    <div className="mx-auto max-w-4xl">
      {hasSharedQuestions && <SharedQuestionsBanner />}

      <section className="rounded-3xl border border-line bg-elevated/80 p-6 shadow-2xl backdrop-blur-xl">
        <div className="text-xs font-semibold tracking-widest text-fg-subtle">
          {data.class?.name ?? '未绑定班级'}
        </div>
        <h1 className="mt-2 text-2xl font-bold tracking-tight">{data.student.name}</h1>
        <div className="tabular mt-1 text-sm text-fg-subtle">{data.student.studentId || '—'}</div>
        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <Stat label="实验数" value={String(data.experiments.length)} />
          <Stat label="已出分" value={String(scored.length)} />
        </div>
      </section>

      <div className="mt-6">
        <ExperimentGantt
          experiments={data.experiments}
          showTotal
          clickable
          onSelect={(id) => navigate(`/student-console/experiments/${id}`)}
        />
      </div>
    </div>
  )
}

/** 存在可见的验收题目时，在概览页顶部提示去「排队验收」查看 */
function SharedQuestionsBanner() {
  return (
    <Link
      to="/student-console/queue"
      className="group mb-4 flex items-center gap-3 rounded-2xl border border-brand-500/30 bg-brand-500/5 p-4 transition-colors hover:border-brand-500/50 hover:bg-brand-500/10"
    >
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-brand-500/15 to-amber-500/10 text-brand-600 dark:text-brand-300">
        <FileQuestion width={17} height={17} className="shrink-0" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-sm font-semibold">助教已推送本次验收题目，点击查看</div>
        <div className="mt-0.5 text-[11px] text-fg-subtle">
          题目只有题面；请先自行思考，验收结束后自动不可见。
        </div>
      </div>
      <ChevronRight
        width={16}
        height={16}
        className="shrink-0 text-fg-subtle transition-transform group-hover:translate-x-0.5"
      />
    </Link>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-line bg-sunken px-4 py-3">
      <div className="text-[10px] font-semibold uppercase tracking-widest text-fg-subtle">
        {label}
      </div>
      <div className="tabular mt-1 text-xl font-bold">{value}</div>
    </div>
  )
}
