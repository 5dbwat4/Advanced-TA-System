import { Button, Dropdown, Label } from '@heroui/react'
import { motion } from 'motion/react'
import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'

import ArrowUpRight from '~icons/lucide/arrow-up-right'
import CalendarClock from '~icons/lucide/calendar-clock'
import ClipboardCheck from '~icons/lucide/clipboard-check'
import FlaskConical from '~icons/lucide/flask-conical'
import School from '~icons/lucide/school'
import ShieldCheck from '~icons/lucide/shield-check'
import Upload from '~icons/lucide/upload'
import UserCheck from '~icons/lucide/user-check'
import { Card, EmptyState } from '@/components/ui/Card'
import {
  fetchClassTables,
  fetchExperimentsWithCurrent,
  fetchXzzdPushPreview,
  type ClassTables,
  type Experiment,
} from '@/lib/api'
import { useAuth } from '@/lib/auth'
import type { IconComponent } from '@/lib/icon'
import { useCurrentClass } from '@/lib/store'
import { cn } from '@/lib/utils'

const DAY_MS = 24 * 60 * 60 * 1000

const TONES = {
  brand: 'bg-brand-500/10 text-brand-600 dark:text-brand-300',
  amber: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
  success: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
  purple: 'bg-purple-500/10 text-purple-600 dark:text-purple-400',
} as const

