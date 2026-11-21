import { Button, Chip, Tooltip, useOverlayState } from '@heroui/react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'

import ArrowDown from '~icons/lucide/arrow-down'
import ArrowUp from '~icons/lucide/arrow-up'
import ChevronsUp from '~icons/lucide/chevrons-up'
import CircleStop from '~icons/lucide/circle-stop'
import Megaphone from '~icons/lucide/megaphone'
import Plus from '~icons/lucide/plus'
import RefreshCw from '~icons/lucide/refresh-cw'
import School from '~icons/lucide/school'
import Settings2 from '~icons/lucide/settings-2'
import Trash2 from '~icons/lucide/trash-2'
import Users from '~icons/lucide/users'
import { QueueTimeline } from '@/components/checkoff/QueueTimeline'
import { AvatarImage } from '@/components/ui/AvatarImage'
import { EmptyState } from '@/components/ui/Card'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { PageHeader } from '@/components/ui/PageHeader'
import { SkeletonList } from '@/components/ui/SkeletonList'
import {
  closeCheckoffSession,
  fetchCheckoff,
  fetchCheckoffSessions,
  listClassStaff,
  updateCheckoffQueue,
  type CheckoffExperiment,
  type CheckoffSession,
  type CheckoffStudent,
  type StaffMember,
} from '@/lib/api'
import { useAuth } from '@/lib/auth'
import { useCheckoffQueueUpdates } from '@/lib/checkoff-socket'
import { getErrorMessage } from '@/lib/error'
import { formatLocaleDateTime } from '@/lib/format'
import { useAsyncData } from '@/lib/request'
import { useCurrentClass } from '@/lib/store'

type QueueItem = {
  userId: string
  name: string
  studentId: string
  avatar: number | null
  experimentMark: string
  experimentTitle: string
  status: 'waiting' | 'notified' | 'called' | 'finished'
  joinedAt: string
  notifiedAt: string | null
  notifiedBy: string | null
  startedAt: string | null
  checkedBy: string | null
  finishedAt: string | null
}

