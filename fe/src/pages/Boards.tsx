import {
  Autocomplete,
  Button,
  Chip,
  EmptyState as HeroEmptyState,
  Input,
  Label,
  ListBox,
  Modal,
  SearchField,
  Skeleton,
  ToggleButton,
  ToggleButtonGroup,
  useFilter,
  useOverlayState,
  type Key,
} from '@heroui/react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'

import CircuitBoard from '~icons/lucide/circuit-board'
import Pen from '~icons/lucide/pen'
import Phone from '~icons/lucide/phone'
import Plus from '~icons/lucide/plus'
import RotateCcw from '~icons/lucide/rotate-ccw'
import ScanLine from '~icons/lucide/scan-line'
import School from '~icons/lucide/school'
import Trash2 from '~icons/lucide/trash-2'
import Upload from '~icons/lucide/upload'
import UserRound from '~icons/lucide/user-round'
import { BulkImportModal } from '@/components/boards/BulkImportModal'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { Card, EmptyState } from '@/components/ui/Card'
import { IconAction } from '@/components/ui/IconAction'
import { PageHeader } from '@/components/ui/PageHeader'
import { PendingButton } from '@/components/ui/PendingButton'
import {
  borrowDevBoard,
  createDevBoard,
  deleteDevBoard,
  listDevBoards,
  listStudents,
  returnDevBoard,
  updateDevBoard,
  type DevBoard,
  type Student,
} from '@/lib/api'
import { getErrorMessage } from '@/lib/error'
import { useCurrentClass } from '@/lib/store'
import { cn } from '@/lib/utils'

type BoardTab = 'all' | 'borrowed' | 'in-stock'

const TAB_ITEM_CLASS =
  'data-[selected=true]:bg-brand-500 data-[selected=true]:text-white data-[selected=true]:hover:bg-brand-500'

function sortBoards(boards: DevBoard[]): DevBoard[] {
  return [...boards].sort(
    (a, b) =>
      Number(b.borrowed) - Number(a.borrowed) ||
      a.dbId.localeCompare(b.dbId, 'zh-CN', { numeric: true }),
  )
}

function StudentPicker({
  students,
  value,
  onChange,
}: {
  students: Student[]
  value: Key[]
  onChange: (keys: Key[]) => void
}) {
  const { contains } = useFilter({ sensitivity: 'base' })

  return (
    <Autocomplete
      className="w-full"
      placeholder="搜索并选择学生"
      selectionMode="multiple"
      value={value}
      onChange={onChange}
    >
      <Label>合用学生</Label>
      <Autocomplete.Trigger>
        <Autocomplete.Value />
        <Autocomplete.ClearButton />
        <Autocomplete.Indicator />
      </Autocomplete.Trigger>
      <Autocomplete.Popover>
        <Autocomplete.Filter filter={contains}>
          <SearchField autoFocus aria-label="搜索学生" name="search" variant="secondary">
            <SearchField.Group>
              <SearchField.SearchIcon />
              <SearchField.Input placeholder="搜索姓名 / 学号" />
              <SearchField.ClearButton />
            </SearchField.Group>
          </SearchField>
          <ListBox renderEmptyState={() => <HeroEmptyState>没有匹配的学生</HeroEmptyState>}>
            {students.map((student) => (
              <ListBox.Item
                key={student.stuId}
                id={student.stuId}
                textValue={`${student.name} ${student.studentNo}`}
              >
                {student.name} {student.studentNo}
                <ListBox.ItemIndicator />
              </ListBox.Item>
            ))}
          </ListBox>
        </Autocomplete.Filter>
      </Autocomplete.Popover>
    </Autocomplete>
  )
}

