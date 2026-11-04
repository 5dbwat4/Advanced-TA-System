import { Chip, Spinner } from '@heroui/react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'

import CalendarClock from '~icons/lucide/calendar-clock'
import ListOrdered from '~icons/lucide/list-ordered'
import RefreshCw from '~icons/lucide/refresh-cw'
import Users from '~icons/lucide/users'
import X from '~icons/lucide/x'
import { Card, EmptyState } from '@/components/ui/Card'
import { IconAction } from '@/components/ui/IconAction'
import { PageHeader } from '@/components/ui/PageHeader'
import { PendingButton } from '@/components/ui/PendingButton'
import {
  cancelStudentCheckoffQueue,
  fetchStudentCheckoffQueue,
  joinStudentCheckoffQueue,
  type StudentQueueExperiment,
} from '@/lib/api'
import { useAuth } from '@/lib/auth'
import { getErrorMessage } from '@/lib/error'
import { formatDateTime } from '@/lib/format'

/** 排队状态轮询间隔 */
const QUEUE_POLL_MS = 15_000
/** 「已等待 X 分钟」文案的刷新间隔 */
const WAIT_TEXT_REFRESH_MS = 30_000

export default function StudentQueue() {
  const { user } = useAuth()
  const [experiments, setExperiments] = useState<StudentQueueExperiment[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  /** 正在加入 / 取消排队的实验 id */
  const [pendingId, setPendingId] = useState<string | null>(null)
  /** 页面当前时间，驱动等待时长文案刷新 */
  const [now, setNow] = useState(() => Date.now())
  /** 客户端与服务端的时钟偏差（毫秒），避免本机时间不准导致等待时长算错 */
  const [clockOffset, setClockOffset] = useState(0)

  /** 上一轮快照：用于识别「验收完成后被自动移出队列」 */
  const snapshotRef = useRef<StudentQueueExperiment[]>([])

  const applySnapshot = useCallback(
    (next: StudentQueueExperiment[], serverTime: string, detectRemoval: boolean) => {
      const server = new Date(serverTime).getTime()
      if (!Number.isNaN(server)) setClockOffset(server - Date.now())

      const previous = new Map(snapshotRef.current.map((item) => [item.id, item]))
      for (const experiment of next) {
        const before = previous.get(experiment.id)
        // 上一次还在排队、这一次消失且已出分 → 助教保存成绩后自动移出了队列
        if (detectRemoval && before?.myEntry && !experiment.myEntry && experiment.checkedOff) {
          toast.success(`已完成 ${experiment.mark} 验收，已自动移出队列`)
        }
      }

      snapshotRef.current = next
      setExperiments(next)
      setNow(Date.now())
    },
    [],
  )

  const reload = useCallback(
    async (options: { silent?: boolean; detectRemoval?: boolean } = {}) => {
      if (!options.silent) setLoading(true)
      try {
        const result = await fetchStudentCheckoffQueue()
        applySnapshot(result.experiments, result.serverTime, options.detectRemoval ?? true)
        setError(null)
      } catch (err) {
        // 后台轮询失败时保持静默，等下一轮重试，避免页面闪烁
        if (!options.silent) setError(getErrorMessage(err, '加载失败'))
      } finally {
        if (!options.silent) setLoading(false)
      }
    },
    [applySnapshot],
  )

  // 首次加载：失败时展示错误框，可手动重试
  useEffect(() => {
    let cancelled = false
    fetchStudentCheckoffQueue()
      .then((result) => {
        if (cancelled) return
        applySnapshot(result.experiments, result.serverTime, true)
        setError(null)
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
  }, [applySnapshot])

  // 15 秒轮询一次；页面重新可见时立即刷新
  useEffect(() => {
    const timer = window.setInterval(() => void reload({ silent: true }), QUEUE_POLL_MS)
    const onVisible = () => {
      if (document.visibilityState === 'visible') void reload({ silent: true })
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [reload])

  // 「已等待 X 分钟」随时间自动推进
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), WAIT_TEXT_REFRESH_MS)
    return () => window.clearInterval(timer)
  }, [])

  const refresh = async () => {
    setRefreshing(true)
    try {
      await reload({ silent: true })
    } finally {
      setRefreshing(false)
    }
  }

  const joinQueue = async (experiment: StudentQueueExperiment) => {
    setPendingId(experiment.id)
    try {
      await joinStudentCheckoffQueue(experiment.id)
      toast.success(`已加入 ${experiment.mark} 排队`)
      await reload({ silent: true })
    } catch (err) {
      toast.error(getErrorMessage(err, '加入队列失败'))
    } finally {
      setPendingId(null)
    }
  }

  const cancelQueue = async (experiment: StudentQueueExperiment) => {
    setPendingId(experiment.id)
    try {
      await cancelStudentCheckoffQueue(experiment.id)
      toast.success(`已取消 ${experiment.mark} 排队`)
      // 主动取消不应触发「已完成验收」的自动移出提示
      await reload({ silent: true, detectRemoval: false })
    } catch (err) {
      toast.error(getErrorMessage(err, '取消排队失败'))
    } finally {
      setPendingId(null)
    }
  }

  const klass = user?.classes[0] ?? null
  const serverNow = now + clockOffset

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        title="排队验收"
        subtitle="排队仅用于现场验收顺序；助教会线下叫号，请留意现场。验收结束后会自动移出队列。"
        actions={
          <IconAction
            label="刷新"
            tooltip="刷新排队状态"
            placement="bottom"
            variant="secondary"
            isPending={refreshing}
            onPress={() => void refresh()}
          >
            <RefreshCw width={15} height={15} className="shrink-0" />
          </IconAction>
        }
      />

      {loading ? (
        <div className="flex justify-center py-20">
          <Spinner size="lg" />
        </div>
      ) : error ? (
        <div className="rounded-3xl border border-line bg-elevated/80 p-8 text-center">
          <div className="text-sm text-danger">{error}</div>
          <PendingButton
            size="sm"
            variant="secondary"
            className="mt-4"
            icon={RefreshCw}
            pendingLabel="重试中"
            isPending={loading}
            onPress={() => void reload()}
          >
            重试
          </PendingButton>
        </div>
      ) : !klass ? (
        <EmptyState
          icon={Users}
          title="未绑定班级"
          hint="排队队列按班级共享，请联系助教把账号绑定到班级后再使用。"
        />
      ) : experiments.length === 0 ? (
        <EmptyState
          icon={ListOrdered}
          title="当前没有开放验收的实验"
          hint="实验开放验收后，这里会显示可以排队的实验。"
        />
      ) : (
        <div className="flex flex-col gap-3">
          {experiments.map((experiment, index) => (
            <QueueCard
              key={experiment.id}
              index={index}
              experiment={experiment}
              now={serverNow}
              pending={pendingId === experiment.id}
              disabled={pendingId != null && pendingId !== experiment.id}
              onJoin={() => void joinQueue(experiment)}
              onCancel={() => void cancelQueue(experiment)}
            />
          ))}
        </div>
      )}
    </div>
  )
}

