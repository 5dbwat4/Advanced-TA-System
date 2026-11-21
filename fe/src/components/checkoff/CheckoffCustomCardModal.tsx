import { Modal, useOverlayState } from '@heroui/react'
import NotebookText from '~icons/lucide/notebook-text'

import { Markdown } from '@/components/ui/Markdown'
import type { MarkdownStyleId } from '@/lib/api'
import type { CustomCard } from '@/lib/custom-cards'

type CheckoffCustomCardModalProps = {
  state: ReturnType<typeof useOverlayState>
  card: CustomCard | null
  markdownStyle: MarkdownStyleId
  onOpenChange: (open: boolean) => void
}

export function CheckoffCustomCardModal({
  state,
  card,
  markdownStyle,
  onOpenChange,
}: CheckoffCustomCardModalProps) {
  return (
    <Modal state={state} onOpenChange={onOpenChange}>
      <Modal.Backdrop>
        <Modal.Container>
          <Modal.Dialog className="sm:max-w-2xl">
            <Modal.CloseTrigger />
            <Modal.Header>
              <Modal.Icon className="bg-brand-500/10 text-brand-600 dark:text-brand-300">
                <NotebookText width={18} height={18} className="shrink-0" />
              </Modal.Icon>
              <Modal.Heading>自定义 Card</Modal.Heading>
            </Modal.Header>
            <Modal.Body>
              {card?.content.trim() ? (
                <Markdown source={card.content} style={markdownStyle} />
              ) : (
                <p className="py-8 text-center text-sm text-fg-subtle">这张 Card 暂无内容</p>
              )}
            </Modal.Body>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </Modal>
  )
}
