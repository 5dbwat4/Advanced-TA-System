import {
  Button,
  Modal,
  ToggleButton,
  ToggleButtonGroup,
  useOverlayState,
} from '@heroui/react'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import Download from '~icons/lucide/download'

import { PendingButton } from '@/components/ui/PendingButton'
import { getErrorMessage } from '@/lib/error'
import {
  exportFocusStudents,
  type FocusStudentsExportData,
  type FocusStudentsExportFormat,
} from '@/lib/focus-students-export'

type FocusExportModalProps = {
  state: ReturnType<typeof useOverlayState>
  data: FocusStudentsExportData
}

export function FocusExportModal({ state, data }: FocusExportModalProps) {
  const [format, setFormat] = useState<FocusStudentsExportFormat>('xlsx')
  const [exporting, setExporting] = useState(false)

  useEffect(() => {
    if (state.isOpen) setFormat('xlsx')
  }, [state.isOpen])

  const runExport = async () => {
    if (data.rows.length === 0) {
      toast.error('暂无可导出的重点关注学生')
      return
    }
    setExporting(true)
    try {
      await exportFocusStudents(format, data)
      toast.success(format === 'xlsx' ? '已导出为 xlsx' : '已导出为 Markdown')
      state.close()
    } catch (error) {
      toast.error(getErrorMessage(error, '导出失败'))
    } finally {
      setExporting(false)
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
                <Download width={18} height={18} className="shrink-0" />
              </Modal.Icon>
              <Modal.Heading>导出重点关注学生</Modal.Heading>
            </Modal.Header>
            <Modal.Body className="flex flex-col gap-4">
              <div className="flex flex-col gap-2">
                <div className="text-xs font-semibold text-fg-muted">导出为……格式</div>
                <ToggleButtonGroup
                  selectionMode="single"
                  disallowEmptySelection
                  size="sm"
                  selectedKeys={new Set([format])}
                  onSelectionChange={(keys) => {
                    const first = keys.values().next().value
                    if (first != null) setFormat(String(first) as FocusStudentsExportFormat)
                  }}
                >
                  <ToggleButton id="xlsx">xlsx</ToggleButton>
                  <ToggleButton id="markdown">
                    <ToggleButtonGroup.Separator />
                    Markdown
                  </ToggleButton>
                </ToggleButtonGroup>
              </div>
            </Modal.Body>
            <Modal.Footer>
              <Button slot="close" variant="secondary">
                取消
              </Button>
              <PendingButton
                variant="primary"
                icon={Download}
                pendingLabel="导出中"
                isPending={exporting}
                onPress={() => void runExport()}
              >
                导出
              </PendingButton>
            </Modal.Footer>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </Modal>
  )
}