/** 单个实验的排队卡片 */
function QueueCard({
  index,
  experiment,
  now,
  pending,
  disabled,
  onJoin,
  onCancel,
}: {
  index: number
  experiment: StudentQueueExperiment
  /** 当前服务端时间（毫秒），用于计算已等待时长 */
  now: number
  pending: boolean
  disabled: boolean
  onJoin: () => void
  onCancel: () => void
}) {
  const myEntry = experiment.myEntry

  return (
    <Card index={index} className="flex flex-wrap items-start justify-between gap-4">
      <div className="flex min-w-0 flex-1 items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-500/10 text-brand-600 dark:text-brand-300">
          <ListOrdered width={18} height={18} className="shrink-0" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-xs font-semibold tracking-widest text-fg-subtle">
            {experiment.mark}
          </div>
          <div className="mt-0.5 truncate text-base font-bold">{experiment.title}</div>
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-fg-subtle">
            <span className="inline-flex items-center gap-1">
              <CalendarClock width={11} height={11} className="shrink-0" />
              验收截止 {formatDateTime(experiment.checkoffDeadline)}
            </span>
            <span className="inline-flex items-center gap-1">
              <Users width={11} height={11} className="shrink-0" />
              当前{' '}
              <span className="tabular font-semibold text-fg-muted">{experiment.queueLength}</span>{' '}
              人排队
            </span>
          </div>
        </div>
      </div>

      <div className="flex shrink-0 flex-col items-end gap-2">
        {myEntry ? (
          <>
            <Chip size="sm" variant="soft" color="accent" className="tabular">
              排队中 · 第 {myEntry.position} 位
            </Chip>
            <div className="text-right text-xs text-fg-subtle">
              {myEntry.ahead > 0 ? `前面还有 ${myEntry.ahead} 人` : '已排到最前'} · 已等待{' '}
              {formatWait(myEntry.joinedAt, now)}
            </div>
            <PendingButton
              size="sm"
              variant="secondary"
              icon={X}
              pendingLabel="取消中"
              isPending={pending}
              isDisabled={disabled}
              onPress={onCancel}
            >
              取消排队
            </PendingButton>
          </>
        ) : experiment.checkedOff ? (
          <>
            <Chip size="sm" variant="soft" color="success">
              已完成验收
            </Chip>
            <div className="text-right text-xs text-fg-subtle">如需再次验收可重新排队</div>
            <PendingButton
              size="sm"
              variant="secondary"
              icon={ListOrdered}
              pendingLabel="加入中"
              isPending={pending}
              isDisabled={disabled}
              onPress={onJoin}
            >
              重新排队
            </PendingButton>
          </>
        ) : (
          <>
            <Chip size="sm" variant="soft" color="default">
              未排队
            </Chip>
            <PendingButton
              size="sm"
              variant="primary"
              icon={ListOrdered}
              pendingLabel="加入中"
              isPending={pending}
              isDisabled={disabled}
              onPress={onJoin}
            >
              加入队列
            </PendingButton>
          </>
        )}
      </div>
    </Card>
  )
}

/** 已等待时长：不足 1 分钟、分钟、小时 */
function formatWait(joinedAt: string, now: number): string {
  const joined = new Date(joinedAt).getTime()
  if (Number.isNaN(joined)) return '不到 1 分钟'
  const minutes = Math.floor(Math.max(0, now - joined) / 60_000)
  if (minutes < 1) return '不到 1 分钟'
  if (minutes < 60) return `${minutes} 分钟`
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  return rest === 0 ? `${hours} 小时` : `${hours} 小时 ${rest} 分钟`
}