export default function Dashboard() {
  const { user } = useAuth()
  const currentClass = useCurrentClass()
  const classId = currentClass?.id ?? null
  const myUserId = user?.id ?? null
  const hour = new Date().getHours()
  const greeting = hour < 12 ? '早上好' : hour < 18 ? '下午好' : '晚上好'

  const [loading, setLoading] = useState(true)
  const [experiments, setExperiments] = useState<Experiment[]>([])
  const [tables, setTables] = useState<ClassTables | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [myReports, setMyReports] = useState<number | null>(null)
  const [myCheckoffs, setMyCheckoffs] = useState<number | null>(null)

  const [reportLoading, setReportLoading] = useState(false)
  const [submitted, setSubmitted] = useState<number | null>(null)
  const [ungraded, setUngraded] = useState<number | null>(null)

  // 载入实验列表（含「当前」实验）+ 班级数据；默认选中截止时间最早的进行中实验
  useEffect(() => {
    if (!classId) {
      setLoading(false)
      return
    }
    let cancelled = false
    setLoading(true)
    const run = async () => {
      try {
        const [withCurrent, classTables] = await Promise.all([
          fetchExperimentsWithCurrent(classId),
          fetchClassTables(classId),
        ])
        if (cancelled) return
        setExperiments(withCurrent.experiments)
        setTables(classTables)
        const current =
          withCurrent.currentMark != null
            ? (withCurrent.experiments.find((item) => item.mark === withCurrent.currentMark) ??
              null)
            : null
        setSelectedId(current?.id ?? null)

        // 今日完成（本班）：我作为评分人、且今天更新的报告 / 验收记录数
        if (myUserId) {
          const startOfToday = new Date()
          startOfToday.setHours(0, 0, 0, 0)
          const todayStart = startOfToday.getTime()
          const reportKeys = new Set<string>()
          const checkoffKeys = new Set<string>()
          for (const score of classTables.scores) {
            if (score.graderId !== myUserId) continue
            if (new Date(score.updatedAt).getTime() < todayStart) continue
            if (score.type === 2) reportKeys.add(`${score.indId}:${score.stuId}`)
            else if (score.type === 0) checkoffKeys.add(`${score.indId}:${score.stuId}`)
          }
          setMyReports(reportKeys.size)
          setMyCheckoffs(checkoffKeys.size)
        }
      } catch {
        if (!cancelled) {
          setExperiments([])
          setTables(null)
          setSelectedId(null)
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void run()
    return () => {
      cancelled = true
    }
  }, [classId, myUserId])

  const experiment = useMemo(
    () => experiments.find((item) => item.id === selectedId) ?? null,
    [experiments, selectedId],
  )
  const total = tables?.students.length ?? null

  // 已验收：选中实验存在功能测试 / 验收问答成绩的学生数
  const checkedOff = useMemo(() => {
    if (!tables || !selectedId) return null
    const ids = new Set(
      tables.scores
        .filter((score) => score.indId === selectedId && (score.type === 0 || score.type === 1))
        .map((score) => score.stuId),
    )
    return ids.size
  }, [tables, selectedId])

  // 报告提交 / 未批改（选中实验，上游获取失败时置空）
  useEffect(() => {
    if (!selectedId || !tables) {
      setSubmitted(null)
      setUngraded(null)
      setReportLoading(false)
      return
    }
    let cancelled = false
    setReportLoading(true)
    const run = async () => {
      try {
        const preview = await fetchXzzdPushPreview(selectedId, 'report')
        if (cancelled) return
        const stuIdByNo = new Map(
          tables.students.map((student) => [student.studentNo, student.stuId]),
        )
        const noByPerson = new Map(preview.students.map((student) => [student.id, student.studentNo]))
        const gradedStuIds = new Set(
          tables.scores
            .filter((score) => score.type === 2 && score.indId === selectedId)
            .map((score) => score.stuId),
        )
        const personIds = new Set<number>()
        let graded = 0
        for (const row of preview.submissions) {
          const personId = row.created_by?.id
          if (personId == null) continue
          personIds.add(personId)
          const studentNo = noByPerson.get(personId)
          const stuId = studentNo ? stuIdByNo.get(studentNo) : undefined
          if (stuId && gradedStuIds.has(stuId)) graded += 1
        }
        setSubmitted(personIds.size)
        setUngraded(personIds.size - graded)
      } catch {
        if (!cancelled) {
          setSubmitted(null)
          setUngraded(null)
        }
      } finally {
        if (!cancelled) setReportLoading(false)
      }
    }
    void run()
    return () => {
      cancelled = true
    }
  }, [selectedId, tables])

  const reportHref = experiment ? `/console/reports/${experiment.id}` : null
  const pushHref = experiment ? `/console/experiments/${experiment.id}/xzzd-push` : null
  const deadline = useMemo(() => (experiment ? deadlineInfo(experiment) : null), [experiment])

  return (
    <div className="mx-auto max-w-6xl">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
        className="mb-8"
      >
        <h1 className="text-2xl font-bold tracking-tight md:text-3xl">
          {greeting}，{user?.username ?? user?.name ?? '助教'}
        </h1>
        <p className="mt-1 text-sm text-fg-muted">助教工作台 · 计算机系统课程</p>
      </motion.div>

      {!currentClass ? (
        <EmptyState icon={School} title="尚未绑定班级" hint="请先在设置中绑定班级" />
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <ExperimentCard
              index={0}
              experiment={experiment}
              experiments={experiments}
              onSelect={setSelectedId}
              loading={loading}
            />
            <MetricCard
              index={1}
              icon={ClipboardCheck}
              tone="brand"
              label="报告提交"
              value={submitted}
              total={total}
              sub={!loading && !reportLoading && ungraded != null ? `未批改 ${ungraded} 份` : undefined}
              hint="点击批改报告"
              emptyHint="暂无可批改的实验"
              href={reportHref}
              loading={loading || reportLoading}
            />
            <MetricCard
              index={2}
              icon={ShieldCheck}
              tone="amber"
              label="当前验收"
              value={checkedOff}
              total={total}
              hint="点击进行验收"
              href="/console/checkoff"
              loading={loading}
            />
          </div>

          <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <ActionCard
              index={0}
              icon={Upload}
              tone="purple"
              label="去推送成绩"
              hint="将成绩推送至学在浙大"
              emptyHint="暂无可推送的实验"
              href={pushHref}
            />
            <WorkloadCard index={1} reports={myReports} checkoffs={myCheckoffs} loading={loading} />
            <DeadlineCard index={2} deadline={deadline} loading={loading} />
          </div>
        </>
      )}
    </div>
  )
}

type DeadlineInfo = { label: string; days: number; past: boolean }

/** 取最近一个未来截止时间；全已过期则取最近一个过期时间并标记已截止 */
function deadlineInfo(experiment: Experiment): DeadlineInfo | null {
  const now = Date.now()
  const parsed = [
    { label: '报告提交截止', time: experiment.reportDeadline },
    { label: '验收截止', time: experiment.checkoffDeadline },
  ]
    .map((item) => ({ label: item.label, t: item.time == null ? Number.NaN : Date.parse(item.time) }))
    .filter((item) => Number.isFinite(item.t))
  if (parsed.length === 0) return null
  const future = parsed.filter((item) => item.t > now)
  if (future.length > 0) {
    const nearest = future.reduce((a, b) => (a.t < b.t ? a : b))
    return {
      label: nearest.label,
      days: Math.max(1, Math.ceil((nearest.t - now) / DAY_MS)),
      past: false,
    }
  }
  const latest = parsed.reduce((a, b) => (a.t > b.t ? a : b))
  return { label: latest.label, days: Math.max(1, Math.ceil((now - latest.t) / DAY_MS)), past: true }
}

function MetricCard({
  index,
  icon: Ico,
  tone,
  label,
  value,
  total,
  sub,
  hint,
  emptyHint,
  href,
  loading,
}: {
  index: number
  icon: IconComponent
  tone: keyof typeof TONES
  label: string
  value: number | null
  total: number | null
  sub?: string
  hint: string
  emptyHint?: string
  href: string | null
  loading: boolean
}) {
  const display = (n: number | null) => (loading ? '—' : (n ?? '—'))
  const body = (
    <Card index={index} hover={href != null} className="flex h-full flex-col">
      <div className={cn('flex h-10 w-10 items-center justify-center rounded-xl', TONES[tone])}>
        <Ico width={19} height={19} className="shrink-0" />
      </div>
      <div className="mt-3 text-xs font-semibold uppercase tracking-wider text-fg-subtle">
        {label}
      </div>
      <div className="mt-1 flex items-baseline gap-1">
        <span className="tabular text-3xl font-bold tracking-tight">{display(value)}</span>
        <span className="text-sm text-fg-muted">/ {display(total)}</span>
      </div>
      {sub != null && <div className="mt-0.5 text-xs text-fg-subtle">{sub}</div>}
      <div className="mt-auto flex items-center gap-1 pt-3 text-xs font-semibold">
        {href != null ? (
          <span className="inline-flex items-center gap-1 text-brand-600 dark:text-brand-300">
            {hint}
            <ArrowUpRight
              width={13}
              height={13}
              className="shrink-0 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
            />
          </span>
        ) : (
          <span className="text-fg-subtle">{emptyHint ?? '暂无数据'}</span>
        )}
      </div>
    </Card>
  )
  if (!href) return body
  return (
    <Link to={href} className="group block">
      {body}
    </Link>
  )
}

function ActionCard({
  index,
  icon: Ico,
  tone,
  label,
  hint,
  emptyHint,
  href,
}: {
  index: number
  icon: IconComponent
  tone: keyof typeof TONES
  label: string
  hint: string
  emptyHint?: string
  href: string | null
}) {
  const body = (
    <Card index={index} hover={href != null} className="flex h-full items-center gap-4">
      <div
        className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-xl', TONES[tone])}
      >
        <Ico width={19} height={19} className="shrink-0" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-sm font-bold">{label}</div>
        <div className="truncate text-xs text-fg-subtle">
          {href != null ? hint : (emptyHint ?? '暂无数据')}
        </div>
      </div>
      {href != null && (
        <ArrowUpRight
          width={16}
          height={16}
          className="shrink-0 text-fg-subtle transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
        />
      )}
    </Card>
  )
  if (!href) return body
  return (
    <Link to={href} className="group block">
      {body}
    </Link>
  )
}

function WorkloadCard({
  index,
  reports,
  checkoffs,
  loading,
}: {
  index: number
  reports: number | null
  checkoffs: number | null
  loading: boolean
}) {
  const display = (n: number | null) => (loading ? '—' : (n ?? '—'))
  return (
    <Card index={index} className="flex h-full flex-col">
      <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-500/10 text-brand-600 dark:text-brand-300">
        <UserCheck width={19} height={19} className="shrink-0" />
      </div>
      <div className="mt-3 text-xs font-semibold uppercase tracking-wider text-fg-subtle">
        今日完成
      </div>
      <div className="mt-2 flex flex-1 flex-col justify-center gap-2">
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-xs text-fg-muted">批改报告</span>
          <span className="tabular text-xl font-bold tracking-tight">
            {display(reports)}
            <span className="ms-0.5 text-xs font-normal text-fg-subtle">份</span>
          </span>
        </div>
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-xs text-fg-muted">验收</span>
          <span className="tabular text-xl font-bold tracking-tight">
            {display(checkoffs)}
            <span className="ms-0.5 text-xs font-normal text-fg-subtle">人</span>
          </span>
        </div>
      </div>
    </Card>
  )
}

function DeadlineCard({
  index,
  deadline,
  loading,
}: {
  index: number
  deadline: DeadlineInfo | null
  loading: boolean
}) {
  return (
    <Card index={index} className="flex h-full flex-col">
      <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400">
        <CalendarClock width={19} height={19} className="shrink-0" />
      </div>
      <div className="mt-3 text-xs font-semibold uppercase tracking-wider text-fg-subtle">
        截止提醒
      </div>
      {loading ? (
        <div className="mt-1 text-sm text-fg-subtle">加载中…</div>
      ) : deadline == null ? (
        <div className="mt-1 text-sm text-fg-subtle">暂无截止时间</div>
      ) : (
        <>
          <div className="mt-1 text-xs text-fg-muted">
            {deadline.past ? '该实验' : `距离该实验${deadline.label}`}
          </div>
          <div className="mt-1 text-2xl font-bold tracking-tight">
            {deadline.past ? `已截止 ${deadline.days} 天` : `还有 ${deadline.days} 天`}
          </div>
        </>
      )}
    </Card>
  )
}

function ExperimentCard({
  index,
  experiment,
  experiments,
  onSelect,
  loading,
}: {
  index: number
  experiment: Experiment | null
  experiments: Experiment[]
  onSelect: (id: string) => void
  loading: boolean
}) {
  return (
    <Card index={index} className="flex h-full flex-col">
      <div className="flex items-start justify-between gap-2">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
          <FlaskConical width={19} height={19} className="shrink-0" />
        </div>
        <Dropdown>
          <Button size="sm" variant="secondary" isDisabled={experiments.length === 0}>
            选择其它实验
          </Button>
          <Dropdown.Popover>
            <Dropdown.Menu onAction={(key) => onSelect(String(key))}>
              {experiments.map((item) => (
                <Dropdown.Item
                  key={item.id}
                  id={item.id}
                  textValue={`${item.mark} · ${item.title}`}
                >
                  <Label>{`${item.mark} · ${item.title}`}</Label>
                </Dropdown.Item>
              ))}
            </Dropdown.Menu>
          </Dropdown.Popover>
        </Dropdown>
      </div>
      <div className="mt-3 text-xs font-semibold uppercase tracking-wider text-fg-subtle">
        当前最近实验
      </div>
      <div className="mt-1 text-lg font-bold">
        {loading ? '加载中…' : (experiment?.mark ?? '暂无实验')}
      </div>
      {experiment && <div className="mt-0.5 text-sm text-fg-muted">{experiment.title}</div>}
    </Card>
  )
}
