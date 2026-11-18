import {
  Button,
  Chip,
  ListBox,
  Modal,
  Select,
  Spinner,
  useOverlayState,
  type Key,
} from '@heroui/react'
import { useState } from 'react'
import { toast } from 'sonner'

import AlertTriangle from '~icons/lucide/alert-triangle'
import Bell from '~icons/lucide/bell'
import CheckCircle2 from '~icons/lucide/check-circle-2'
import ListOrdered from '~icons/lucide/list-ordered'
import LogOut from '~icons/lucide/log-out'
import Pencil from '~icons/lucide/pencil'
import RefreshCw from '~icons/lucide/refresh-cw'
import { QueueTimeline } from '@/components/checkoff/QueueTimeline'
import { AvatarImage } from '@/components/ui/AvatarImage'
import { EmptyState } from '@/components/ui/Card'
import { ChoiceTable } from '@/components/ui/ChoiceTable'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { PendingButton } from '@/components/ui/PendingButton'
import {
  fetchStudentCheckoffQueue,
  joinStudentCheckoffQueue,
  leaveStudentCheckoffQueue,
  reorderStudentCheckoffQueue,
  updateStudentCheckoffQueue,
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
  const [leaving, setLeaving] = useState(false)
  const [savingEdit, setSavingEdit] = useState(false)
  const [reorderingId, setReorderingId] = useState<string | null>(null)
  const editState = useOverlayState()
  const leaveState = useOverlayState()

  const session = data?.session ?? null
  const selectedExperiment =
    session?.experiments.find((experiment) => experiment.id === String(experimentId)) ?? null

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

  const openEdit = () => {
    if (!session?.entry) return
    setExperimentId(session.entry.experimentId)
    setTaId(session.entry.taId ?? NO_TA)
    editState.open()
  }

  const saveEdit = async () => {
    if (!session?.entry || !selectedExperiment) return
    setSavingEdit(true)
    try {
      await updateStudentCheckoffQueue({
        experimentId: selectedExperiment.id,
        taId: session.allowStudentChooseTa && taId !== NO_TA ? taId : null,
      })
      toast.success('排队信息已更新')
      editState.close()
      reload()
    } catch (err) {
      toast.error(getErrorMessage(err, '更新排队信息失败'))
    } finally {
      setSavingEdit(false)
    }
  }

  const leave = async () => {
    setLeaving(true)
    try {
      await leaveStudentCheckoffQueue()
      toast.success('已退出排队')
      leaveState.close()
      setExperimentId(null)
      setTaId(NO_TA)
      reload()
    } catch (err) {
      toast.error(getErrorMessage(err, '退出排队失败'))
    } finally {
      setLeaving(false)
    }
  }

  const reorderSelf = async (
    activeId: string,
    _overId: string,
    fromIndex: number,
    toIndex: number,
  ) => {
    if (!session?.entry || activeId !== session.entry.userId) return false
    if (toIndex <= fromIndex || reorderingId) return false
    setReorderingId(activeId)
    try {
      await reorderStudentCheckoffQueue(toIndex)
      reload()
      return true
    } catch (err) {
      toast.error(getErrorMessage(err, '调整顺序失败'))
      return false
    } finally {
      setReorderingId(null)
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

        {loading && !data ? (
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
                value={
                  session.entry.status === 'called'
                    ? '正在验收'
                    : session.entry.status === 'notified'
                      ? '已预叫'
                      : session.entry.status === 'finished'
                        ? '已完成验收'
                        : '等待验收'
                }
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
            {session.entry.status !== 'finished' ? (
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <Button
                  size="sm"
                  variant="secondary"
                  isDisabled={leaving || savingEdit}
                  onPress={openEdit}
                >
                  <Pencil width={14} height={14} className="shrink-0" />
                  修改排队信息
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-danger"
                  isDisabled={leaving || savingEdit}
                  onPress={leaveState.open}
                >
                  <LogOut width={14} height={14} className="shrink-0" />
                  退出排队
                </Button>
              </div>
            ) : null}
            {session.entry.status === 'notified' ? (
              <div className="mt-3 flex items-start gap-2 rounded-xl border border-warning/30 bg-warning/10 px-3 py-2.5 text-xs text-warning">
                <Bell width={15} height={15} className="mt-0.5 shrink-0" />
                <span>
                  {`${session.entry.notifiedBy ? `助教${session.entry.notifiedBy}` : '助教'}向你发出了「预叫号」。请做好验收准备，设计上在 3~5 分钟内将轮到你验收。如果你不方便参与验收，可以直接取消排队，或者将位次后挪。一旦你进行此操作，预叫号状态将结束。`}
                </span>
              </div>
            ) : null}
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
            <QueuePreferenceFields
              session={session}
              experimentId={experimentId}
              taId={taId}
              onExperimentChange={setExperimentId}
              onTaChange={setTaId}
            />

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
            <div className="flex items-baseline gap-2">
              <h2 className="text-sm font-bold">当前队列</h2>
              <span className="tabular text-xs text-fg-subtle">{session.queue.length} 人</span>
            </div>
            {reorderingId && (
              <span className="text-[11px] font-medium text-brand-600 dark:text-brand-300">
                正在更新
              </span>
            )}
          </div>
          <QueueTimeline
            entries={session.queue}
            canDrag={(entry) =>
              session?.allowSelfMoveDown === true &&
              session?.entry?.userId === entry.userId &&
              entry.status !== 'finished'
            }
            canReorder={(_activeId, overId, fromIndex, toIndex) =>
              toIndex > fromIndex &&
              !reorderingId &&
              session?.queue.find((entry) => entry.userId === overId)?.status !==
                'finished'
            }
            onReorder={reorderSelf}
          />
        </section>
      )}

      <Modal state={editState}>
        <Modal.Backdrop>
          <Modal.Container>
            <Modal.Dialog className="sm:max-w-xl">
              <Modal.CloseTrigger />
              <Modal.Header>
                <Modal.Heading>修改排队信息</Modal.Heading>
              </Modal.Header>
              <Modal.Body className="flex max-h-[70vh] flex-col gap-4 overflow-y-auto">
                {session ? (
                  <QueuePreferenceFields
                    session={session}
                    experimentId={experimentId}
                    taId={taId}
                    onExperimentChange={setExperimentId}
                    onTaChange={setTaId}
                  />
                ) : null}
              </Modal.Body>
              <Modal.Footer>
                <Button slot="close" variant="secondary">
                  取消
                </Button>
                <PendingButton
                  variant="primary"
                  pendingLabel="保存中"
                  isPending={savingEdit}
                  isDisabled={!selectedExperiment}
                  onPress={() => void saveEdit()}
                >
                  保存
                </PendingButton>
              </Modal.Footer>
            </Modal.Dialog>
          </Modal.Container>
        </Modal.Backdrop>
      </Modal>

      <ConfirmDialog
        state={leaveState}
        title="退出排队"
        description="退出后如需继续验收，需要重新排队并回到队尾。"
        confirmLabel="退出排队"
        pendingLabel="退出中"
        isPending={leaving}
        icon={LogOut}
        onConfirm={() => void leave()}
      />
    </div>
  )
}

type StudentQueueSession = NonNullable<StudentCheckoffQueueView['session']>

function QueuePreferenceFields({
  session,
  experimentId,
  taId,
  onExperimentChange,
  onTaChange,
}: {
  session: StudentQueueSession
  experimentId: Key | null
  taId: string
  onExperimentChange: (key: Key | null) => void
  onTaChange: (value: string) => void
}) {
  const selectedExperiment =
    session.experiments.find((experiment) => experiment.id === String(experimentId)) ?? null
  const selectedTa = session.tas.find((ta) => ta.id === taId) ?? null
  const chooseTaDisabled = !session.allowStudentChooseTa
  const needsReassign = Boolean(
    selectedExperiment &&
      selectedTa &&
      selectedTa.preferenceExperimentIds.length > 0 &&
      !selectedTa.preferenceExperimentIds.includes(selectedExperiment.id),
  )
  const prefersExperiment = (preferenceExperimentIds: string[]): boolean =>
    selectedExperiment !== null && preferenceExperimentIds.includes(selectedExperiment.id)

  return (
    <div className="rounded-2xl border border-line p-5">
      <h2 className="text-sm font-bold">将验收……</h2>
      <div className="mt-3">
        <Select
          fullWidth
          aria-label="将验收的实验"
          placeholder="选择实验"
          value={experimentId}
          onChange={onExperimentChange}
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
        {chooseTaDisabled ? '本场不允许学生选择助教。' : '选择一位助教，或保持「不指定」。'}
      </p>

      <ChoiceTable
        name="checkoff-ta"
        className="mt-3"
        value={taId}
        isDisabled={chooseTaDisabled}
        onChange={onTaChange}
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
                  <AvatarImage id={ta.avatar} size={28} fallback={ta.name.slice(0, 1)} />
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold">{ta.name}</span>
                    <span className="tabular block truncate text-[11px] text-fg-subtle">
                      {ta.studentId || '—'}
                    </span>
                  </span>
                </span>
              ),
              badge: (
                <Chip size="sm" variant="soft" color={preferred ? 'accent' : undefined}>
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
          <span>你可能会被调剂。</span>
        </div>
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
