import { Spinner } from '@heroui/react'
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { ExperimentGantt } from '@/components/experiments/ExperimentGantt'
import { fetchStudentOverview, type StudentOverview } from '@/lib/api'
import { getErrorMessage } from '@/lib/error'

export default function StudentOverview() {
  const navigate = useNavigate()
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
