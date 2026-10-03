import {
  Autocomplete,
  Button,
  Checkbox,
  Chip,
  EmptyState as HeroEmptyState,
  Label,
  ListBox,
  Modal,
  SearchField,
  useFilter,
  useOverlayState,
  type Key,
} from '@heroui/react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'

import Check from '~icons/lucide/check'
import FlipHorizontal2 from '~icons/lucide/flip-horizontal-2'
import Pen from '~icons/lucide/pen'
import Plus from '~icons/lucide/plus'
import School from '~icons/lucide/school'
import SquareCheckBig from '~icons/lucide/square-check-big'
import Trash2 from '~icons/lucide/trash-2'
import { BackLink } from '@/components/ui/BackLink'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { EmptyState } from '@/components/ui/Card'
import { IconAction } from '@/components/ui/IconAction'
import { PageHeader } from '@/components/ui/PageHeader'
import { PendingButton } from '@/components/ui/PendingButton'
import { SearchInput } from '@/components/ui/SearchInput'
import { SkeletonList } from '@/components/ui/SkeletonList'
import {
  addCheckpointStudent,
  deleteCheckpointStudents,
  fetchCheckpointClaims,
  listStudents,
  type CheckpointClaim,
} from '@/lib/api'
import { getErrorMessage } from '@/lib/error'
import { formatLocaleDateTime } from '@/lib/format'
import { matchStudent } from '@/lib/pinyin'
import { useAsyncData } from '@/lib/request'
import { useCurrentClass } from '@/lib/store'

type StudentOption = { id: string; textValue: string }

type DeleteTarget = { kind: 'single'; target: CheckpointClaim } | { kind: 'bulk' }

const TH = 'border-b border-r border-line bg-elevated px-4 py-2 text-left font-semibold'