export default function Boards() {
  const navigate = useNavigate()
  const currentClass = useCurrentClass()
  const classId = currentClass?.id ?? null

  const [boards, setBoards] = useState<DevBoard[]>([])
  const [students, setStudents] = useState<Student[]>([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<BoardTab>('all')
  const importState = useOverlayState()

  const load = useCallback(async () => {
    if (!classId) {
      setBoards([])
      setStudents([])
      setLoading(false)
      return
    }
    setLoading(true)
    try {
      const [boardRes, studentRes] = await Promise.all([
        listDevBoards(classId),
        listStudents(classId),
      ])
      setBoards(boardRes.devBoards)
      setStudents(studentRes.students)
    } catch (error) {
      toast.error(getErrorMessage(error, '加载开发板失败'))
    } finally {
      setLoading(false)
    }
  }, [classId])

  useEffect(() => {
    void load()
  }, [load])

  const upsertBoard = (board: DevBoard) => {
    setBoards((prev) => {
      const exists = prev.some((item) => item.id === board.id)
      return exists ? prev.map((item) => (item.id === board.id ? board : item)) : [...prev, board]
    })
  }

  // 新建 / 编辑弹窗
  const formState = useOverlayState({
    onOpenChange: (open) => {
      if (!open) setEditingBoard(null)
    },
  })
  const [editingBoard, setEditingBoard] = useState<DevBoard | null>(null)
  const [dbIdDraft, setDbIdDraft] = useState('')
  const [boardIdDraft, setBoardIdDraft] = useState('')
  const [phoneDraft, setPhoneDraft] = useState('')
  const [stuIdDrafts, setStuIdDrafts] = useState<Key[]>([])
  const [saving, setSaving] = useState(false)

  const openCreate = () => {
    setEditingBoard(null)
    setDbIdDraft('')
    setBoardIdDraft('')
    setPhoneDraft('')
    setStuIdDrafts([])
    formState.open()
  }

  const openEdit = (board: DevBoard) => {
    setEditingBoard(board)
    setDbIdDraft(board.dbId)
    setBoardIdDraft(board.boardId ?? '')
    setPhoneDraft(board.phone ?? '')
    setStuIdDrafts(board.stuIds)
    formState.open()
  }

  const submitForm = async () => {
    if (!classId || !dbIdDraft.trim()) return
    setSaving(true)
    try {
      const body = {
        dbId: dbIdDraft.trim(),
        boardId: boardIdDraft.trim() || null,
        phone: phoneDraft.trim() || null,
        stuIds: stuIdDrafts.map(String),
      }
      if (editingBoard) {
        const { devBoard } = await updateDevBoard(editingBoard.id, body)
        upsertBoard(devBoard)
        toast.success('已保存')
      } else {
        const { devBoard } = await createDevBoard(classId, body)
        upsertBoard(devBoard)
        toast.success('已新建开发板')
      }
      formState.close()
    } catch (error) {
      toast.error(getErrorMessage(error, editingBoard ? '保存失败' : '新建失败'))
    } finally {
      setSaving(false)
    }
  }

  // 借出弹窗
  const borrowState = useOverlayState({
    onOpenChange: (open) => {
      if (!open) setBorrowTarget(null)
    },
  })
  const [borrowTarget, setBorrowTarget] = useState<DevBoard | null>(null)
  const [borrowStuIds, setBorrowStuIds] = useState<Key[]>([])
  const [borrowPhone, setBorrowPhone] = useState('')
  const [borrowing, setBorrowing] = useState(false)

  const openBorrow = (board: DevBoard) => {
    setBorrowTarget(board)
    setBorrowStuIds(board.stuIds)
    setBorrowPhone(board.phone ?? '')
    borrowState.open()
  }

  const submitBorrow = async () => {
    if (!borrowTarget || borrowStuIds.length === 0) return
    setBorrowing(true)
    try {
      const { devBoard } = await borrowDevBoard(borrowTarget.id, {
        stuIds: borrowStuIds.map(String),
        phone: borrowPhone.trim() || null,
      })
      upsertBoard(devBoard)
      toast.success(`${devBoard.dbId} 已借出`)
      borrowState.close()
    } catch (error) {
      toast.error(getErrorMessage(error, '借出失败'))
    } finally {
      setBorrowing(false)
    }
  }

  // 归还
  const [returningId, setReturningId] = useState<string | null>(null)

  const doReturn = async (board: DevBoard) => {
    setReturningId(board.id)
    try {
      const { devBoard } = await returnDevBoard(board.id)
      upsertBoard(devBoard)
      toast.success(`${devBoard.dbId} 已归还`)
    } catch (error) {
      toast.error(getErrorMessage(error, '归还失败'))
    } finally {
      setReturningId(null)
    }
  }

  const requestReturn = (board: DevBoard) => {
    setConfirm({ kind: 'return', board })
    confirmState.open()
  }

  // 归还 / 删除确认弹窗
  const confirmState = useOverlayState({
    onOpenChange: (open) => {
      if (!open) setConfirm(null)
    },
  })
  const [confirm, setConfirm] = useState<{ kind: 'return' | 'delete'; board: DevBoard } | null>(
    null,
  )
  const [deleting, setDeleting] = useState(false)

  const requestDelete = (board: DevBoard) => {
    setConfirm({ kind: 'delete', board })
    confirmState.open()
  }

  const submitConfirm = async () => {
    if (!confirm) return
    if (confirm.kind === 'return') {
      await doReturn(confirm.board)
      confirmState.close()
      return
    }
    setDeleting(true)
    try {
      await deleteDevBoard(confirm.board.id)
      setBoards((prev) => prev.filter((board) => board.id !== confirm.board.id))
      toast.success('已删除')
      confirmState.close()
    } catch (error) {
      toast.error(getErrorMessage(error, '删除失败'))
    } finally {
      setDeleting(false)
    }
  }

  const sortedBoards = useMemo(() => sortBoards(boards), [boards])
  const visibleBoards = useMemo(
    () =>
      sortedBoards.filter((board) =>
        tab === 'all' ? true : tab === 'borrowed' ? board.borrowed : !board.borrowed,
      ),
    [sortedBoards, tab],
  )
  const borrowedCount = boards.filter((board) => board.borrowed).length
  const isReturnConfirm = confirm?.kind === 'return'

  return (
    <>
      <div className="mx-auto max-w-6xl">
        <PageHeader
          title="开发板管理"
          subtitle={
            <>
              <span className="tabular">{borrowedCount}</span> /{' '}
              <span className="tabular">{boards.length}</span> 已借出
            </>
          }
          actions={
            <>
              <Button variant="secondary" isDisabled={!classId} onPress={importState.open}>
                <Upload width={16} height={16} className="shrink-0" />
                批量导入
              </Button>
              <Button variant="secondary" onPress={openCreate}>
                <Plus width={16} height={16} className="shrink-0" />
                新建开发板
              </Button>
              <Button
                variant="primary"
                onPress={() => navigate('/console/boards/scan')}
              >
                <ScanLine width={16} height={16} className="shrink-0" />
                扫码
              </Button>
            </>
          }
        />

        {!classId ? (
          <EmptyState icon={School} title="未选择课程" hint="请先在右上角选择或绑定一个课程" />
        ) : (
          <>
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <ToggleButtonGroup
                isDetached
                size="sm"
                selectionMode="single"
                disallowEmptySelection
                selectedKeys={new Set([tab])}
                onSelectionChange={(keys) => {
                  const first = keys.values().next().value
                  if (first != null) setTab(String(first) as BoardTab)
                }}
              >
                <ToggleButton id="all" variant="ghost" className={TAB_ITEM_CLASS}>
                  状态
                </ToggleButton>
                <ToggleButton id="borrowed" variant="ghost" className={TAB_ITEM_CLASS}>
                  已借出
                </ToggleButton>
                <ToggleButton id="in-stock" variant="ghost" className={TAB_ITEM_CLASS}>
                  在库
                </ToggleButton>
              </ToggleButtonGroup>
              <div className="tabular text-sm text-fg-muted">
                {visibleBoards.length} / {boards.length}
              </div>
            </div>

            {loading ? (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {Array.from({ length: 6 }).map((_, index) => (
                  <Skeleton key={index} className="h-48 rounded-2xl" />
                ))}
              </div>
            ) : visibleBoards.length === 0 ? (
              <EmptyState
                icon={CircuitBoard}
                title={boards.length === 0 ? '暂无开发板' : '暂无匹配的开发板'}
                hint={boards.length === 0 ? '点击右上角「新建开发板」开始登记' : undefined}
              />
            ) : (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {visibleBoards.map((board, index) => (
                  <Card
                    key={board.id}
                    index={Math.min(index, 8)}
                    className="flex flex-col gap-3"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="truncate text-xl font-bold tracking-tight">
                          {board.dbId}
                        </div>
                        <div className="tabular mt-0.5 truncate text-sm text-fg-muted">
                          {board.boardId || '—'}
                        </div>
                      </div>
                      <Chip
                        size="sm"
                        variant="soft"
                        color={board.borrowed ? 'warning' : 'success'}
                      >
                        {board.borrowed ? '已借出' : '在库'}
                      </Chip>
                    </div>

                    <div className="flex flex-col gap-1.5 text-sm">
                      <div className="flex items-center gap-2">
                        <UserRound width={15} height={15} className="shrink-0 text-fg-subtle" />
                        <span
                          className={cn(
                            'truncate',
                            board.students.length === 0 && 'text-fg-subtle',
                          )}
                        >
                          {board.students.length > 0
                            ? board.students.map((student) => student.name).join('、')
                            : '未登记合用学生'}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Phone width={15} height={15} className="shrink-0 text-fg-subtle" />
                        <span className={cn('tabular truncate', !board.phone && 'text-fg-subtle')}>
                          {board.phone || '未登记联系电话'}
                        </span>
                      </div>
                    </div>

                    <div className="mt-auto flex items-center gap-2 pt-1">
                      {board.borrowed ? (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="flex-1 border border-success/30 bg-success/5 text-success hover:bg-success/10"
                          isPending={returningId === board.id}
                          onPress={() => requestReturn(board)}
                        >
                          归还
                        </Button>
                      ) : (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="flex-1 border border-brand-500/30 bg-brand-500/5 text-brand-600 hover:bg-brand-500/10 dark:text-brand-300"
                          onPress={() => openBorrow(board)}
                        >
                          借出
                        </Button>
                      )}
                      <IconAction
                        label="编辑"
                        variant="secondary"
                        onPress={() => openEdit(board)}
                      >
                        <Pen width={15} height={15} className="shrink-0" />
                      </IconAction>
                      <IconAction
                        label="删除"
                        variant="danger-soft"
                        onPress={() => requestDelete(board)}
                      >
                        <Trash2 width={15} height={15} className="shrink-0" />
                      </IconAction>
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </>
        )}
      </div>

      <Modal state={formState}>
        <Modal.Backdrop>
          <Modal.Container>
            <Modal.Dialog className="sm:max-w-lg">
              <Modal.CloseTrigger />
              <Modal.Header>
                <Modal.Icon className="bg-brand-500/10 text-brand-600 dark:text-brand-300">
                  <CircuitBoard width={18} height={18} className="shrink-0" />
                </Modal.Icon>
                <Modal.Heading>{editingBoard ? '编辑开发板' : '新建开发板'}</Modal.Heading>
              </Modal.Header>
              <Modal.Body className="flex flex-col gap-4">
                <div className="flex flex-col gap-1.5">
                  <div className="text-xs font-semibold text-fg-muted">DB id</div>
                  <Input
                    fullWidth
                    autoFocus
                    maxLength={64}
                    value={dbIdDraft}
                    onChange={(event) => setDbIdDraft(event.target.value)}
                    placeholder="如：DB180BD"
                    aria-label="DB id"
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <div className="text-xs font-semibold text-fg-muted">id</div>
                  <Input
                    fullWidth
                    maxLength={64}
                    value={boardIdDraft}
                    onChange={(event) => setBoardIdDraft(event.target.value)}
                    placeholder="如：21025306"
                    aria-label="id"
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <div className="text-xs font-semibold text-fg-muted">联系电话</div>
                  <Input
                    fullWidth
                    maxLength={32}
                    value={phoneDraft}
                    onChange={(event) => setPhoneDraft(event.target.value)}
                    placeholder="如：18989469811"
                    aria-label="联系电话"
                  />
                </div>
                <StudentPicker students={students} value={stuIdDrafts} onChange={setStuIdDrafts} />
              </Modal.Body>
              <Modal.Footer>
                <Button slot="close" variant="secondary">
                  取消
                </Button>
                <PendingButton
                  variant="primary"
                  icon={editingBoard ? Pen : Plus}
                  pendingLabel="保存中"
                  isDisabled={!dbIdDraft.trim()}
                  isPending={saving}
                  onPress={() => void submitForm()}
                >
                  {editingBoard ? '保存' : '新建'}
                </PendingButton>
              </Modal.Footer>
            </Modal.Dialog>
          </Modal.Container>
        </Modal.Backdrop>
      </Modal>

      <Modal state={borrowState}>
        <Modal.Backdrop>
          <Modal.Container>
            <Modal.Dialog className="sm:max-w-lg">
              <Modal.CloseTrigger />
              <Modal.Header>
                <Modal.Icon className="bg-brand-500/10 text-brand-600 dark:text-brand-300">
                  <UserRound width={18} height={18} className="shrink-0" />
                </Modal.Icon>
                <Modal.Heading>借出开发板</Modal.Heading>
              </Modal.Header>
              <Modal.Body className="flex flex-col gap-4">
                <div className="text-sm text-fg-muted">
                  DB id：
                  <span className="font-semibold text-fg">{borrowTarget?.dbId ?? '—'}</span>
                </div>
                <StudentPicker
                  students={students}
                  value={borrowStuIds}
                  onChange={setBorrowStuIds}
                />
                <div className="flex flex-col gap-1.5">
                  <div className="text-xs font-semibold text-fg-muted">联系电话</div>
                  <Input
                    fullWidth
                    maxLength={32}
                    value={borrowPhone}
                    onChange={(event) => setBorrowPhone(event.target.value)}
                    placeholder="如：18989469811"
                    aria-label="联系电话"
                  />
                </div>
              </Modal.Body>
              <Modal.Footer>
                <Button slot="close" variant="secondary">
                  取消
                </Button>
                <PendingButton
                  variant="primary"
                  pendingLabel="借出中"
                  isDisabled={borrowStuIds.length === 0}
                  isPending={borrowing}
                  onPress={() => void submitBorrow()}
                >
                  确认借出
                </PendingButton>
              </Modal.Footer>
            </Modal.Dialog>
          </Modal.Container>
        </Modal.Backdrop>
      </Modal>

      <ConfirmDialog
        state={confirmState}
        icon={isReturnConfirm ? RotateCcw : Trash2}
        tone={isReturnConfirm ? 'brand' : 'danger'}
        title={isReturnConfirm ? '归还开发板' : '删除开发板'}
        description={
          confirm
            ? confirm.kind === 'return'
              ? `确定将 ${confirm.board.dbId} 标记为已归还吗？`
              : `确定删除 ${confirm.board.dbId} 吗？删除后无法恢复。`
            : ''
        }
        confirmLabel={isReturnConfirm ? '归还' : '删除'}
        isPending={
          isReturnConfirm ? returningId === confirm?.board.id : deleting
        }
        onConfirm={() => void submitConfirm()}
      />

      <BulkImportModal
        classId={classId}
        state={importState}
        onImported={() => void load()}
      />
    </>
  )
}
