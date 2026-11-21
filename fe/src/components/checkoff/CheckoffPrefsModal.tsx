import { Modal, useOverlayState } from '@heroui/react'

import { PreferenceOnboarding } from '@/components/checkoff/PreferenceOnboarding'
import type { UserPreferences } from '@/lib/api'

type CheckoffPrefsModalProps = {
  state: ReturnType<typeof useOverlayState>
  preferences: UserPreferences
  onSubmit: (prefs: UserPreferences) => Promise<void>
  onCancel: () => void
}

export function CheckoffPrefsModal({
  state,
  preferences,
  onSubmit,
  onCancel,
}: CheckoffPrefsModalProps) {
  return (
    <Modal state={state}>
      <Modal.Backdrop>
        <Modal.Container>
          <Modal.Dialog className="sm:max-w-3xl">
            <Modal.CloseTrigger />
            <Modal.Body>
              <PreferenceOnboarding
                initial={preferences}
                onSubmit={onSubmit}
                onCancel={onCancel}
                layout="rows"
              />
            </Modal.Body>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </Modal>
  )
}
