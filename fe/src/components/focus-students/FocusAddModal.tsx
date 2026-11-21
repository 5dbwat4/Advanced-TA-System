import {
  Autocomplete,
  Button,
  EmptyState as HeroEmptyState,
  Input,
  Label,
  ListBox,
  Modal,
  SearchField,
  useOverlayState,
  type Key,
} from '@heroui/react'
import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import Plus from '~icons/lucide/plus'

import type { FocusStudentOption } from '@/components/focus-students/types'
import { PendingButton } from '@/components/ui/PendingButton'
import { addFocusStudent } from '@/lib/api'
import { getErrorMessage } from '@/lib/error'
import { matchStudent } from '@/lib/pinyin'

type FocusAddModalProps = {
  state: ReturnType<typeof useOverlayState>
  classId: string
  candidates: FocusStudentOption[]
  onSaved: () => void | Promise<void>
}

export function FocusAddModal({
  state,
  classId,
  candidates,
  onSaved,
}: FocusAddModalProps) {
  const [studentId, setStudentId] = useState<Key | null>(null)
  const [reason, setReason] = useState('')
  const [query, setQuery] = useState('')
  const [adding, setAdding] = useState(false)

  useEffect(() => {
    if (state.isOpen) {
      setStudentId(null)
      setReason('')
      setQuery('')
    }
  }, [state.isOpen])

  const visibleCandidates = useMemo(
    () => candidates.filter((item) => matchStudent(query, item)),
    [candidates, query],
  )

  const submit = async () => {
    if (studentId == null) return
    setAdding(true)
    try {
      await addFocusStudent(classId, {
        userId: String(studentId),
        reason: reason.trim() || undefined,
      })
      await onSaved()
      toast.success('已添加重点关注学生')
      state.close()
    } catch (error) {
      toast.error(getErrorMessage(error, '添加失败'))
    } finally {
      setAdding(false)
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
                <Plus width={18} height={18} className="shrink-0" />
              </Modal.Icon>
              <Modal.Heading>添加重点关注学生</Modal.Heading>
            </Modal.Header>
            <Modal.Body className="flex flex-col gap-4">
              <Autocomplete
                className="w-full"
                placeholder="搜索并选择学生"
                selectionMode="single"
                value={studentId}
                onChange={setStudentId}
              >
                <Label>学生</Label>
                <Autocomplete.Trigger>
                  <Autocomplete.Value />
                  <Autocomplete.ClearButton />
                  <Autocomplete.Indicator />
                </Autocomplete.Trigger>
                <Autocomplete.Popover>
                  <Autocomplete.Filter inputValue={query} onInputChange={setQuery}>
                    <SearchField autoFocus aria-label="搜索学生" name="search" variant="secondary">
                      <SearchField.Group>
                        <SearchField.SearchIcon />
                        <SearchField.Input placeholder="搜索" />
                        <SearchField.ClearButton />
                      </SearchField.Group>
                    </SearchField>
                    <ListBox
                      renderEmptyState={() => (
                        <HeroEmptyState>没有匹配的学生</HeroEmptyState>
                      )}
                    >
                      {visibleCandidates.map((item) => (
                        <ListBox.Item
                          key={item.id}
                          id={item.id}
                          textValue={`${item.name} ${item.studentId}`}
                        >
                          {item.name} {item.studentId}
                          <ListBox.ItemIndicator />
                        </ListBox.Item>
                      ))}
                    </ListBox>
                  </Autocomplete.Filter>
                </Autocomplete.Popover>
              </Autocomplete>

              <div className="flex flex-col gap-1.5">
                <div className="text-xs font-semibold text-fg-muted">重点关注原因</div>
                <Input
                  fullWidth
                  maxLength={200}
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
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
                icon={Plus}
                pendingLabel="添加中"
                isDisabled={studentId == null}
                isPending={adding}
                onPress={() => void submit()}
              >
                添加
              </PendingButton>
            </Modal.Footer>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </Modal>
  )
}
