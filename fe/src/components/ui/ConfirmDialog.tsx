import { Button, Modal, useOverlayState } from '@heroui/react'
import type { ReactNode } from 'react'

import Trash2 from '~icons/lucide/trash-2'
import { PendingButton } from '@/components/ui/PendingButton'
import type { IconComponent } from '@/lib/icon'

type ConfirmDialogProps = {
  state: ReturnType<typeof useOverlayState>
  title: string
  description: ReactNode
  confirmLabel?: string
  isPending?: boolean
  onConfirm: () => void
  icon?: IconComponent
  tone?: 'danger' | 'brand'
}

export function ConfirmDialog({
  state,
  title,
  description,
  confirmLabel = '删除',
  isPending = false,
  onConfirm,
  icon: Icon = Trash2,
  tone = 'danger',
}: ConfirmDialogProps) {
  return (
    <Modal state={state}>
      <Modal.Backdrop>
        <Modal.Container>
          <Modal.Dialog className="sm:max-w-md">
            <Modal.CloseTrigger />
            <Modal.Header>
              <Modal.Icon
                className={
                  tone === 'brand'
                    ? 'bg-brand-500/10 text-brand-600 dark:text-brand-300'
                    : 'bg-danger/10 text-danger'
                }
              >
                <Icon width={18} height={18} className="shrink-0" />
              </Modal.Icon>
              <Modal.Heading>{title}</Modal.Heading>
            </Modal.Header>
            <Modal.Body>
              <p className="text-sm text-fg-muted">{description}</p>
            </Modal.Body>
            <Modal.Footer>
              <Button slot="close" variant="secondary">
                取消
              </Button>
              <PendingButton
                variant={tone === 'brand' ? 'primary' : 'danger'}
                isPending={isPending}
                pendingLabel={tone === 'brand' ? '处理中' : '删除中'}
                onPress={onConfirm}
              >
                {confirmLabel}
              </PendingButton>
            </Modal.Footer>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </Modal>
  )
}