export default function CheckoffQueue() {
  const currentClass = useCurrentClass()
  const { user } = useAuth()
  const classId = currentClass?.id ?? null
  const navigate = useNavigate()

  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [pending, setPending] = useState(false)
  const [closing, setClosing] = useState(false)
  const [reorderingId, setReorderingId] = useState<string | null>(null)
  const lastClickedIndex = useRef<number | null>(null)
  const closeState = useOverlayState()

  const { data, loading, error } = useAsyncData(
    () => (classId ? fetchCheckoff({ classId }) : Promise.resolve(null)),
    [classId],
  )
  const {
    data: sessionData,
    loading: sessionLoading,
    error: sessionError,
    reload: reloadSessions,
  } = useAsyncData(
    () => (classId ? fetchCheckoffSessions(classId) : Promise.resolve(null)),
    [classId],
  )
  const { data: staffData, error: staffError } = useAsyncData(
    () => (classId ? listClassStaff(classId) : Promise.resolve(null)),
    [classId],
  )

  const session = useMemo<CheckoffSession | null>(() => {
    const latest = sessionData?.sessions[0] ?? null
    return latest && !latest.closedAt ? latest : null
  }, [sessionData])
  const students = useMemo<CheckoffStudent[]>(() => data?.students ?? [], [data])
  const experiments = useMemo<CheckoffExperiment[]>(() => data?.experiments ?? [], [data])
  const studentById = useMemo(
    () => new Map(students.map((student) => [student.userId, student] as const)),
    [students],
  )
  const experimentById = useMemo(
    () => new Map(experiments.map((experiment) => [experiment.id, experiment] as const)),
    [experiments],
  )
  const tas = useMemo<StaffMember[]>(
    () => (staffData ?? []).filter((member) => member.role === 'TA'),
    [staffData],
  )
  const taById = useMemo(
    () => new Map(tas.map((ta) => [ta.id, ta] as const)),
    [tas],
  )

  const queue = useMemo<QueueItem[]>(() => {
    if (!session) return []
    return session.stats.entries.map((entry) => {
      const student = studentById.get(entry.userId)
      const experiment = experimentById.get(entry.experimentId)
      return {
        userId: entry.userId,
        name: student?.name ?? entry.userId,
        studentId: student?.studentId ?? '',
        avatar: student?.avatar ?? null,
        experimentMark: experiment?.mark ?? '',
        experimentTitle: experiment?.title ?? '',
        status: entry.status,
        joinedAt: entry.joinedAt,
        notifiedAt: entry.notifiedAt,
        notifiedBy: entry.notifiedBy,
        startedAt: entry.startedAt,
        checkedBy: entry.checkedBy,
        finishedAt: entry.finishedAt,
      }
    })
  }, [session, studentById, experimentById])

  const acceptedCount = session?.settings.acceptedExperimentIds.length ?? 0
  const priorityExperimentId =
    session?.settings.priorityExperimentIds[0] ??
    session?.settings.acceptedExperimentIds[0] ??
    null
  const priorityExperiment = priorityExperimentId
    ? experimentById.get(priorityExperimentId)
    : undefined
  const acceptedShort = priorityExperiment
    ? `${priorityExperiment.mark} · ${priorityExperiment.title}`
    : '—'
  const scopedStudents = useMemo(() => {
    if (!session || session.settings.studentScope === 'all') return []
    return session.settings.studentIds
      .map((id) => studentById.get(id))
      .filter((student): student is CheckoffStudent => student !== undefined)
  }, [session, studentById])
  const scopeLabel = useMemo(() => {
    if (!session) return ''
    if (session.settings.studentScope === 'whitelist') {
      return `白名单 ${session.settings.studentIds.length} 人`
    }
    if (session.settings.studentScope === 'blacklist') {
      return `黑名单 ${session.settings.studentIds.length} 人`
    }
    return '所有学生'
  }, [session])

  useEffect(() => {
    if (error) toast.error(error)
  }, [error])

  useEffect(() => {
    if (sessionError) toast.error(sessionError)
  }, [sessionError])

  useEffect(() => {
    if (staffError) toast.error(staffError)
  }, [staffError])

  useEffect(() => {
    setSelected(new Set())
    lastClickedIndex.current = null
  }, [session?.id])

  useCheckoffQueueUpdates(classId, () => reloadSessions())

  const currentUserId = useMemo(
    () => queue.find((item) => item.status === 'called')?.userId ?? null,
    [queue],
  )
  const selectedCount = selected.size
  const hasSelection = selectedCount > 0
  const selectedHasFinished = queue.some(
    (item) => selected.has(item.userId) && item.status === 'finished',
  )
  const operationDisabled = !hasSelection || pending || !session
  const sortingDisabled =
    operationDisabled ||
    selectedHasFinished ||
    (currentUserId !== null && selected.has(currentUserId))
  const precallDisabled = operationDisabled || selectedHasFinished

  const toggleItem = useCallback(
    (userId: string, index: number, shiftKey: boolean) => {
      const item = queue.find((entry) => entry.userId === userId)
      if (!item) return
      if (shiftKey && lastClickedIndex.current !== null) {
        const from = Math.min(lastClickedIndex.current, index)
        const to = Math.max(lastClickedIndex.current, index)
        setSelected((prev) => {
          const next = new Set(prev)
          for (let i = from; i <= to; i += 1) {
            const current = queue[i]
            if (current) next.add(current.userId)
          }
          return next
        })
      } else {
        setSelected((prev) => {
          const next = new Set(prev)
          if (next.has(item.userId)) next.delete(item.userId)
          else next.add(item.userId)
          return next
        })
      }
      lastClickedIndex.current = index
    },
    [queue],
  )

  const clearSelection = () => {
    setSelected(new Set())
    lastClickedIndex.current = null
  }

  const runQueueAction = async (
    action: Parameters<typeof updateCheckoffQueue>[1],
    successMessage: string,
  ) => {
    if (!session) return
    setPending(true)
    try {
      await updateCheckoffQueue(session.id, action)
      reloadSessions()
      toast.success(successMessage)
    } catch (err) {
      toast.error(getErrorMessage(err, '操作失败'))
    } finally {
      setPending(false)
    }
  }

  const moveBy = (direction: 'up' | 'down') => {
    if (!session || !hasSelection) return
    void runQueueAction(
      { action: 'move', userIds: [...selected], direction },
      direction === 'up' ? '已上移' : '已下移',
    )
  }

  const moveToTop = () => {
    if (!session || !hasSelection) return
    void runQueueAction({ action: 'move', userIds: [...selected], direction: 'top' }, '已置顶')
  }

  const reorderQueue = async (
    activeId: string,
    overId: string,
    _fromIndex: number,
    toIndex: number,
  ) => {
    if (!session || pending || reorderingId) return false
    if (
      queue.find((item) => item.userId === activeId)?.status === 'finished' ||
      queue.find((item) => item.userId === overId)?.status === 'finished'
    ) {
      return false
    }
    setReorderingId(activeId)
    try {
      await updateCheckoffQueue(session.id, { action: 'reorder', userId: activeId, toIndex })
      reloadSessions()
      return true
    } catch (err) {
      toast.error(getErrorMessage(err, '调整顺序失败'))
      return false
    } finally {
      setReorderingId(null)
    }
  }

  const precall = () => {
    if (!session || !hasSelection) return
    const targets = queue.filter(
      (item) => selected.has(item.userId) && item.status !== 'finished',
    )
    if (targets.length === 0) return
    const allNotified = targets.every((item) => item.status === 'notified')
    void runQueueAction(
      { action: 'precall', userIds: targets.map((item) => item.userId), called: !allNotified },
      allNotified ? '已取消预叫' : '已预叫',
    )
  }

  const precallUser = (userId: string) => {
    if (!session || pending) return
    void runQueueAction(
      { action: 'precall', userIds: [userId], called: true },
      '已预叫',
    )
  }

  const removeSelected = () => {
    if (!session || !hasSelection) return
    void runQueueAction({ action: 'remove', userIds: [...selected] }, '已移出队列')
    clearSelection()
  }

  const closeQueue = async () => {
    if (!session) return
    setClosing(true)
    try {
      await closeCheckoffSession(session.id)
      toast.success('验收排队已结束')
      closeState.close()
      reloadSessions()
    } catch (err) {
      toast.error(getErrorMessage(err, '结束排队失败'))
    } finally {
      setClosing(false)
    }
  }

  if (!classId) {
    return (
      <div className="mx-auto max-w-6xl">
        <PageHeader title="验收排队" />
        <EmptyState icon={School} title="未选择课程" hint="请先在右上角选择或绑定一个课程" />
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title="验收排队"
        subtitle={`${currentClass?.name ?? '当前课程'} · 点击学生卡片可选择，按住 Shift 可连续选择`}
        actions={
          <>
            {user?.role === 'TA' && session ? (
              <Button variant="danger-soft" onPress={closeState.open}>
                <CircleStop width={16} height={16} className="shrink-0" />
                结束排队
              </Button>
            ) : null}
            <Button
              variant="primary"
              onPress={() =>
                navigate(
                  session
                    ? `/console/checkoff-queue/edit?session=${encodeURIComponent(session.id)}`
                    : '/console/checkoff-queue/new',
                )
              }
            >
              {session ? (
                <Settings2 width={16} height={16} className="shrink-0" />
              ) : (
                <Plus width={16} height={16} className="shrink-0" />
              )}
              {session ? '编辑设置' : '创建新排队'}
            </Button>
          </>
        }
      />

      {session ? (
        <div className="mb-4 flex flex-wrap items-center gap-x-5 gap-y-2 rounded-2xl border border-line bg-elevated px-4 py-3 text-xs text-fg-muted">
          <Tooltip delay={150} closeDelay={0}>
            <Tooltip.Trigger className="cursor-default text-left">
              接受实验：
              <span className="font-semibold text-fg">{acceptedShort}</span>
              {acceptedCount > 1 && <span> 等 {acceptedCount} 个</span>}
            </Tooltip.Trigger>
            <Tooltip.Content placement="bottom" showArrow className="w-80 max-w-[80vw] p-3">
              <div className="text-xs font-semibold text-fg">接受验收的实验</div>
              <ul className="mt-2 space-y-2">
                {session.settings.acceptedExperimentIds.map((id) => {
                  const experiment = experimentById.get(id)
                  const priority = session.settings.priorityExperimentIds.includes(id)
                  return (
                    <li key={id} className="flex items-start justify-between gap-3 text-xs">
                      <span className="min-w-0 break-words">
                        {experiment ? `${experiment.mark} · ${experiment.title}` : id}
                      </span>
                      {priority && (
                        <Chip size="sm" variant="soft" color="accent">
                          优先
                        </Chip>
                      )}
                    </li>
                  )
                })}
              </ul>
            </Tooltip.Content>
          </Tooltip>

          <Tooltip delay={150} closeDelay={0}>
            <Tooltip.Trigger className="cursor-default text-left">
              参与助教：
              <span className="font-semibold text-fg">{session.settings.taIds.length}</span> 人
            </Tooltip.Trigger>
            <Tooltip.Content placement="bottom" showArrow className="w-72 max-w-[80vw] p-3">
              <div className="text-xs font-semibold text-fg">参与验收的助教</div>
              {session.settings.taIds.length === 0 ? (
                <p className="mt-2 text-xs text-fg-subtle">暂无助教</p>
              ) : (
                <ul className="mt-2 space-y-2">
                  {session.settings.taIds.map((id) => {
                    const ta = taById.get(id)
                    return (
                      <li key={id} className="flex items-center gap-2 text-xs">
                        <AvatarImage
                          id={ta?.avatar ?? null}
                          size={22}
                          fallback={(ta?.name ?? id).slice(0, 1)}
                        />
                        <span className="min-w-0 flex-1 truncate font-medium">
                          {ta?.name ?? id}
                        </span>
                      </li>
                    )
                  })}
                </ul>
              )}
            </Tooltip.Content>
          </Tooltip>

          <Tooltip delay={150} closeDelay={0}>
            <Tooltip.Trigger className="cursor-default text-left">
              学生范围：<span className="font-semibold text-fg">{scopeLabel}</span>
            </Tooltip.Trigger>
            <Tooltip.Content placement="bottom" showArrow className="w-72 max-w-[80vw] p-3">
              <div className="text-xs font-semibold text-fg">
                {session.settings.studentScope === 'whitelist'
                  ? '白名单学生'
                  : session.settings.studentScope === 'blacklist'
                    ? '黑名单学生'
                    : '学生范围'}
              </div>
              {session.settings.studentScope === 'all' ? (
                <p className="mt-2 text-xs text-fg-muted">所有学生（共 {students.length} 人）</p>
              ) : scopedStudents.length === 0 ? (
                <p className="mt-2 text-xs text-fg-subtle">暂无学生</p>
              ) : (
                <ul className="mt-2 max-h-60 space-y-1.5 overflow-y-auto">
                  {scopedStudents.map((student) => (
                    <li key={student.userId} className="flex items-center gap-2 text-xs">
                      <span className="min-w-0 flex-1 truncate font-medium">{student.name}</span>
                      <span className="tabular text-fg-subtle">{student.studentId}</span>
                    </li>
                  ))}
                </ul>
              )}
            </Tooltip.Content>
          </Tooltip>

          <span>
            开始时间：
            <span className="font-semibold text-fg">
              {formatLocaleDateTime(session.settings.startAt, '未设置')}
            </span>
          </span>
        </div>
      ) : !loading && !sessionLoading ? (
        <div className="mb-4 rounded-2xl border border-dashed border-line px-4 py-3 text-xs text-fg-subtle">
          尚未创建排队，点击右上角「创建新排队」配置本场验收。
        </div>
      ) : null}

      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <section className="rounded-3xl border border-line bg-elevated p-5">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-baseline gap-2">
              <h2 className="text-sm font-bold text-fg">当前队列</h2>
              <span className="tabular text-xs text-fg-subtle">{queue.length} 人</span>
            </div>
            <div className="flex items-center gap-2">
              {reorderingId && (
                <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-brand-600 dark:text-brand-300">
                  <RefreshCw width={12} height={12} className="shrink-0 animate-spin" />
                  正在更新
                </span>
              )}
              {hasSelection && (
                <>
                  <span className="tabular text-xs font-semibold text-brand-600 dark:text-brand-300">
                    已选 {selectedCount} 人
                  </span>
                  <Button size="sm" variant="ghost" onPress={clearSelection}>
                    取消选择
                  </Button>
                </>
              )}
            </div>
          </div>

          {loading || (sessionLoading && !session) ? (
            <SkeletonList rows={5} className="h-20 rounded-2xl" />
          ) : queue.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-line px-6 py-14 text-center">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-sunken text-fg-subtle">
                <Users width={20} height={20} className="shrink-0" />
              </div>
              <div className="mt-3 text-sm font-semibold text-fg">
                {session ? '队列为空' : '尚未创建排队'}
              </div>
              <div className="mt-1 text-xs text-fg-subtle">
                {session
                  ? '学生可在学生端「验收排队」页面加入'
                  : '点击右上角「创建新排队」配置本场验收'}
              </div>
            </div>
          ) : (
            <QueueTimeline
              entries={queue}
              selectedIds={selected}
              onToggle={toggleItem}
              canDrag={(entry) => !pending && entry.status !== 'finished'}
              canReorder={(activeId, overId) =>
                !pending &&
                !reorderingId &&
                queue.find((item) => item.userId === activeId)?.status !== 'finished' &&
                queue.find((item) => item.userId === overId)?.status !== 'finished'
              }
              onReorder={reorderQueue}
              onPrecall={precallUser}
            />
          )}
        </section>

        <aside className="h-fit rounded-3xl border border-line bg-elevated p-5 lg:sticky lg:top-20">
          <h2 className="text-sm font-bold text-fg">操作</h2>
          <p className="mt-1 text-xs text-fg-subtle">
            {hasSelection ? `正在操作 ${selectedCount} 人` : '先点击左侧学生卡片选择'}
          </p>

          <div className="mt-4 flex flex-col gap-1">
            <Button
              variant="ghost"
              className="justify-start"
              isDisabled={sortingDisabled}
              onPress={() => moveBy('up')}
            >
              <ArrowUp width={16} height={16} className="shrink-0" />
              上移
            </Button>
            <Button
              variant="ghost"
              className="justify-start"
              isDisabled={sortingDisabled}
              onPress={() => moveBy('down')}
            >
              <ArrowDown width={16} height={16} className="shrink-0" />
              下移
            </Button>
            <Button
              variant="ghost"
              className="justify-start"
              isDisabled={sortingDisabled}
              onPress={moveToTop}
            >
              <ChevronsUp width={16} height={16} className="shrink-0" />
              置顶
            </Button>
          </div>

          <div className="my-3 h-px bg-line" />

          <Button
            variant="ghost"
            className="w-full justify-start"
            isDisabled={precallDisabled}
            onPress={precall}
          >
            <Megaphone width={16} height={16} className="shrink-0" />
            预叫
          </Button>

          <div className="my-3 h-px bg-line" />

          <Button
            variant="ghost"
            className="w-full justify-start text-danger"
            isDisabled={operationDisabled}
            onPress={removeSelected}
          >
            <Trash2 width={16} height={16} className="shrink-0" />
            移出队列
          </Button>
        </aside>
      </div>

      <ConfirmDialog
        state={closeState}
        title="结束验收排队"
        description="结束后学生将无法继续加入排队，当前队列也会从学生端移除。此操作不可撤销。"
        confirmLabel="结束排队"
        pendingLabel="结束中"
        isPending={closing}
        icon={CircleStop}
        onConfirm={() => void closeQueue()}
      />
    </div>
  )
}
