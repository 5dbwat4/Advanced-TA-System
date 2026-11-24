import { Button, Drawer, useOverlayState } from '@heroui/react'
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'

import ListOrdered from '~icons/lucide/list-ordered'
import {
  QueueTimeline,
  type QueueTimelineEntry,
} from '@/components/checkoff/QueueTimeline'
import {
  fetchCheckoff,
  updateCheckoffQueue,
  type CheckoffSession,
  type CheckoffStudent,
} from '@/lib/api'
import { getErrorMessage } from '@/lib/error'
import { useAsyncData } from '@/lib/request'

export function CheckoffQueueDrawer({
  classId,
  session,
  onSessionChange,
  activeStudentId,
  activeStartedAt,
  onStart,
}: {
  classId: string
  session: CheckoffSession
  onSessionChange: () => void
  activeStudentId?: string | null
  activeStartedAt?: string | null
  onStart?: (student: CheckoffStudent, experimentId: string) => void
}) {
  const navigate = useNavigate()
  const state = useOverlayState()
  const [reorderingId, setReorderingId] = useState<string | null>(null)
  const [precallingId, setPrecallingId] = useState<string | null>(null)

  const { data: directory } = useAsyncData(
    () => (classId ? fetchCheckoff({ classId }) : Promise.resolve(null)),
    [classId],
  )

  const studentById = useMemo(
    () =>
      new Map(
        (directory?.students ?? []).map((student) => [student.userId, student] as const),
      ),
    [directory],
  )
  const experimentById = useMemo(
    () =>
      new Map(
        (directory?.experiments ?? []).map(
          (experiment) => [experiment.id, experiment] as const,
        ),
      ),
    [directory],
  )

  const entries = useMemo(() => session.stats.entries, [session])
  const timelineEntries = useMemo<QueueTimelineEntry[]>(() => {
    const items = entries.map((entry) => {
      const student = studentById.get(entry.userId)
      const experiment = experimentById.get(entry.experimentId)
      return {
        userId: entry.userId,
        name: student?.name ?? entry.userId,
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
    if (!activeStudentId) return items
    const index = items.findIndex((entry) => entry.userId === activeStudentId)
    const active = items[index]
    if (!active || active.status === 'finished') return items
    return [
      {
        ...active,
        status: 'called',
        startedAt: active.startedAt ?? activeStartedAt ?? null,
        finishedAt: null,
      },
      ...items.filter((entry) => entry.userId !== activeStudentId),
    ]
  }, [activeStartedAt, activeStudentId, entries, experimentById, studentById])

  const startStudent = (userId: string) => {
    if (!onStart) return
    const entry = entries.find((item) => item.userId === userId)
    const timelineEntry = timelineEntries.find((item) => item.userId === userId)
    if (!entry || !timelineEntry || entry.status === 'finished') return
    const student = studentById.get(userId) ?? {
      userId,
      name: timelineEntry.name,
      studentId: '',
      avatar: null,
    }
    state.close()
    onStart(student, entry.experimentId)
  }

  const reorderQueue = async (
    activeId: string,
    overId: string,
    _fromIndex: number,
    _toIndex: number,
  ) => {
    if (reorderingId) return false
    const waiting = entries.filter(
      (entry) => entry.status !== 'finished' && entry.status !== 'called',
    )
    const target = waiting.findIndex((entry) => entry.userId === overId)
    if (target < 0) return false
    setReorderingId(activeId)
    try {
      await updateCheckoffQueue(session.id, {
        action: 'reorder',
        userId: activeId,
        toIndex: target,
      })
      onSessionChange()
      return true
    } catch (err) {
      toast.error(getErrorMessage(err, '调整顺序失败'))
      return false
    } finally {
      setReorderingId(null)
    }
  }

  const precall = async (userId: string) => {
    if (precallingId) return
    setPrecallingId(userId)
    try {
      await updateCheckoffQueue(session.id, {
        action: 'precall',
        userIds: [userId],
        called: true,
      })
      toast.success('已预叫')
      onSessionChange()
    } catch (err) {
      toast.error(getErrorMessage(err, '预叫失败'))
    } finally {
      setPrecallingId(null)
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={state.open}
        aria-label={`验收队列（${entries.length}）`}
        className="fixed right-0 top-1/2 z-30 flex -translate-y-1/2 flex-col items-center gap-2 rounded-l-2xl border border-r-0 border-line bg-elevated px-3 py-4 shadow-lg transition-colors hover:bg-sunken"
      >
        <span className="relative">
          <ListOrdered width={26} height={26} className="text-brand-600 dark:text-brand-300" />
          <span className="absolute -right-2.5 -top-2 flex h-5 min-w-5 items-center justify-center rounded-full bg-danger px-1 text-[10px] font-bold text-white">
            {entries.length > 99 ? '99+' : entries.length}
          </span>
        </span>
        <span className="text-xs font-medium leading-tight tracking-widest text-fg-muted [writing-mode:vertical-rl]">
          队列
        </span>
      </button>

      <Drawer.Backdrop isOpen={state.isOpen} onOpenChange={state.setOpen}>
        <Drawer.Content placement="right">
          <Drawer.Dialog className="flex h-full w-[min(26rem,100vw)] max-w-none flex-col">
            <Drawer.CloseTrigger />
            <Drawer.Header className="border-b border-line">
              <div className="flex items-baseline gap-3">
                <Drawer.Heading>验收队列</Drawer.Heading>
                <span className="text-sm text-fg-subtle">共 {entries.length} 人</span>
                {reorderingId ? (
                  <span className="text-[11px] font-medium text-brand-600 dark:text-brand-300">
                    正在更新
                  </span>
                ) : null}
              </div>
            </Drawer.Header>

            <Drawer.Body className="flex flex-1 flex-col gap-4 overflow-y-auto">
              {entries.length === 0 ? (
                <div className="py-16 text-center">
                  <p className="text-sm font-semibold">队列为空</p>
                  <p className="mt-1 text-xs text-fg-subtle">学生加入后会显示在这里</p>
                </div>
              ) : (
                <QueueTimeline
                  entries={timelineEntries}
                  className="max-h-none overflow-x-hidden"
                  canDrag={(entry) => !reorderingId && entry.status !== 'finished'}
                  canReorder={(activeId, overId) =>
                    !reorderingId &&
                    entries.find((entry) => entry.userId === activeId)?.status !==
                      'finished' &&
                    entries.find((entry) => entry.userId === overId)?.status !==
                      'finished'
                  }
                  onReorder={reorderQueue}
                  onPrecall={precall}
                  onDoubleClick={onStart ? startStudent : undefined}
                />
              )}
            </Drawer.Body>

            <Drawer.Footer className="border-t border-line">
              <Button
                variant="secondary"
                className="w-full"
                onPress={() => {
                  state.close()
                  navigate('/console/checkoff-queue')
                }}
              >
                打开排队管理
              </Button>
            </Drawer.Footer>
          </Drawer.Dialog>
        </Drawer.Content>
      </Drawer.Backdrop>
    </>
  )
}
