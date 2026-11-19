import { Button, Modal, useOverlayState } from '@heroui/react'

import ClipboardCheck from '~icons/lucide/clipboard-check'
import type { CheckoffResumeSnapshot } from '@/lib/checkoff-resume'
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
  snapshot,
  onRestore,
  onDiscard,
}: {
  state: ReturnType<typeof useOverlayState>
  snapshot: CheckoffResumeSnapshot | null
  onRestore: () => void
  onDiscard: () => void
}) {
  const experimentLabel = snapshot
    ? `${snapshot.experiment.mark} · ${snapshot.experiment.title}`
    : ''

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
            <Modal.Footer>
              <Button variant="secondary" onPress={onDiscard}>
                丢弃
              </Button>
              <Button variant="primary" onPress={onRestore}>
                恢复
              </Button>
            </Modal.Footer>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </Modal>
  )
}
