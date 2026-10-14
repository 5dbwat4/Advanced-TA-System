import { Spinner } from '@heroui/react'
import { useEffect, useState, type ReactNode } from 'react'
import { useSearchParams } from 'react-router-dom'

import CalendarClock from '~icons/lucide/calendar-clock'
import CalendarPlus from '~icons/lucide/calendar-plus'
import ClipboardList from '~icons/lucide/clipboard-list'
import Cpu from '~icons/lucide/cpu'
import GraduationCap from '~icons/lucide/graduation-cap'
import FlaskConical from '~icons/lucide/flask-conical'
import MessageSquareText from '~icons/lucide/message-square-text'
import Rows3 from '~icons/lucide/rows-3'
import {
  collectReportGroups,
  decodeReviewContent,
  type ReportCardEntry,
} from '@/components/criteria/scoring'
import { deserializeItems } from '@/components/criteria/serialize'
import {
  ApiError,
  fetchStudentPreview,
  REMARK_TYPE_CHECKOFF,
  REMARK_TYPE_REPORT,
  type StudentPreviewData,
} from '@/lib/api'
import { getErrorMessage } from '@/lib/error'
import { formatDateTime } from '@/lib/format'
import { ratioPercentages } from '@/lib/scoring'
import { SCORE_TYPES } from '@/lib/scores'
import { cn } from '@/lib/utils'

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
        if (!cancelled) setError(err instanceof ApiError ? err.message : getErrorMessage(err, '加载失败，请稍后重试'))
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
          计算机系统课程学生成绩
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

  const reportItems = data.report ? deserializeItems(data.report.items) : []
  const reportContent = data.report
    ? decodeReviewContent(data.report.ruleContent)
    : { cards: {}, extras: {} }
  const reportGroups = reportItems.length
    ? collectReportGroups(reportItems, reportContent.cards, reportContent.extras)
    : []

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

      <section className="mt-4 rounded-3xl border border-line bg-elevated/80 p-6 shadow-2xl backdrop-blur-xl">
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-fg-subtle">
          <ClipboardList width={14} height={14} className="shrink-0" />
          报告得分详情
        </div>

        {reportGroups.length > 0 ? (
          <div className="mt-4 flex flex-col gap-3">
            {reportGroups.map((group) =>
              group.kind === 'section' ? (
                <div key={group.id} className="rounded-xl border border-line bg-sunken p-3">
                  <div className="flex flex-wrap items-center gap-2 text-xs font-semibold">
                    <Rows3
                      width={13}
                      height={13}
                      className="shrink-0 text-brand-600 dark:text-brand-300"
                    />
                    <span className="min-w-0 flex-1 truncate">{group.title || '未命名小节'}</span>
                    <span className="tabular shrink-0 text-brand-600 dark:text-brand-300">
                      {formatScore(group.score)} 分
                    </span>
                  </div>
                  {group.cards.length > 0 && (
                    <div className="mt-2 flex flex-col gap-1.5 border-s border-line ps-3">
                      {group.cards.map((card) => (
                        <ReportCardRow key={card.id} entry={card} />
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <ReportCardRow key={group.card.id} entry={group.card} />
              ),
            )}
          </div>
        ) : (
          <p className="mt-3 text-sm text-fg-subtle">无批阅记录。</p>
        )}
      </section>

      {data.remarks.length > 0 && (
        <section className="mt-4 rounded-3xl border border-line bg-elevated/80 p-6 shadow-2xl backdrop-blur-xl">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-fg-subtle">
            <MessageSquareText width={14} height={14} className="shrink-0" />
            附言
          </div>

          <div className="mt-4 flex flex-col gap-3">
            {data.remarks.map((remark) => (
              <div key={remark.type} className="rounded-2xl border border-line p-3">
                <div className="text-[11px] font-medium text-fg-subtle">
                  {REMARK_LABELS.get(remark.type) ?? '附言'}
                </div>
                <div className="mt-0.5 whitespace-pre-wrap text-sm text-fg">{remark.text}</div>
              </div>
            ))}
          </div>
        </section>
      )}
    </>
  )
}

/** 附言类型标签（0=验收，1=实验报告） */
const REMARK_LABELS = new Map<number, string>([
  [REMARK_TYPE_CHECKOFF, '验收附言'],
  [REMARK_TYPE_REPORT, '报告附言'],
])

/** 单张批阅卡片：左侧带符号分值，右侧规则 / 详细标准 / 附注。 */
function ReportCardRow({ entry }: { entry: ReportCardEntry }) {
  return (
    <div className="flex items-start gap-2 rounded-lg border border-line bg-elevated px-2.5 py-2">
      <span
        className={cn(
          'tabular shrink-0 rounded px-1.5 py-0.5 text-[11px] font-semibold',
          entry.mode === 'add'
            ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
            : 'bg-danger/10 text-danger',
        )}
      >
        {entry.mode === 'add' ? '+' : '−'}
        {formatScore(entry.score)}
      </span>
      <div className="min-w-0 flex-1">
        <div className="text-xs font-medium text-fg">{entry.rule || '（未填写规则）'}</div>
        {entry.detail && (
          <div className="mt-0.5 whitespace-pre-wrap text-[11px] text-fg-subtle">{entry.detail}</div>
        )}
        {entry.appendix && (
          <div className="mt-1 whitespace-pre-wrap text-[11px] text-fg-muted">
            附注：{entry.appendix}
          </div>
        )}
      </div>
    </div>
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

function formatScore(value: number): string {
  return Number.isInteger(value) ? String(value) : String(Math.round(value * 10) / 10)
}
