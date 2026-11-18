import { Button, Chip, ListBox, Select, Spinner, type Key } from '@heroui/react'
import { useState } from 'react'
import { toast } from 'sonner'

import AlertTriangle from '~icons/lucide/alert-triangle'
import CheckCircle2 from '~icons/lucide/check-circle-2'
import ListOrdered from '~icons/lucide/list-ordered'
import RefreshCw from '~icons/lucide/refresh-cw'
import { QueueTimeline } from '@/components/checkoff/QueueTimeline'
import { AvatarImage } from '@/components/ui/AvatarImage'
import { EmptyState } from '@/components/ui/Card'
import { ChoiceTable } from '@/components/ui/ChoiceTable'
import { PendingButton } from '@/components/ui/PendingButton'
import {
  fetchStudentCheckoffQueue,
  joinStudentCheckoffQueue,
  reorderStudentCheckoffQueue,
  type StudentCheckoffQueueView,
} from '@/lib/api'
import { useCheckoffQueueUpdates } from '@/lib/checkoff-socket'
import { getErrorMessage } from '@/lib/error'
import { formatLocaleDateTime } from '@/lib/format'
import { useAsyncData } from '@/lib/request'
import { useCurrentClass } from '@/lib/store'
import { cn } from '@/lib/utils'

const NO_TA = '__none__'

function reasonText(reason: StudentCheckoffQueueView['reason']): string {
  if (reason === 'NOT_STARTED') return '本场验收排队尚未开始'
  if (reason === 'NOT_IN_SCOPE') return '你不在本场验收范围内'
  if (reason === 'NO_CLASS') return '当前账号未绑定班级'
  return '当前没有进行中的验收排队'
}

