import { Button, Modal, useOverlayState } from '@heroui/react'
import SlidersHorizontal from '~icons/lucide/sliders-horizontal'

type ExperimentPreferencesModalProps = {
  state: ReturnType<typeof useOverlayState>
}

export function ExperimentPreferencesModal({ state }: ExperimentPreferencesModalProps) {
  return (
    <Modal state={state}>
      <Modal.Backdrop>
        <Modal.Container>
          <Modal.Dialog className="sm:max-w-md">
            <Modal.CloseTrigger />
            <Modal.Header>
              <Modal.Icon className="bg-brand-500/10 text-brand-600 dark:text-brand-300">
                <SlidersHorizontal width={18} height={18} className="shrink-0" />
              </Modal.Icon>
              <Modal.Heading>偏好设置</Modal.Heading>
            </Modal.Header>
            <Modal.Body>
              <p className="text-sm text-fg-muted">功能开发中。</p>
            </Modal.Body>
            <Modal.Footer>
              <Button slot="close" variant="secondary">
                关闭
              </Button>
            </Modal.Footer>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </Modal>
  )
}
