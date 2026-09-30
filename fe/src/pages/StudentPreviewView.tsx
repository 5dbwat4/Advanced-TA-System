import { Spinner } from '@heroui/react'
import { useEffect, useState, type ReactNode } from 'react'
import { useSearchParams } from 'react-router-dom'

import CalendarClock from '~icons/lucide/calendar-clock'
import CalendarPlus from '~icons/lucide/calendar-plus'
import Cpu from '~icons/lucide/cpu'
import GraduationCap from '~icons/lucide/graduation-cap'
import FlaskConical from '~icons/lucide/flask-conical'
import { ApiError, fetchStudentPreview, type StudentPreviewData } from '@/lib/api'
import { ratioPercentages } from '@/lib/scoring'
import { SCORE_TYPES } from '@/lib/scores'

export default function StudentPreviewView() {
  const [params] = useSearchParams()
  const token = params.get('token')
  const [data, setData] = useState<StudentPreviewData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!token) {
      setError('缺少访问令牌，请使用完整链接打开')
      setLoading(false)
      return
    }

    let cancelled = false
    setLoading(true)
    setError(null)
    fetchStudentPreview(token)
      .then((result) => {
        if (!cancelled) setData(result)
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof ApiError ? err.message : '加载失败，请稍后重试')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [token])

  return (
    <div className="diagonal-bg flex min-h-screen justify-center px-5 py-10">
      <div className="w-full max-w-2xl">
        <div className="mb-6 flex items-center justify-center gap-2 text-xs font-semibold uppercase tracking-widest text-fg-subtle">
          <Cpu width={15} height={15} className="shrink-0" />
          CS-II 学生成绩
        </div>

        {loading ? (
          <div className="flex justify-center py-20">
            <Spinner size="lg" />
          </div>
        ) : error ? (
          <div className="rounded-3xl border border-line bg-elevated/80 p-8 text-center shadow-2xl backdrop-blur-xl">
            <div className="text-lg font-bold text-fg">无法查看</div>
            <div className="mt-2 text-sm text-fg-subtle">{error}</div>
          </div>
        ) : data ? (
          <StudentPreviewContent data={data} />
        ) : null}
      </div>
    </div>
  )
}

function StudentPreviewContent({ data }: { data: StudentPreviewData }) {
  const { experiment, student } = data
  const percentages = ratioPercentages(data.ratio)

  return (
    <>
      <section className="rounded-3xl border border-line bg-elevated/80 p-6 shadow-2xl backdrop-blur-xl">
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-fg-subtle">
          <FlaskConical width={14} height={14} className="shrink-0" />
          {experiment.mark}
        </div>
        <h1 className="mt-2 text-2xl font-bold tracking-tight text-fg">{experiment.title}</h1>
        <div className="mt-1 text-sm text-fg-subtle">
          {experiment.className ?? '未知课程'}
          {experiment.questionBankName ? ` · ${experiment.questionBankName}` : ''}
        </div>
        <div className="mt-5 grid gap-3 sm:grid-cols-3">
          <InfoItem
            icon={<CalendarPlus width={13} height={13} className="shrink-0" />}
            label="发布时间"
            value={formatDateTime(experiment.publishTime)}
          />
          <InfoItem
            icon={<CalendarClock width={13} height={13} className="shrink-0" />}
            label="验收截止"
            value={formatDateTime(experiment.checkoffDeadline)}
          />
          <InfoItem
            icon={<CalendarClock width={13} height={13} className="shrink-0" />}
            label="报告截止"
            value={formatDateTime(experiment.reportDeadline)}
          />
        </div>
      </section>

      <section className="mt-4 rounded-3xl border border-line bg-elevated/80 p-6 shadow-2xl backdrop-blur-xl">
        <div className="flex items-end justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-lg font-bold text-fg">
              <GraduationCap width={18} height={18} className="shrink-0 text-brand-600 dark:text-brand-300" />
              {student.name}
            </div>
            <div className="tabular mt-0.5 text-xs text-fg-subtle">{student.studentNo}</div>
          </div>
          <div className="text-right">
            <div className="text-xs text-fg-subtle">总评</div>
            <div className="tabular text-3xl font-bold leading-none text-fg">
              {data.total ?? '—'}
            </div>
          </div>
        </div>

        <table className="mt-6 w-full border-collapse text-sm">
          <thead>
            <tr className="text-xs text-fg-subtle">
              <th className="border-b border-line py-2 text-left font-semibold">项目</th>
              <th className="border-b border-line py-2 text-right font-semibold">分数</th>
              <th className="border-b border-line py-2 text-left font-semibold pl-4">评分人</th>
              <th className="border-b border-line py-2 text-right font-semibold">更新时间</th>
            </tr>
          </thead>
          <tbody>
            {SCORE_TYPES.map(({ value, label }) => {
              const row = data.scores.find((item) => item.type === value)
              return (
                <tr key={value}>
                  <td className="border-b border-line py-3">
                    {label}
                    <span className="ml-2 text-xs text-fg-subtle">
                      {percentages[value] > 0 ? `占比 ${percentages[value]}%` : '不计入总评'}
                    </span>
                  </td>
                  <td className="tabular border-b border-line py-3 text-right font-bold">
                    {row ? formatScore(row.score) : '—'}
                  </td>
                  <td className="border-b border-line py-3 pl-4 text-fg-muted">
                    {row?.graderName ?? '—'}
                  </td>
                  <td className="tabular border-b border-line py-3 text-right text-fg-subtle">
                    {row ? formatDateTime(row.updatedAt) : '—'}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </section>
    </>
  )
}

function InfoItem({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-line p-3">
      <div className="flex items-center gap-1.5 text-xs text-fg-subtle">
        {icon}
        {label}
      </div>
      <div className="tabular mt-1 text-sm font-semibold text-fg">{value}</div>
    </div>
  )
}

function formatDateTime(value: string | null): string {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}/${pad(date.getMonth() + 1)}/${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

function formatScore(value: number): string {
  return Number.isInteger(value) ? String(value) : String(Math.round(value * 10) / 10)
}
