import { Button, Modal, useOverlayState } from '@heroui/react'
import AlertTriangle from '~icons/lucide/alert-triangle'

type QuestionSetRenameModalProps = {
  state: ReturnType<typeof useOverlayState>
  onConfirm: () => void
}

export function QuestionSetRenameModal({
  state,
  onConfirm,
}: QuestionSetRenameModalProps) {
  return (
    <Modal state={state}>
      <Modal.Backdrop>
        <Modal.Container>
          <Modal.Dialog className="sm:max-w-md">
            <Modal.CloseTrigger />
            <Modal.Header>
              <Modal.Icon className="bg-amber-500/10 text-amber-600 dark:text-amber-400">
                <AlertTriangle width={18} height={18} className="shrink-0" />
              </Modal.Icon>
              <Modal.Heading>重命名题目集</Modal.Heading>
            </Modal.Header>
            <Modal.Body>
              <p className="text-sm text-fg-muted">
                你不是该题目集的管理者，修改会影响所有使用它的实验。确定继续吗？
              </p>
            </Modal.Body>
            <Modal.Footer>
              <Button slot="close" variant="secondary">
                取消
              </Button>
              <Button variant="primary" onPress={onConfirm}>
                确定继续
              </Button>
            </Modal.Footer>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </Modal>
  )
}
