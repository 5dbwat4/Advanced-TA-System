import { Button, Input, Modal, useOverlayState } from '@heroui/react'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import Pen from '~icons/lucide/pen'

import { PendingButton } from '@/components/ui/PendingButton'
import { updateFocusStudent, type FocusStudent } from '@/lib/api'
import { getErrorMessage } from '@/lib/error'

type FocusReasonModalProps = {
  state: ReturnType<typeof useOverlayState>
  classId: string
  target: FocusStudent | null
  onSaved: () => void | Promise<void>
}

export function FocusReasonModal({
  state,
  classId,
  target,
  onSaved,
}: FocusReasonModalProps) {
  const [draft, setDraft] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (state.isOpen && target) setDraft(target.reason)
  }, [state.isOpen, target])

  const save = async () => {
    if (!target) return
    setSaving(true)
    try {
      await updateFocusStudent(classId, target.id, draft.trim())
      await onSaved()
      toast.success('已保存')
      state.close()
    } catch (error) {
      toast.error(getErrorMessage(error, '保存失败'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal state={state}>
      <Modal.Backdrop>
        <Modal.Container>
          <Modal.Dialog className="sm:max-w-md">
            <Modal.CloseTrigger />
            <Modal.Header>
              <Modal.Icon className="bg-brand-500/10 text-brand-600 dark:text-brand-300">
                <Pen width={18} height={18} className="shrink-0" />
              </Modal.Icon>
              <Modal.Heading>修改重点关注原因</Modal.Heading>
            </Modal.Header>
            <Modal.Body className="flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <div className="text-xs font-semibold text-fg-muted">重点关注原因</div>
                <Input
                  fullWidth
                  maxLength={200}
                  autoFocus
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                  placeholder="如：Lab1 未通过，需重点跟进"
                  aria-label="重点关注原因"
                />
              </div>
            </Modal.Body>
            <Modal.Footer>
              <Button slot="close" variant="secondary">
                取消
              </Button>
              <PendingButton
                variant="primary"
                icon={Pen}
                pendingLabel="保存中"
                isDisabled={!target}
                isPending={saving}
                onPress={() => void save()}
              >
                保存
              </PendingButton>
            </Modal.Footer>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </Modal>
  )
}