export default function Checkpoints() {
  const currentClass = useCurrentClass()
  const classId = currentClass?.id ?? null

  const { contains } = useFilter({ sensitivity: 'base' })

  const [editing, setEditing] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [query, setQuery] = useState('')

  const [claims, setClaims] = useState<CheckpointClaim[]>([])
  const [loading, setLoading] = useState(true)

  const {
    data: studentData,
    loading: studentsLoading,
    error: studentsError,
  } = useAsyncData(
    () => (classId ? listStudents(classId) : Promise.resolve({ students: [] })),
    [classId],
  )

  const students = useMemo(() => studentData?.students ?? [], [studentData])

  useEffect(() => {
    if (studentsError) toast.error(studentsError)
  }, [studentsError])

  const reload = useCallback(async () => {
    if (!classId) {
      setClaims([])
      return
    }
    setLoading(true)
    try {
      const data = await fetchCheckpointClaims(classId)
      setClaims(data.claims)
    } catch (error) {
      toast.error(getErrorMessage(error, '加载 Checkpoint 名单失败'))
    } finally {
      setLoading(false)
    }
  }, [classId])

  useEffect(() => {
    void reload()
  }, [reload])

  const classStudents = useMemo(
    () => students.filter((student) => student.classId === classId),
    [students, classId],
  )

  const rows = useMemo(
    () =>
      claims.filter((item) =>
        matchStudent(query, item.student ?? { name: '', studentNo: '' }),
      ),
    [claims, query],
  )

  const candidates = useMemo<StudentOption[]>(() => {
    const claimIds = new Set(claims.map((item) => item.stuId))
    return classStudents
      .filter((student) => !claimIds.has(student.stuId))
      .map((student) => ({
        id: student.stuId,
        textValue: `${student.name} ${student.studentNo}`,
      }))
  }, [classStudents, claims])

  const allSelected = rows.length > 0 && rows.every((row) => selected.has(row.id))
  const someSelected = rows.some((row) => selected.has(row.id))

  const toggleRow = useCallback((id: string, checked: boolean) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (checked) next.add(id)
      else next.delete(id)
      return next
    })
  }, [])

  const toggleAll = (checked: boolean) => {
    setSelected((prev) => {
      const next = new Set(prev)
      for (const row of rows) {
        if (checked) next.add(row.id)
        else next.delete(row.id)
      }
      return next
    })
  }

  const selectAll = () => setSelected(new Set(rows.map((row) => row.id)))

  const invertSelection = () =>
    setSelected((prev) => {
      const next = new Set(prev)
      for (const row of rows) {
        if (next.has(row.id)) next.delete(row.id)
        else next.add(row.id)
      }
      return next
    })

  // 添加学生弹窗
  const addState = useOverlayState({
    onOpenChange: (open) => {
      if (open) setAddStuId(null)
    },
  })
  const [addStuId, setAddStuId] = useState<Key | null>(null)
  const [adding, setAdding] = useState(false)

  const submitAdd = async () => {
    if (!classId || addStuId == null) return
    setAdding(true)
    try {
      await addCheckpointStudent(classId, { stuId: String(addStuId) })
      await reload()
      toast.success('已加入 Checkpoint 名单')
      addState.close()
    } catch (error) {
      toast.error(getErrorMessage(error, '添加失败'))
    } finally {
      setAdding(false)
    }
  }

  // 删除确认弹窗（单个 / 批量共用）
  const confirmState = useOverlayState({
    onOpenChange: (open) => {
      if (!open) setConfirm(null)
    },
  })
  const [confirm, setConfirm] = useState<DeleteTarget | null>(null)
  const [deleting, setDeleting] = useState(false)

  const openDeleteSingle = (target: CheckpointClaim) => {
    setConfirm({ kind: 'single', target })
    confirmState.open()
  }

  const openDeleteBulk = () => {
    setConfirm({ kind: 'bulk' })
    confirmState.open()
  }

  const submitDelete = async () => {
    if (!classId || !confirm) return
    const ids = confirm.kind === 'single' ? [confirm.target.id] : Array.from(selected)
    if (ids.length === 0) return
    setDeleting(true)
    try {
      await deleteCheckpointStudents(classId, ids)
      if (confirm.kind === 'bulk') {
        setSelected((prev) => {
          const next = new Set(prev)
          for (const id of ids) next.delete(id)
          return next
        })
      }
      await reload()
      toast.success('已移除')
      confirmState.close()
    } catch (error) {
      toast.error(getErrorMessage(error, '删除失败'))
    } finally {
      setDeleting(false)
    }
  }

  const searchBox = (
    <SearchInput
      value={query}
      onChange={setQuery}
      placeholder="搜索姓名 / 学号 / 拼音"
      ariaLabel="搜索 Checkpoint 学生"
      className="min-w-[12rem] flex-1"
    />
  )

  return (
    <>
      <div className="mx-auto max-w-6xl">
        <BackLink to="/console/courses/settings">返回课程设置</BackLink>

        <PageHeader title="「Checkpoint」名单" />

        {!classId ? (
          <EmptyState icon={School} title="未选择课程" hint="请先在右上角选择或绑定一个课程" />
        ) : (
          <>
            <div className="mb-4 flex flex-wrap items-center gap-2">
              {editing ? (
                <>
                  <IconAction
                    label="完成"
                    variant="secondary"
                    onPress={() => {
                      setEditing(false)
                      setSelected(new Set())
                    }}
                  >
                    <Check width={15} height={15} className="shrink-0" />
                  </IconAction>
                  {searchBox}
                  <div className="ms-auto flex flex-wrap items-center gap-2">
                    <IconAction
                      label="删除所选"
                      variant="danger-soft"
                      onPress={() => {
                        if (selected.size > 0) openDeleteBulk()
                      }}
                    >
                      <Trash2 width={15} height={15} className="shrink-0" />
                    </IconAction>
                    <IconAction label="反选" variant="secondary" onPress={invertSelection}>
                      <FlipHorizontal2 width={15} height={15} className="shrink-0" />
                    </IconAction>
                    <IconAction label="全选" variant="secondary" onPress={selectAll}>
                      <SquareCheckBig width={15} height={15} className="shrink-0" />
                    </IconAction>
                    <span className="tabular text-xs font-semibold text-fg-muted">
                      当前已选中（{selected.size}）
                    </span>
                  </div>
                </>
              ) : (
                <>
                  <IconAction
                    label="编辑"
                    variant="secondary"
                    onPress={() => {
                      setEditing(true)
                      setSelected(new Set())
                    }}
                  >
                    <Pen width={15} height={15} className="shrink-0" />
                  </IconAction>
                  {searchBox}
                  <Button size="sm" variant="primary" onPress={addState.open}>
                    <Plus width={15} height={15} className="shrink-0" />
                    添加
                  </Button>
                </>
              )}
            </div>

            <div className="max-h-[65vh] overflow-auto rounded-2xl border border-line bg-elevated">
              {loading || studentsLoading ? (
                <div className="p-4">
                  <SkeletonList rows={4} className="h-10 rounded-xl" />
                </div>
              ) : rows.length === 0 ? (
                <div className="py-10 text-center text-sm text-fg-subtle">
                  {claims.length === 0
                    ? '暂无 Checkpoint 学生，点击「添加」加入名单'
                    : '未找到匹配的学生'}
                </div>
              ) : (
                <table className="w-full border-separate border-spacing-0 text-sm">
                  <thead className="sticky top-0 z-20">
                    <tr>
                      {editing && (
                        <th className={TH}>
                          <Checkbox
                            aria-label="全选"
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
                        </th>
                      )}
                      <th className={`sticky left-0 z-30 ${TH}`}>姓名</th>
                      <th className={TH}>学号</th>
                      <th className={TH}>已应用规则</th>
                      <th className={TH}>添加时间</th>
                      <th className={TH}>操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((item) => {
                      const name = item.student?.name ?? '—'
                      const studentNo = item.student?.studentNo ?? ''
                      return (
                        <tr key={item.id} className="transition-colors hover:bg-sunken/40">
                          {editing && (
                            <td className="border-b border-r border-line px-4 py-2">
                              <Checkbox
                                aria-label={`选择 ${name}`}
                                isSelected={selected.has(item.id)}
                                onChange={(checked) => toggleRow(item.id, checked)}
                              >
                                <Checkbox.Content>
                                  <Checkbox.Control>
                                    <Checkbox.Indicator />
                                  </Checkbox.Control>
                                </Checkbox.Content>
                              </Checkbox>
                            </td>
                          )}
                          <td className="sticky left-0 z-10 border-b border-r border-line bg-elevated px-4 py-2">
                            <div className="font-bold">{name}</div>
                          </td>
                          <td className="tabular border-b border-r border-line px-4 py-2 text-fg-muted">
                            {studentNo || '—'}
                          </td>
                          <td className="border-b border-r border-line px-4 py-2">
                            {item.appliedRuleLabels.length === 0 ? (
                              <span className="text-fg-subtle">—</span>
                            ) : (
                              <div className="flex flex-wrap items-center gap-1">
                                {item.appliedRuleLabels.map((label) => (
                                  <Chip key={label} size="sm" variant="soft" color="accent">
                                    {label}
                                  </Chip>
                                ))}
                              </div>
                            )}
                          </td>
                          <td className="border-b border-r border-line px-4 py-2 text-xs text-fg-muted">
                            {formatLocaleDateTime(item.createdAt)}
                          </td>
                          <td className="border-b border-r border-line px-2 py-1.5">
                            <Button
                              size="sm"
                              variant="ghost"
                              className="text-danger"
                              onPress={() => openDeleteSingle(item)}
                            >
                              删除
                            </Button>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </>
        )}
      </div>

      <Modal state={addState}>
        <Modal.Backdrop>
          <Modal.Container>
            <Modal.Dialog className="sm:max-w-lg">
              <Modal.CloseTrigger />
              <Modal.Header>
                <Modal.Icon className="bg-brand-500/10 text-brand-600 dark:text-brand-300">
                  <Plus width={18} height={18} className="shrink-0" />
                </Modal.Icon>
                <Modal.Heading>添加 Checkpoint 学生</Modal.Heading>
              </Modal.Header>
              <Modal.Body className="flex flex-col gap-4">
                <Autocomplete
                  className="w-full"
                  placeholder="搜索并选择学生"
                  selectionMode="single"
                  value={addStuId}
                  onChange={setAddStuId}
                >
                  <Label>学生</Label>
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
                      <ListBox
                        renderEmptyState={() => (
                          <HeroEmptyState>没有匹配的学生</HeroEmptyState>
                        )}
                      >
                        {candidates.map((item) => (
                          <ListBox.Item key={item.id} id={item.id} textValue={item.textValue}>
                            {item.textValue}
                            <ListBox.ItemIndicator />
                          </ListBox.Item>
                        ))}
                      </ListBox>
                    </Autocomplete.Filter>
                  </Autocomplete.Popover>
                </Autocomplete>
              </Modal.Body>
              <Modal.Footer>
                <Button slot="close" variant="secondary">
                  取消
                </Button>
                <PendingButton
                  variant="primary"
                  icon={Plus}
                  pendingLabel="添加中"
                  isDisabled={addStuId == null}
                  isPending={adding}
                  onPress={() => void submitAdd()}
                >
                  添加
                </PendingButton>
              </Modal.Footer>
            </Modal.Dialog>
          </Modal.Container>
        </Modal.Backdrop>
      </Modal>

      <ConfirmDialog
        state={confirmState}
        title={confirm?.kind === 'single' ? '移除 Checkpoint 学生' : '移除所选学生'}
        description={
          confirm?.kind === 'single'
            ? `确定将 ${confirm.target.student?.name ?? '该学生'} 从 Checkpoint 名单中移除吗？`
            : `确定将选中的 ${selected.size} 名学生从 Checkpoint 名单中移除吗？`
        }
        isPending={deleting}
        onConfirm={() => void submitDelete()}
      />
    </>
  )
}
