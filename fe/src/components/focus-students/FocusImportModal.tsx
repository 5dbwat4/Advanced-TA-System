import {
  Button,
  Checkbox,
  Input,
  Modal,
  TextArea,
  useOverlayState,
} from '@heroui/react'
import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import Import from '~icons/lucide/import'

import type { FocusStudentOption } from '@/components/focus-students/types'
import { PendingButton } from '@/components/ui/PendingButton'
import { addFocusStudent } from '@/lib/api'
import { getErrorMessage } from '@/lib/error'

type FocusImportModalProps = {
  state: ReturnType<typeof useOverlayState>
  classId: string
  candidates: FocusStudentOption[]
  onSaved: () => void | Promise<void>
}

function matchCandidates(text: string, candidates: FocusStudentOption[]): FocusStudentOption[] {
  const normalizedText = text.replace(/\s+/g, '').toLowerCase()
  if (!normalizedText) return []
  return candidates.filter((student) =>
    normalizedText.includes(student.name.replace(/\s+/g, '').toLowerCase()),
  )
}

export function FocusImportModal({
  state,
  classId,
  candidates,
  onSaved,
}: FocusImportModalProps) {
  const [text, setText] = useState('')
  const [reason, setReason] = useState('')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [importing, setImporting] = useState(false)

  useEffect(() => {
    if (state.isOpen) {
      setText('')
      setReason('')
      setSelected(new Set())
    }
  }, [state.isOpen])

  const matched = useMemo(() => matchCandidates(text, candidates), [text, candidates])
  const allSelected = matched.length > 0 && matched.every((item) => selected.has(item.id))
  const someSelected = matched.some((item) => selected.has(item.id))
  const selectedCount = matched.filter((item) => selected.has(item.id)).length

  const handleTextChange = (value: string) => {
    setText(value)
    setSelected(new Set(matchCandidates(value, candidates).map((item) => item.id)))
  }

  const toggleRow = (id: string, checked: boolean) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (checked) next.add(id)
      else next.delete(id)
      return next
    })
  }

  const toggleAll = (checked: boolean) => {
    setSelected(checked ? new Set(matched.map((item) => item.id)) : new Set())
  }

  const submit = async () => {
    const rows = matched.filter((item) => selected.has(item.id))
    if (rows.length === 0) return
    setImporting(true)
    try {
      const results = await Promise.allSettled(
        rows.map((item) =>
          addFocusStudent(classId, {
            userId: item.id,
            reason: reason.trim() || undefined,
          }),
        ),
      )
      const successCount = results.filter((result) => result.status === 'fulfilled').length
      const failedCount = results.length - successCount
      await onSaved()
      if (successCount > 0) {
        toast.success(
          failedCount > 0
            ? `已导入 ${successCount} 名学生，${failedCount} 名导入失败`
            : `已导入 ${successCount} 名学生`,
        )
      } else {
        toast.error('导入失败')
      }
      if (failedCount === 0) state.close()
    } catch (error) {
      toast.error(getErrorMessage(error, '导入失败'))
    } finally {
      setImporting(false)
    }
  }

  return (
    <Modal state={state}>
      <Modal.Backdrop>
        <Modal.Container>
          <Modal.Dialog className="sm:max-w-lg">
            <Modal.CloseTrigger />
            <Modal.Header>
              <Modal.Icon className="bg-brand-500/10 text-brand-600 dark:text-brand-300">
                <Import width={18} height={18} className="shrink-0" />
              </Modal.Icon>
              <Modal.Heading>一键导入重点关注学生</Modal.Heading>
            </Modal.Header>
            <Modal.Body className="flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <div className="text-xs font-semibold text-fg-muted">上游文案</div>
                <TextArea
                  fullWidth
                  rows={5}
                  value={text}
                  onChange={(event) => handleTextChange(event.target.value)}
                  placeholder="粘贴包含重点关注学生姓名的文案"
                  aria-label="上游文案"
                />
              </div>

              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between gap-3">
                  <div className="text-xs font-semibold text-fg-muted">
                    选出重点关注对象学生
                  </div>
                  {matched.length > 0 && (
                    <span className="tabular text-[11px] text-fg-subtle">
                      已选 {selectedCount} / {matched.length}
                    </span>
                  )}
                </div>

                {!text.trim() ? (
                  <div className="rounded-xl border border-dashed border-line px-4 py-6 text-center text-xs text-fg-subtle">
                    粘贴文案后，将自动按姓名匹配本班学生
                  </div>
                ) : matched.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-line px-4 py-6 text-center text-xs text-fg-subtle">
                    未匹配到本班学生（已在名单中的学生不会重复显示）
                  </div>
                ) : (
                  <div className="max-h-56 overflow-auto rounded-xl border border-line">
                    <div className="sticky top-0 z-10 flex items-center gap-3 border-b border-line bg-elevated px-4 py-2">
                      <Checkbox
                        aria-label="全选匹配学生"
                        isSelected={allSelected}
                        isIndeterminate={someSelected && !allSelected}
                        onChange={toggleAll}
                      >
                        <Checkbox.Content>
                          <Checkbox.Control>
                            <Checkbox.Indicator />
                          </Checkbox.Control>
                        </Checkbox.Content>
                      </Checkbox>
                      <span className="text-xs font-semibold text-fg-muted">全选</span>
                    </div>
                    {matched.map((item) => (
                      <div
                        key={item.id}
                        className="flex items-center gap-3 border-b border-line px-4 py-2 last:border-b-0 hover:bg-sunken/40"
                      >
                        <Checkbox
                          aria-label={`选择 ${item.name}`}
                          isSelected={selected.has(item.id)}
                          onChange={(checked) => toggleRow(item.id, checked)}
                        >
                          <Checkbox.Content>
                            <Checkbox.Control>
                              <Checkbox.Indicator />
                            </Checkbox.Control>
                          </Checkbox.Content>
                        </Checkbox>
                        <div className="min-w-0">
                          <div className="truncate text-sm font-semibold">{item.name}</div>
                          <div className="tabular truncate text-[11px] text-fg-subtle">
                            {item.studentId || '—'}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="flex flex-col gap-1.5">
                <div className="text-xs font-semibold text-fg-muted">重点关注原因</div>
                <Input
                  fullWidth
                  maxLength={200}
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                  placeholder="如：教学科通知"
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
                icon={Import}
                pendingLabel="保存中"
                isDisabled={selectedCount === 0}
                isPending={importing}
                onPress={() => void submit()}
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
