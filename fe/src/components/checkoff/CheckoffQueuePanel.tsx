import { Button, Chip, Input, ListBox, Select, Spinner } from '@heroui/react'
import { AnimatePresence, motion } from 'motion/react'
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ChangeEvent,
  type ReactNode,
} from 'react'
import { toast } from 'sonner'

import ArrowDown from '~icons/lucide/arrow-down'
import ArrowUp from '~icons/lucide/arrow-up'
import BellOff from '~icons/lucide/bell-off'
import BellRing from '~icons/lucide/bell-ring'
import Plus from '~icons/lucide/plus'
import RefreshCw from '~icons/lucide/refresh-cw'
import ScanSearch from '~icons/lucide/scan-search'
import { AvatarImage } from '@/components/ui/AvatarImage'
import { IconAction } from '@/components/ui/IconAction'
import {
  cancelCheckoffQueueNotify,
  fetchCheckoff,
  insertCheckoffQueue,
  notifyCheckoffQueueEntry,
  reorderCheckoffQueue,
  type CheckoffExperiment,
  type CheckoffQueueEntry,
  type CheckoffQueueState,
  type CheckoffStudent,
} from '@/lib/api'
import { getErrorMessage } from '@/lib/error'
import { matchStudent } from '@/lib/pinyin'
import { cn } from '@/lib/utils'

/** 队列为空时没有需要排除的学生（避免每次渲染新建 Set） */
const NO_EXCLUDED_STUDENTS: Set<string> = new Set()

/** 同一实验下的排队条目（后端已按位次排好，组内不再重排） */
type QueueGroup = {
  experimentId: string
  mark: string
  title: string
  entries: CheckoffQueueEntry[]
}

/** 按实验分组：组顺序沿用条目首次出现顺序，不重排组内顺序 */
function groupByExperiment(entries: CheckoffQueueEntry[]): QueueGroup[] {
  const order: string[] = []
  const map = new Map<string, QueueGroup>()
  for (const entry of entries) {
    let group = map.get(entry.experimentId)
    if (!group) {
      group = {
        experimentId: entry.experimentId,
        mark: entry.experimentMark,
        title: entry.experimentTitle,
        entries: [],
      }
      map.set(entry.experimentId, group)
      order.push(entry.experimentId)
    }
    group.entries.push(entry)
  }
  return order.map((id) => map.get(id)).filter((group): group is QueueGroup => group != null)
}

