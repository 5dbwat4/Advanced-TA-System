import {
  Button,
  ListBox,
  Modal,
  Select,
  useOverlayState,
} from '@heroui/react'
import NotebookText from '~icons/lucide/notebook-text'

import type { QuestionBank } from '@/lib/api'

const FOLLOW_BANK = '__follow__'

type CheckoffBankPickerModalProps = {
  state: ReturnType<typeof useOverlayState>
  banks: QuestionBank[]
  value: string | null
  onChange: (value: string | null) => void
  onConfirm: () => void
}

export function CheckoffBankPickerModal({
  state,
  banks,
  value,
  onChange,
  onConfirm,
}: CheckoffBankPickerModalProps) {
  return (
    <Modal state={state}>
      <Modal.Backdrop>
        <Modal.Container>
          <Modal.Dialog className="sm:max-w-md">
            <Modal.CloseTrigger />
            <Modal.Header>
              <Modal.Icon className="bg-brand-500/10 text-brand-600 dark:text-brand-300">
                <NotebookText width={18} height={18} className="shrink-0" />
              </Modal.Icon>
              <Modal.Heading>使用其它题目集</Modal.Heading>
            </Modal.Header>
            <Modal.Body className="flex flex-col gap-3">
              <p className="text-xs text-fg-subtle">
                选择后将覆盖实验设定的题目集；此设置仅保存在当前设备。
              </p>
              <Select
                aria-label="题目集"
                className="w-full"
                placeholder="跟随实验设置"
                value={value ?? FOLLOW_BANK}
                onChange={(key) =>
                  onChange(key == null || key === FOLLOW_BANK ? null : String(key))
                }
              >
                <Select.Trigger>
                  <Select.Value />
                  <Select.Indicator />
                </Select.Trigger>
                <Select.Popover>
                  <ListBox>
                    <ListBox.Item id={FOLLOW_BANK} textValue="跟随实验设置">
                      跟随实验设置
                      <ListBox.ItemIndicator />
                    </ListBox.Item>
                    {banks.map((bank) => (
                      <ListBox.Item key={bank.id} id={bank.id} textValue={bank.name}>
                        {bank.name}
                        <ListBox.ItemIndicator />
                      </ListBox.Item>
                    ))}
                  </ListBox>
                </Select.Popover>
              </Select>
            </Modal.Body>
            <Modal.Footer>
              <Button slot="close" variant="secondary">
                取消
              </Button>
              <Button variant="primary" onPress={onConfirm}>
                保存
              </Button>
            </Modal.Footer>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </Modal>
  )
}