export default function StudentQueue() {
  const currentClass = useCurrentClass()
  const classId = currentClass?.id ?? null
  const { data, loading, error, reload } = useAsyncData(fetchStudentCheckoffQueue, [])

  useCheckoffQueueUpdates(classId, () => reload())

  const [experimentId, setExperimentId] = useState<Key | null>(null)
  const [taId, setTaId] = useState(NO_TA)
  const [joining, setJoining] = useState(false)
  const [reordering, setReordering] = useState(false)

  const session = data?.session ?? null
  const selectedExperiment =
    session?.experiments.find((experiment) => experiment.id === String(experimentId)) ?? null
  const selectedTa = session?.tas.find((ta) => ta.id === taId) ?? null
  const chooseTaDisabled = !session?.allowStudentChooseTa
  const needsReassign = Boolean(
    selectedExperiment &&
      selectedTa &&
      selectedTa.preferenceExperimentIds.length > 0 &&
      !selectedTa.preferenceExperimentIds.includes(selectedExperiment.id),
  )

  const prefersExperiment = (preferenceExperimentIds: string[]): boolean =>
    selectedExperiment !== null && preferenceExperimentIds.includes(selectedExperiment.id)

  const join = async () => {
    if (!session || !selectedExperiment) return
    setJoining(true)
    try {
      await joinStudentCheckoffQueue({
        experimentId: selectedExperiment.id,
        taId: session.allowStudentChooseTa && taId !== NO_TA ? taId : null,
      })
      toast.success('已加入验收排队')
      setExperimentId(null)
      setTaId(NO_TA)
      reload()
    } catch (err) {
      toast.error(getErrorMessage(err, '加入排队失败'))
    } finally {
      setJoining(false)
    }
  }

  const reorderSelf = async (
    activeId: string,
    _overId: string,
    fromIndex: number,
    toIndex: number,
  ) => {
    if (!session?.entry || activeId !== session.entry.userId) return
    if (toIndex <= fromIndex) return
    setReordering(true)
    try {
      await reorderStudentCheckoffQueue(toIndex)
      reload()
    } catch (err) {
      toast.error(getErrorMessage(err, '调整顺序失败'))
    } finally {
      setReordering(false)
    }
  }

  return (
    <div className="mx-auto max-w-3xl">
      <section className="rounded-3xl border border-line bg-elevated/80 p-6 shadow-2xl backdrop-blur-xl md:p-8">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">参与验收排队</h1>
          </div>
          <Button size="sm" variant="ghost" isDisabled={loading} onPress={reload}>
            <RefreshCw
              width={15}
              height={15}
              className={cn('shrink-0', loading && 'animate-spin')}
            />
            刷新
          </Button>
        </div>

        {loading ? (
          <div className="flex justify-center py-16">
            <Spinner size="lg" />
          </div>
        ) : error ? (
          <div className="mt-6 rounded-2xl border border-line bg-sunken/40 p-6 text-center">
            <div className="text-sm text-danger">{error}</div>
            <Button className="mt-3" size="sm" variant="secondary" onPress={reload}>
              重试
            </Button>
          </div>
        ) : !session ? (
          <div className="mt-6">
            <EmptyState
              icon={ListOrdered}
              title={reasonText(data?.reason ?? null)}
              hint="助教创建排队后，这里会显示可参与的实验和助教"
            />
          </div>
        ) : session.entry ? (
          <div className="mt-5 rounded-2xl border border-success/30 bg-success/5 px-4 py-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-sm font-bold text-success">
                <CheckCircle2 width={18} height={18} className="shrink-0" />
                你已在队列中
              </div>
              <div className="text-[11px] text-fg-subtle">
                加入时间：{formatLocaleDateTime(session.entry.joinedAt, '—')}
              </div>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2 lg:grid-cols-4">
              <Info label="当前位次" value={`第 ${session.entry.position} 位`} />
              <Info
                label="状态"
                value={session.entry.status === 'called' ? '已叫号' : '等待验收'}
              />
              <Info
                label="期望实验"
                value={
                  session.experiments.find(
                    (experiment) => experiment.id === session.entry?.experimentId,
                  )?.mark ?? '—'
                }
              />
              <Info
                label="期望助教"
                value={
                  session.tas.find((ta) => ta.id === session.entry?.taId)?.name ?? '不指定'
                }
                muted={!session.tas.some((ta) => ta.id === session.entry?.taId)}
              />
            </div>
          </div>
        ) : !data?.eligible ? (
          <div className="mt-6">
            <EmptyState
              icon={ListOrdered}
              title={reasonText(data?.reason ?? null)}
              hint={
                data?.reason === 'NOT_STARTED'
                  ? `计划开始时间：${formatLocaleDateTime(session.startAt, '—')}`
                  : '如有疑问，请联系课程助教'
              }
            />
          </div>
        ) : (
          <div className="mt-6 flex flex-col gap-4">
            <div className="rounded-2xl border border-line p-5">
              <h2 className="text-sm font-bold">我期望验收……</h2>
              <div className="mt-3">
                <Select
                  fullWidth
                  aria-label="我期望验收的实验"
                  placeholder="选择实验"
                  value={experimentId}
                  onChange={setExperimentId}
                >
                  <Select.Trigger>
                    <Select.Value />
                    <Select.Indicator />
                  </Select.Trigger>
                  <Select.Popover>
                    <ListBox
                      renderEmptyState={() => (
                        <div className="px-3 py-6 text-sm text-fg-subtle">暂无可验收实验</div>
                      )}
                    >
                      {session.experiments.map((experiment) => (
                        <ListBox.Item
                          key={experiment.id}
                          id={experiment.id}
                          textValue={`${experiment.mark} ${experiment.title}`}
                        >
                          {experiment.mark} · {experiment.title}
                          <ListBox.ItemIndicator />
                        </ListBox.Item>
                      ))}
                    </ListBox>
                  </Select.Popover>
                </Select>
              </div>

              <h2 className="mt-5 text-sm font-bold">我期望由这位助教验收（可选）</h2>
              <p className="mt-1 text-xs text-fg-subtle">
                {chooseTaDisabled
                  ? '本场不允许学生选择助教。'
                  : '选择一位助教，或保持「不指定」。'}
              </p>

              <ChoiceTable
                name="checkoff-ta"
                className="mt-3"
                value={taId}
                isDisabled={chooseTaDisabled}
                onChange={setTaId}
                options={[
                  {
                    value: NO_TA,
                    label: <span className="text-sm font-medium">不指定</span>,
                  },
                  ...session.tas.map((ta) => {
                    const preferred = prefersExperiment(ta.preferenceExperimentIds)
                    const preferenceLabels = ta.preferenceExperimentIds
                      .map(
                        (id) => session.experiments.find((experiment) => experiment.id === id)?.mark,
                      )
                      .filter((label): label is string => Boolean(label))
                    const preferenceText =
                      preferenceLabels.length > 0 ? preferenceLabels.join('、') : '未指定'
                    return {
                      value: ta.id,
                      preferred,
                      label: (
                        <span className="flex min-w-0 items-center gap-3">
                          <AvatarImage
                            id={ta.avatar}
                            size={28}
                            fallback={ta.name.slice(0, 1)}
                          />
                          <span className="min-w-0">
                            <span className="block truncate text-sm font-semibold">
                              {ta.name}
                            </span>
                            <span className="tabular block truncate text-[11px] text-fg-subtle">
                              {ta.studentId || '—'}
                            </span>
                          </span>
                        </span>
                      ),
                      badge: (
                        <Chip
                          size="sm"
                          variant="soft"
                          color={preferred ? 'accent' : undefined}
                        >
                          {preferenceText}
                        </Chip>
                      ),
                    }
                  }),
                ]}
              />

              {needsReassign && (
                <div className="mt-3 flex items-start gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2.5 text-xs text-amber-700 dark:text-amber-300">
                  <AlertTriangle width={15} height={15} className="mt-0.5 shrink-0" />
                  <span>你选择的助教不期望验收这个实验，你可能会被调剂。</span>
                </div>
              )}
            </div>

            <PendingButton
              variant="primary"
              pendingLabel="加入中"
              isPending={joining}
              isDisabled={!selectedExperiment}
              onPress={() => void join()}
            >
              立刻参与排队
            </PendingButton>
          </div>
        )}
      </section>

      {session && (
        <section className="mt-4 rounded-3xl border border-line bg-elevated/80 p-5 shadow-2xl backdrop-blur-xl md:p-6">
          <div className="mb-4 flex items-center justify-between gap-2">
            <h2 className="text-sm font-bold">当前队列</h2>
            <span className="tabular text-xs text-fg-subtle">{session.queue.length} 人</span>
          </div>
          <QueueTimeline
            entries={session.queue}
            canDrag={(entry) =>
              session?.allowSelfMoveDown === true &&
              !reordering &&
              session?.entry?.userId === entry.userId
            }
            onReorder={(activeId, overId, fromIndex, toIndex) =>
              void reorderSelf(activeId, overId, fromIndex, toIndex)
            }
          />
        </section>
      )}
    </div>
  )
}

function Info({
  label,
  value,
  muted = false,
}: {
  label: string
  value: string
  muted?: boolean
}) {
  return (
    <div className="flex min-w-0 items-baseline justify-between gap-2 rounded-lg border border-line bg-elevated px-2.5 py-1.5">
      <span className="shrink-0 text-[11px] text-fg-subtle">{label}</span>
      <span className={cn('truncate text-sm font-semibold', muted && 'text-fg-muted')}>
        {value}
      </span>
    </div>
  )
}
