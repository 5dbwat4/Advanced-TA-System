import { Button, Modal, useOverlayState } from '@heroui/react'
import { useState } from 'react'
import { toast } from 'sonner'

import ClipboardCheck from '~icons/lucide/clipboard-check'
import { updateCheckoffQueue, type CheckoffSession } from '@/lib/api'
import type { CheckoffResumeSnapshot } from '@/lib/checkoff-resume'
import { getErrorMessage } from '@/lib/error'
import { formatLocaleDateTime } from '@/lib/format'

const STEP_LABELS: Record<number, string> = {
  2: '展示 Demo',
  3: '抽题提问',
  4: '评分',
}

function stepLabel(snapshot: CheckoffResumeSnapshot): string {
  const label = STEP_LABELS[snapshot.step] ?? `第 ${snapshot.step + 1} 步`
  if (snapshot.step !== 3 || snapshot.drawn.length === 0) return label
  return `${label}（第 ${Math.min(snapshot.questionIndex, snapshot.drawn.length - 1) + 1}/${snapshot.drawn.length} 题）`
}

export function CheckoffResumeDialog({
  state,
  session,
  snapshot,
  onRestore,
  onDiscard,
}: {
  state: ReturnType<typeof useOverlayState>
  session: CheckoffSession | null
  snapshot: CheckoffResumeSnapshot | null
  onRestore: () => void
  onDiscard: () => void
}) {
  const [pendingAction, setPendingAction] = useState<'requeue' | 'finish' | null>(null)
  const queueEntry =
    session && !session.closedAt && snapshot
      ? (session.stats.entries.find((entry) => entry.userId === snapshot.student.userId) ??
        null)
      : null
  const canRequeue = Boolean(session && queueEntry && queueEntry.status !== 'finished')
  const experimentLabel = snapshot
    ? `${snapshot.experiment.mark} · ${snapshot.experiment.title}`
    : ''

  const discardWithQueueAction = async (action: 'requeue' | 'finish') => {
    if (!snapshot || !session) {
      onDiscard()
      return
    }
    setPendingAction(action)
    try {
      await updateCheckoffQueue(session.id, {
        action,
        userId: snapshot.student.userId,
      })
      toast.success(action === 'requeue' ? '已丢弃并推回队列' : '已丢弃并置为完成')
      onDiscard()
    } catch (error) {
      toast.error(getErrorMessage(error, action === 'requeue' ? '推回队列失败' : '置为完成失败'))
    } finally {
      setPendingAction(null)
    }
  }

  return (
    <Modal state={state}>
      <Modal.Backdrop isDismissable={false}>
        <Modal.Container>
          <Modal.Dialog className="sm:max-w-md">
            <Modal.Header>
              <Modal.Icon className="bg-brand-500/10 text-brand-600 dark:text-brand-300">
                <ClipboardCheck width={18} height={18} className="shrink-0" />
              </Modal.Icon>
              <Modal.Heading>恢复上次验收</Modal.Heading>
            </Modal.Header>
            <Modal.Body className="flex flex-col gap-3">
              {snapshot ? (
                <>
                  <p className="text-sm text-fg-muted">
                    上次验收状态：正在验收{' '}
                    <span className="font-semibold text-fg">{snapshot.student.name}</span>
                    {experimentLabel ? `（${experimentLabel}）` : ''}，停留在「
                    {stepLabel(snapshot)}」。
                  </p>
                  <p className="text-xs text-fg-subtle">
                    记录于 {formatLocaleDateTime(snapshot.savedAt)}。是否恢复？
                  </p>
                </>
              ) : (
                <p className="text-sm text-fg-muted">是否恢复？</p>
              )}
            </Modal.Body>
            <Modal.Footer className="flex-col items-stretch sm:flex-row sm:flex-wrap sm:justify-end">
              {canRequeue ? (
                <>
                  <Button
                    variant="secondary"
                    isDisabled={pendingAction !== null}
                    onPress={() => void discardWithQueueAction('requeue')}
                  >
                    {pendingAction === 'requeue' ? '正在推回…' : '丢弃并将其推回队列'}
                  </Button>
                  <Button
                    variant="secondary"
                    isDisabled={pendingAction !== null}
                    onPress={() => void discardWithQueueAction('finish')}
                  >
                    {pendingAction === 'finish' ? '正在完成…' : '丢弃并将其置为完成'}
                  </Button>
                </>
              ) : (
                <Button variant="secondary" isDisabled={pendingAction !== null} onPress={onDiscard}>
                  丢弃
                </Button>
              )}
              <Button
                variant="primary"
                isDisabled={pendingAction !== null}
                onPress={onRestore}
              >
                恢复
              </Button>
            </Modal.Footer>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </Modal>
  )
}