/** 时刻文案：只写 HH:mm（排队面板只关心当天几点） */
function timeLabel(value: string | null | undefined): string {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`
}

/** 等待时长文案：按分钟粒度展示，超过 1 小时补上小时 */
function waitedLabel(joinedAt: string, now: number): string {
  const joined = new Date(joinedAt).getTime()
  if (Number.isNaN(joined)) return '—'
  const minutes = Math.floor(Math.max(0, now - joined) / 60_000)
  if (minutes < 1) return '刚刚加入'
  if (minutes < 60) return `已等待 ${minutes} 分钟`
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  return rest > 0 ? `已等待 ${hours} 小时 ${rest} 分钟` : `已等待 ${hours} 小时`
}

/** 行内时间信息：排队时间 + 等待时长；已叫号 / 验收中再追加对应时刻 */
function timeLine(entry: CheckoffQueueEntry, now: number): string {
  const parts = [`排队 ${timeLabel(entry.joinedAt)}`, waitedLabel(entry.joinedAt, now)]
  if (entry.state === 'NOTIFIED') parts.push(`叫号 ${timeLabel(entry.notifiedAt)}`)
  if (entry.state === 'CHECKING') parts.push(`开始 ${timeLabel(entry.checkingAt)}`)
  return parts.join(' · ')
}

/** 状态徽标文案与配色（排队中=灰 / 已叫号=琥珀 / 验收中=品牌蓝） */
function stateChip(entry: CheckoffQueueEntry): {
  color: 'default' | 'warning' | 'accent'
  label: string
} {
  if (entry.state === 'NOTIFIED') {
    return {
      color: 'warning',
      label: entry.notifiedBy ? `已叫号 · ${entry.notifiedBy.name}` : '已叫号',
    }
  }
  if (entry.state === 'CHECKING') {
    return {
      color: 'accent',
      label: entry.checkingBy ? `验收中 · ${entry.checkingBy.name}` : '验收中',
    }
  }
  return { color: 'default', label: '排队中（未被叫号）' }
}

/** 分组小计：只列出非零状态，避免小组里出现一串 0 */
function subtotalLabel(entries: CheckoffQueueEntry[]): string {
  const counts: Record<CheckoffQueueState, number> = { WAITING: 0, NOTIFIED: 0, CHECKING: 0 }
  for (const entry of entries) counts[entry.state] += 1
  const parts: string[] = []
  if (counts.WAITING > 0) parts.push(`排队中 ${counts.WAITING}`)
  if (counts.NOTIFIED > 0) parts.push(`已叫号 ${counts.NOTIFIED}`)
  if (counts.CHECKING > 0) parts.push(`验收中 ${counts.CHECKING}`)
  return parts.join(' · ')
}

/**
 * 内联「添加学生」：搜索本班学生（姓名 / 学号 / 拼音），排除该实验已在队列中的人，
 * 点击即插入队尾。所有请求失败都只影响这一小块，不打断现场验收。
 */
function QueueAddStudent({
  classId,
  experimentId,
  existingUserIds,
  onAdded,
}: {
  classId: string
  experimentId: string
  /** 该实验已在本队列中的学生，不再出现在候选里 */
  existingUserIds: Set<string>
  onAdded: () => void
}) {
  const [students, setStudents] = useState<CheckoffStudent[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [pendingId, setPendingId] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)

  // 班级人数不多，一次拉完本班名单，检索（含拼音）在前端完成
  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    fetchCheckoff({ classId })
      .then((res) => {
        if (!cancelled) setStudents(res.students)
      })
      .catch((err) => {
        if (!cancelled) setError(getErrorMessage(err, '加载名单失败'))
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [classId, reloadKey])

  const candidates = useMemo(
    () =>
      students.filter(
        (student) => !existingUserIds.has(student.userId) && matchStudent(query, student),
      ),
    [students, existingUserIds, query],
  )

  const handleAdd = useCallback(
    (student: CheckoffStudent) => {
      setPendingId(student.userId)
      insertCheckoffQueue({ experimentId, userId: student.userId })
        .then((res) => {
          if (res.already) toast.info('该学生已在队列中')
          else toast.success(`已把 ${student.name} 加入队列`)
          onAdded()
        })
        .catch((err) => toast.error(getErrorMessage(err, '加入队列失败')))
        .finally(() => setPendingId(null))
    },
    [experimentId, onAdded],
  )

  const onChange = (event: ChangeEvent<HTMLInputElement>) => setQuery(event.target.value)

  return (
    <motion.div
      initial={{ opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -6 }}
      transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
      className="flex flex-col gap-2 rounded-xl border border-dashed border-line bg-sunken/40 p-2.5"
    >
      <div className="relative">
        <ScanSearch
          width={14}
          height={14}
          className="pointer-events-none absolute left-2.5 top-1/2 shrink-0 -translate-y-1/2 text-fg-subtle"
        />
        <Input
          fullWidth
          value={query}
          onChange={onChange}
          placeholder="搜索本班学生（姓名 / 学号 / 拼音）"
          aria-label="搜索要加入队列的学生"
          className="tabular w-full rounded-lg border border-line bg-elevated py-1.5 pl-8 pr-8 text-xs text-fg outline-none transition-all placeholder:text-fg-subtle focus:border-brand-500 focus:ring-2 focus:ring-brand-500/15"
        />
        {loading && <Spinner size="sm" className="absolute right-2.5 top-1/2 -translate-y-1/2" />}
      </div>

      {error ? (
        <div className="flex items-center justify-between gap-2 py-1">
          <span className="min-w-0 flex-1 truncate text-[11px] text-danger">{error}</span>
          <Button size="sm" variant="secondary" onPress={() => setReloadKey((key) => key + 1)}>
            重试
          </Button>
        </div>
      ) : loading && students.length === 0 ? (
        <div className="flex justify-center py-3">
          <Spinner size="sm" />
        </div>
      ) : candidates.length === 0 ? (
        <p className="py-3 text-center text-[11px] text-fg-subtle">
          {query ? `未找到与“${query}”匹配的学生` : '本班学生都已在队列中'}
        </p>
      ) : (
        <div className="flex max-h-56 flex-col gap-1 overflow-y-auto">
          {candidates.map((student) => (
            <button
              key={student.userId}
              type="button"
              disabled={pendingId !== null}
              onClick={() => handleAdd(student)}
              className="flex w-full items-center gap-2 rounded-lg border border-line bg-elevated px-2 py-1.5 text-left transition-colors hover:border-brand-500/40 disabled:opacity-60"
            >
              <AvatarImage id={student.avatar} size={26} fallback={student.name.slice(0, 1)} />
              <div className="min-w-0 flex-1">
                <div className="truncate text-xs font-semibold text-fg">{student.name}</div>
                <div className="tabular truncate text-[11px] text-fg-muted">
                  {student.studentId}
                </div>
              </div>
              {pendingId === student.userId ? (
                <Spinner size="sm" />
              ) : (
                <Plus
                  width={14}
                  height={14}
                  className="shrink-0 text-brand-600 dark:text-brand-300"
                />
              )}
            </button>
          ))}
        </div>
      )}
    </motion.div>
  )
}

/**
 * 排队情况面板：按实验分组展示全班共享队列，当前已选实验排在最前并高亮；
 * 点击任意一行 → onPick（由页面负责切实验 + 预填搜索）。
 * 助教可在此叫号 / 撤回叫号 / 上移下移 / 手动添加学生；等待时长每 30s 刷新。
 */
export function CheckoffQueuePanel({
  classId,
  currentUserId,
  experiments,
  entries,
  loading,
  currentExperimentId,
  onPick,
  onRefresh,
}: {
  classId: string
  currentUserId: string
  experiments: CheckoffExperiment[]
  entries: CheckoffQueueEntry[]
  loading: boolean
  currentExperimentId: string | null
  onPick: (entry: CheckoffQueueEntry) => void
  onRefresh: () => void
}): ReactNode {
  // 等待时长按分钟展示，30s 刷新一次即可（面板随 Modal 打开时挂载，初值即打开时间）
  const [now, setNow] = useState(() => Date.now())
  // 正在请求的操作，key = `${entryId}:${动作}`，只让对应的按钮转圈
  const [pending, setPending] = useState<string | null>(null)
  // 分组内联「添加学生」展开的实验 id
  const [addingGroupId, setAddingGroupId] = useState<string | null>(null)
  // 队列为空时的手动添加：展开状态 + 所选实验
  const [emptyAddOpen, setEmptyAddOpen] = useState(false)
  const [emptyAddExperimentId, setEmptyAddExperimentId] = useState<string | null>(null)

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30_000)
    return () => window.clearInterval(timer)
  }, [])

  const groups = useMemo(() => {
    const list = groupByExperiment(entries)
    // 当前已选实验排到最前，方便助教优先处理手头的实验
    if (currentExperimentId) {
      const index = list.findIndex((group) => group.experimentId === currentExperimentId)
      if (index > 0) list.unshift(...list.splice(index, 1))
    }
    return list
  }, [entries, currentExperimentId])

  /** 统一的队列操作包装：pending → 调接口 → 出错 toast → 无论如何刷新一次快照 */
  const runAction = useCallback(
    async (key: string, task: () => Promise<unknown>, failure: string) => {
      setPending(key)
      try {
        await task()
      } catch (error) {
        toast.error(getErrorMessage(error, failure))
      } finally {
        setPending(null)
        // 正常情况 socket 广播也会更新，这里主动拉一次兜底（断线时面板不至于滞后）
        onRefresh()
      }
    },
    [onRefresh],
  )

  const handleNotify = useCallback(
    (entry: CheckoffQueueEntry) => {
      void runAction(
        `${entry.id}:notify`,
        async () => {
          await notifyCheckoffQueueEntry(entry.id)
          toast.success(`已提醒 ${entry.name} 准备验收`)
        },
        '叫号失败',
      )
    },
    [runAction],
  )

  const handleCancelNotify = useCallback(
    (entry: CheckoffQueueEntry) => {
      void runAction(
        `${entry.id}:cancel`,
        async () => {
          await cancelCheckoffQueueNotify(entry.id)
          toast.success(`已撤回对 ${entry.name} 的叫号`)
        },
        '撤回叫号失败',
      )
    },
    [runAction],
  )

  const handleMove = useCallback(
    (group: QueueGroup, index: number, direction: -1 | 1) => {
      const target = index + direction
      if (target < 0 || target >= group.entries.length) return
      const ordered = [...group.entries]
      const [moved] = ordered.splice(index, 1)
      if (!moved) return
      ordered.splice(target, 0, moved)
      void runAction(
        `${moved.id}:${direction === -1 ? 'up' : 'down'}`,
        () =>
          reorderCheckoffQueue({
            experimentId: group.experimentId,
            entryIds: ordered.map((entry) => entry.id),
          }),
        '调整顺序失败',
      )
    },
    [runAction],
  )

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <span className="text-sm font-bold text-fg">排队情况</span>
        <span className="tabular rounded-md bg-sunken px-1.5 py-0.5 text-[11px] font-semibold text-fg-subtle">
          {entries.length} 人
        </span>
        <div className="ml-auto">
          <IconAction
            label="刷新排队情况"
            isPending={loading && entries.length > 0}
            onPress={onRefresh}
          >
            <RefreshCw width={15} height={15} className="shrink-0" />
          </IconAction>
        </div>
      </div>

      {loading && entries.length === 0 ? (
        <div className="flex justify-center py-8">
          <Spinner size="sm" />
        </div>
      ) : entries.length === 0 ? (
        <div className="flex flex-col gap-2">
          <p className="rounded-xl border border-dashed border-line py-6 text-center text-xs text-fg-subtle">
            暂无学生排队
          </p>
          {experiments.length > 0 && (
            <div className="flex justify-center">
              <Button
                size="sm"
                variant="secondary"
                onPress={() => {
                  setEmptyAddOpen((open) => !open)
                  if (!emptyAddExperimentId) {
                    setEmptyAddExperimentId(currentExperimentId ?? experiments[0]?.id ?? null)
                  }
                }}
              >
                <Plus width={14} height={14} className="shrink-0" />
                {emptyAddOpen ? '收起' : '手动添加学生'}
              </Button>
            </div>
          )}
          <AnimatePresence initial={false}>
            {emptyAddOpen && (
              <motion.div
                initial={{ opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
                className="flex flex-col gap-2"
              >
                <Select
                  aria-label="选择实验"
                  className="w-full"
                  placeholder="选择要加入的实验"
                  value={emptyAddExperimentId}
                  onChange={(key) =>
                    setEmptyAddExperimentId(key == null ? null : String(key))
                  }
                >
                  <Select.Trigger>
                    <Select.Value />
                    <Select.Indicator />
                  </Select.Trigger>
                  <Select.Popover>
                    <ListBox>
                      {experiments.map((item) => (
                        <ListBox.Item
                          key={item.id}
                          id={item.id}
                          textValue={`${item.mark} ${item.title}`}
                        >
                          {item.mark} {item.title}
                          <ListBox.ItemIndicator />
                        </ListBox.Item>
                      ))}
                    </ListBox>
                  </Select.Popover>
                </Select>
                {emptyAddExperimentId && (
                  <QueueAddStudent
                    classId={classId}
                    experimentId={emptyAddExperimentId}
                    existingUserIds={NO_EXCLUDED_STUDENTS}
                    onAdded={onRefresh}
                  />
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      ) : (
        groups.map((group) => {
          const open = addingGroupId === group.experimentId
          const existingUserIds = new Set(group.entries.map((entry) => entry.userId))
          return (
            <section key={group.experimentId} className="flex flex-col gap-2">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1 px-1">
                <span className="min-w-0 truncate text-xs font-semibold text-fg">
                  {group.mark} {group.title}
                </span>
                <span className="tabular shrink-0 rounded-md bg-sunken px-1.5 py-0.5 text-[11px] font-semibold text-fg-subtle">
                  {group.entries.length} 人
                </span>
                <span className="tabular min-w-0 truncate text-[11px] text-fg-subtle">
                  {subtotalLabel(group.entries)}
                </span>
                <div className="ml-auto shrink-0">
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 gap-1 px-2 text-[11px]"
                    onPress={() =>
                      setAddingGroupId((current) =>
                        current === group.experimentId ? null : group.experimentId,
                      )
                    }
                  >
                    <Plus width={13} height={13} className="shrink-0" />
                    {open ? '收起' : '添加'}
                  </Button>
                </div>
              </div>

              <AnimatePresence initial={false}>
                {open && (
                  <QueueAddStudent
                    classId={classId}
                    experimentId={group.experimentId}
                    existingUserIds={existingUserIds}
                    onAdded={onRefresh}
                  />
                )}
              </AnimatePresence>

              {group.entries.map((entry, index) => {
                const isCurrent = entry.experimentId === currentExperimentId
                const chip = stateChip(entry)
                // 已叫号且是自己叫的 → 可撤回；别人叫的 → 可以改成自己提醒
                const notifiedByMe = entry.notifiedBy?.id === currentUserId
                return (
                  <motion.div
                    key={entry.id}
                    layout
                    role="button"
                    tabIndex={0}
                    aria-label={`定位到 ${entry.name}`}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
                    onClick={() => onPick(entry)}
                    onKeyDown={(event) => {
                      // 只在整行本身获得焦点时响应回车/空格，避免操作按钮的按键冒泡触发行点击
                      if (event.target !== event.currentTarget) return
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault()
                        onPick(entry)
                      }
                    }}
                    className={cn(
                      'flex w-full cursor-pointer items-center gap-2.5 rounded-xl border px-2.5 py-2 text-left transition-all',
                      isCurrent
                        ? 'border-brand-500/40 bg-brand-500/5 hover:border-brand-500/60'
                        : 'border-line bg-sunken hover:border-brand-500/40',
                    )}
                  >
                    <span className="tabular w-6 shrink-0 text-[11px] font-semibold text-fg-subtle">
                      #{entry.position}
                    </span>
                    <AvatarImage id={entry.avatar} size={32} fallback={entry.name.slice(0, 1)} />
                    <div className="min-w-0 flex-1">
                      <div className="flex min-w-0 items-center gap-1.5">
                        <span className="min-w-0 truncate text-sm font-semibold text-fg">
                          {entry.name}
                        </span>
                        <Chip size="sm" variant="soft" color={chip.color} className="shrink-0">
                          {chip.label}
                        </Chip>
                      </div>
                      <div className="tabular mt-0.5 truncate text-[11px] text-fg-muted">
                        {entry.studentId}
                      </div>
                      <div className="tabular mt-0.5 truncate text-[11px] text-fg-subtle">
                        {timeLine(entry, now)}
                      </div>
                    </div>
                    {/* 操作按钮不得触发整行的 onPick */}
                    <div
                      className="flex shrink-0 items-center gap-0.5"
                      onClick={(event) => event.stopPropagation()}
                    >
                      {entry.state !== 'CHECKING' &&
                        (notifiedByMe ? (
                          <IconAction
                            label={`撤回对 ${entry.name} 的叫号`}
                            tooltip="撤回叫号"
                            placement="left"
                            isPending={pending === `${entry.id}:cancel`}
                            onPress={() => handleCancelNotify(entry)}
                          >
                            <BellOff width={14} height={14} className="shrink-0" />
                          </IconAction>
                        ) : (
                          <IconAction
                            label={`提醒 ${entry.name} 准备验收`}
                            tooltip="叫号"
                            placement="left"
                            isPending={pending === `${entry.id}:notify`}
                            onPress={() => handleNotify(entry)}
                          >
                            <BellRing width={14} height={14} className="shrink-0" />
                          </IconAction>
                        ))}
                      <IconAction
                        label={`上移 ${entry.name}`}
                        tooltip="上移"
                        placement="left"
                        isDisabled={index === 0}
                        isPending={pending === `${entry.id}:up`}
                        onPress={() => handleMove(group, index, -1)}
                      >
                        <ArrowUp width={14} height={14} className="shrink-0" />
                      </IconAction>
                      <IconAction
                        label={`下移 ${entry.name}`}
                        tooltip="下移"
                        placement="left"
                        isDisabled={index === group.entries.length - 1}
                        isPending={pending === `${entry.id}:down`}
                        onPress={() => handleMove(group, index, 1)}
                      >
                        <ArrowDown width={14} height={14} className="shrink-0" />
                      </IconAction>
                    </div>
                  </motion.div>
                )
              })}
            </section>
          )
        })
      )}

      <p className="text-[11px] leading-relaxed text-fg-subtle">
        队列为全班共享；助教会线下叫人，请在现场留意。
      </p>
    </div>
  )
}
