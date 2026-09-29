import {
  Autocomplete,
  Button,
  Checkbox,
  Chip,
  EmptyState as HeroEmptyState,
  Input,
  Label,
  ListBox,
  Modal,
  SearchField,
  Skeleton,
  Spinner,
  ToggleButton,
  ToggleButtonGroup,
  Tooltip,
  useFilter,
  useOverlayState,
  type Key,
} from '@heroui/react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'

import ArrowLeft from '~icons/lucide/arrow-left'
import Check from '~icons/lucide/check'
import FlipHorizontal2 from '~icons/lucide/flip-horizontal-2'
import Import from '~icons/lucide/import'
import Pen from '~icons/lucide/pen'
import Plus from '~icons/lucide/plus'
import School from '~icons/lucide/school'
import Search from '~icons/lucide/search'
import SquareCheckBig from '~icons/lucide/square-check-big'
import Trash2 from '~icons/lucide/trash-2'
import { EmptyState } from '@/components/ui/Card'
import { PageHeader } from '@/components/ui/PageHeader'
import {
  addFocusStudent,
  apiFetch,
  deleteFocusStudents,
  listFocusStudents,
  updateFocusStudent,
  type Experiment,
  type FocusStudent,
  type Score,
  type Student,
} from '@/lib/api'
import { matchStudent } from '@/lib/pinyin'
import { SCORE_TYPES, scoreKey } from '@/lib/scores'
import { useCurrentClass } from '@/lib/store'
import { cn } from '@/lib/utils'

type ViewTab = 'basic' | 'scores' | 'actions' | 'all'

type StudentOption = { id: string; textValue: string }

type FocusStatus = {
  label: '正常' | '有挂科风险'
  tooltip: string
  color: 'success' | 'danger'
}

function focusStatus(stuId: string): FocusStatus {
  // TODO: 挂科风险判定见 TODO.md（未实现）
  // 当前临时实现：一律视为正常，stuId 预留给后续风险判定
  void stuId
  return { label: '正常', tooltip: '一切正常', color: 'success' }
}

type TableData = {
  students: Student[]
  experiments: Experiment[]
  scores: Score[]
}

async function fetchTableData(): Promise<TableData> {
  const [studentRes, experimentRes, scoreRes] = await Promise.all([
    apiFetch<{ students: Student[] }>('/api/students'),
    apiFetch<{ experiments: Experiment[] }>('/api/experiments'),
    apiFetch<{ scores: Score[] }>('/api/scores'),
  ])
  return {
    students: studentRes.students,
    experiments: experimentRes.experiments,
    scores: scoreRes.scores,
  }
}

type DeleteTarget = { kind: 'single'; target: FocusStudent } | { kind: 'bulk' }

export default function FocusStudents() {
  const currentClass = useCurrentClass()
  const classId = currentClass?.id ?? null

  const { contains } = useFilter({ sensitivity: 'base' })

  const [editing, setEditing] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [query, setQuery] = useState('')
  const [tab, setTab] = useState<ViewTab>('all')

  const [focusStudents, setFocusStudents] = useState<FocusStudent[]>([])
  const [loading, setLoading] = useState(true)

  const [students, setStudents] = useState<Student[]>([])
  const [experiments, setExperiments] = useState<Experiment[]>([])
  const [scores, setScores] = useState<Map<string, number>>(new Map())
  const [tableLoading, setTableLoading] = useState(true)

  const reload = useCallback(async () => {
    if (!classId) {
      setFocusStudents([])
      return
    }
    setLoading(true)
    try {
      const data = await listFocusStudents(classId)
      setFocusStudents(data.focusStudents)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '加载重点关注学生失败')
    } finally {
      setLoading(false)
    }
  }, [classId])

  useEffect(() => {
    void reload()
  }, [reload])

  // 表格数据只拉取一次，按当前班级在客户端过滤
  useEffect(() => {
    let cancelled = false
    setTableLoading(true)
    fetchTableData()
      .then((data) => {
        if (cancelled) return
        setStudents(data.students)
        setExperiments(data.experiments)
        setScores(
          new Map(
            data.scores.map((score) => [
              scoreKey(score.stuId, score.type, score.indId),
              score.score,
            ]),
          ),
        )
      })
      .catch((error) => {
        if (!cancelled) toast.error(error instanceof Error ? error.message : '加载数据失败')
      })
      .finally(() => {
        if (!cancelled) setTableLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  const classStudents = useMemo(
    () => students.filter((student) => student.classId === classId),
    [students, classId],
  )

  const classExperiments = useMemo(
    () => experiments.filter((experiment) => experiment.classId === classId),
    [experiments, classId],
  )

  const rows = useMemo(
    () =>
      focusStudents.filter((item) =>
        matchStudent(query, item.student ?? { name: '', studentNo: '' }),
      ),
    [focusStudents, query],
  )

  const candidates = useMemo<StudentOption[]>(() => {
    const focusIds = new Set(focusStudents.map((item) => item.stuId))
    return classStudents
      .filter((student) => !focusIds.has(student.stuId))
      .map((student) => ({
        id: student.stuId,
        textValue: `${student.name} ${student.studentNo}`,
      }))
  }, [classStudents, focusStudents])

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

  // 修改原因弹窗
  const reasonState = useOverlayState({
    onOpenChange: (open) => {
      if (!open) setReasonTarget(null)
    },
  })
  const [reasonTarget, setReasonTarget] = useState<FocusStudent | null>(null)
  const [reasonDraft, setReasonDraft] = useState('')
  const [savingReason, setSavingReason] = useState(false)

  const openReasonModal = (target: FocusStudent) => {
    setReasonTarget(target)
    setReasonDraft(target.reason)
    reasonState.open()
  }

  const saveReason = async () => {
    if (!classId || !reasonTarget) return
    setSavingReason(true)
    try {
      await updateFocusStudent(classId, reasonTarget.id, reasonDraft.trim())
      await reload()
      toast.success('已保存')
      reasonState.close()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '保存失败')
    } finally {
      setSavingReason(false)
    }
  }

  // 添加学生弹窗
  const addState = useOverlayState({
    onOpenChange: (open) => {
      if (open) {
        setAddStuId(null)
        setAddReason('')
      }
    },
  })
  const [addStuId, setAddStuId] = useState<Key | null>(null)
  const [addReason, setAddReason] = useState('')
  const [adding, setAdding] = useState(false)

  const submitAdd = async () => {
    if (!classId || addStuId == null) return
    setAdding(true)
    try {
      await addFocusStudent(classId, {
        stuId: String(addStuId),
        reason: addReason.trim() || undefined,
      })
      await reload()
      toast.success('已添加重点关注学生')
      addState.close()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '添加失败')
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

  const openDeleteSingle = (target: FocusStudent) => {
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
      await deleteFocusStudents(classId, ids)
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
      toast.error(error instanceof Error ? error.message : '删除失败')
    } finally {
      setDeleting(false)
    }
  }

  const hasScoreCols = tab === 'scores' || tab === 'all'
  const hasActions = tab === 'actions' || tab === 'all'
  const constantRowSpan = hasScoreCols ? 2 : 1

  const searchBox = (
    <div className="relative min-w-[12rem] flex-1">
      <Search
        width={15}
        height={15}
        className="pointer-events-none absolute left-3.5 top-1/2 shrink-0 -translate-y-1/2 text-fg-subtle"
      />
      <Input
        fullWidth
        className="pl-10"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="搜索姓名 / 学号 / 拼音"
        aria-label="搜索重点关注学生"
      />
    </div>
  )

  return (
    <>
      <div className="mx-auto max-w-6xl">
        <Link
          to="/console/courses/settings"
          className="mb-3 inline-flex items-center gap-1 text-xs font-semibold text-fg-subtle transition-colors hover:text-fg-muted"
        >
          <ArrowLeft width={14} height={14} className="shrink-0" />
          返回课程设置
        </Link>

        <PageHeader title="“重点关注学生”名单" />

        {!classId ? (
          <EmptyState icon={School} title="未选择课程" hint="请先在右上角选择或绑定一个课程" />
        ) : (
          <>
            <div className="mb-4 flex flex-wrap items-center gap-2">
              {editing ? (
                <>
                  <Tooltip delay={0}>
                    <Tooltip.Trigger className="inline-flex">
                      <Button
                        size="sm"
                        isIconOnly
                        variant="secondary"
                        aria-label="完成"
                        onPress={() => {
                          setEditing(false)
                          setSelected(new Set())
                        }}
                      >
                        <Check width={15} height={15} className="shrink-0" />
                      </Button>
                    </Tooltip.Trigger>
                    <Tooltip.Content>完成</Tooltip.Content>
                  </Tooltip>
                  {searchBox}
                  <div className="ms-auto flex flex-wrap items-center gap-2">
                    <Tooltip delay={0}>
                      <Tooltip.Trigger className="inline-flex">
                        <Button
                          size="sm"
                          isIconOnly
                          variant="danger-soft"
                          aria-label="删除所选"
                          isDisabled={selected.size === 0}
                          onPress={openDeleteBulk}
                        >
                          <Trash2 width={15} height={15} className="shrink-0" />
                        </Button>
                      </Tooltip.Trigger>
                      <Tooltip.Content>删除所选</Tooltip.Content>
                    </Tooltip>
                    <Tooltip delay={0}>
                      <Tooltip.Trigger className="inline-flex">
                        <Button
                          size="sm"
                          isIconOnly
                          variant="secondary"
                          aria-label="反选"
                          onPress={invertSelection}
                        >
                          <FlipHorizontal2 width={15} height={15} className="shrink-0" />
                        </Button>
                      </Tooltip.Trigger>
                      <Tooltip.Content>反选</Tooltip.Content>
                    </Tooltip>
                    <Tooltip delay={0}>
                      <Tooltip.Trigger className="inline-flex">
                        <Button
                          size="sm"
                          isIconOnly
                          variant="secondary"
                          aria-label="全选"
                          onPress={selectAll}
                        >
                          <SquareCheckBig width={15} height={15} className="shrink-0" />
                        </Button>
                      </Tooltip.Trigger>
                      <Tooltip.Content>全选</Tooltip.Content>
                    </Tooltip>
                    <span className="tabular text-xs font-semibold text-fg-muted">
                      当前已选中（{selected.size}）
                    </span>
                  </div>
                </>
              ) : (
                <>
                  <Tooltip delay={0}>
                    <Tooltip.Trigger className="inline-flex">
                      <Button
                        size="sm"
                        isIconOnly
                        variant="secondary"
                        aria-label="编辑"
                        onPress={() => {
                          setEditing(true)
                          setSelected(new Set())
                        }}
                      >
                        <Pen width={15} height={15} className="shrink-0" />
                      </Button>
                    </Tooltip.Trigger>
                    <Tooltip.Content>编辑</Tooltip.Content>
                  </Tooltip>
                  {searchBox}
                  <Tooltip delay={0}>
                    <Tooltip.Trigger className="inline-flex">
                      <Button
                        size="sm"
                        isIconOnly
                        variant="ghost"
                        aria-label="一键导入"
                        onPress={() => toast('一键导入功能开发中')}
                      >
                        <Import width={15} height={15} className="shrink-0" />
                      </Button>
                    </Tooltip.Trigger>
                    <Tooltip.Content>一键导入（开发中）</Tooltip.Content>
                  </Tooltip>
                  <Button size="sm" variant="primary" onPress={addState.open}>
                    <Plus width={15} height={15} className="shrink-0" />
                    添加
                  </Button>
                  <div className="ms-auto flex items-center gap-2">
                    <span className="text-xs font-semibold text-fg-muted">查看</span>
                    <ToggleButtonGroup
                      selectionMode="single"
                      disallowEmptySelection
                      size="sm"
                      selectedKeys={new Set([tab])}
                      onSelectionChange={(keys) => {
                        const first = keys.values().next().value
                        if (first != null) setTab(String(first) as ViewTab)
                      }}
                    >
                      <ToggleButton id="basic">基本信息</ToggleButton>
                      <ToggleButton id="scores">
                        <ToggleButtonGroup.Separator />
                        成绩情况
                      </ToggleButton>
                      <ToggleButton id="actions">
                        <ToggleButtonGroup.Separator />
                        操作
                      </ToggleButton>
                      <ToggleButton id="all">
                        <ToggleButtonGroup.Separator />
                        全部
                      </ToggleButton>
                    </ToggleButtonGroup>
                  </div>
                </>
              )}
            </div>

            <div className="max-h-[65vh] overflow-auto rounded-2xl border border-line bg-elevated">
              {loading || tableLoading ? (
                <div className="flex flex-col gap-2 p-4">
                  {Array.from({ length: 4 }).map((_, i) => (
                    <Skeleton key={i} className="h-10 rounded-xl" />
                  ))}
                </div>
              ) : rows.length === 0 ? (
                <div className="py-10 text-center text-sm text-fg-subtle">
                  {focusStudents.length === 0 ? '暂无重点关注学生' : '未找到匹配的学生'}
                </div>
              ) : (
                <table className="w-full border-separate border-spacing-0 text-sm">
                  <thead className="sticky top-0 z-20">
                    <tr>
                      {editing && (
                        <th className="border-b border-r border-line bg-elevated px-4 py-2 text-left font-semibold">
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
                      <th
                        rowSpan={constantRowSpan}
                        className="sticky left-0 z-30 border-b border-r border-line bg-elevated px-4 py-2 text-left font-semibold"
                      >
                        姓名
                      </th>
                      <th
                        rowSpan={constantRowSpan}
                        className="border-b border-r border-line bg-elevated px-4 py-2 text-left font-semibold"
                      >
                        学号
                      </th>
                      <th
                        rowSpan={constantRowSpan}
                        className="border-b border-r border-line bg-elevated px-4 py-2 text-left font-semibold"
                      >
                        重点关注原因
                      </th>
                      <th
                        rowSpan={constantRowSpan}
                        className="border-b border-r border-line bg-elevated px-4 py-2 text-left font-semibold"
                      >
                        当前状态
                      </th>
                      {hasScoreCols &&
                        classExperiments.map((experiment) => (
                          <th
                            key={experiment.id}
                            colSpan={SCORE_TYPES.length}
                            className="border-b border-r border-line bg-elevated px-4 py-2 text-center font-semibold"
                          >
                            {experiment.mark} · {experiment.title}
                          </th>
                        ))}
                      {hasActions && (
                        <th
                          rowSpan={constantRowSpan}
                          className="border-b border-r border-line bg-elevated px-4 py-2 text-left font-semibold"
                        >
                          操作
                        </th>
                      )}
                    </tr>
                    {hasScoreCols && (
                      <tr>
                        {editing && (
                          <th className="border-b border-r border-line bg-elevated px-4 py-2" />
                        )}
                        {classExperiments.flatMap((experiment) =>
                          SCORE_TYPES.map((type) => (
                            <th
                              key={`${experiment.id}:${type.value}`}
                              className="border-b border-r border-line bg-elevated px-2 py-2 text-center text-xs font-medium text-fg-muted"
                            >
                              {type.label}
                            </th>
                          )),
                        )}
                      </tr>
                    )}
                  </thead>
                  <tbody>
                    {rows.map((item) => {
                      const name = item.student?.name ?? '—'
                      const studentNo = item.student?.studentNo ?? ''
                      const status = focusStatus(item.stuId)
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
                            {item.reason ? (
                              <div
                                className="max-w-[16rem] truncate text-fg-muted"
                                title={item.reason}
                              >
                                {item.reason}
                              </div>
                            ) : (
                              <span className="text-fg-subtle">—</span>
                            )}
                          </td>
                          <td className="border-b border-r border-line px-4 py-2">
                            <Tooltip delay={0}>
                              <Tooltip.Trigger className="inline-flex">
                                <Chip size="sm" variant="soft" color={status.color}>
                                  {status.label}
                                </Chip>
                              </Tooltip.Trigger>
                              <Tooltip.Content showArrow>{status.tooltip}</Tooltip.Content>
                            </Tooltip>
                          </td>
                          {hasScoreCols &&
                            classExperiments.flatMap((experiment) =>
                              SCORE_TYPES.map((type) => {
                                const value = scores.get(
                                  scoreKey(item.stuId, type.value, experiment.id),
                                )
                                return (
                                  <td
                                    key={`${experiment.id}:${type.value}`}
                                    className="border-b border-r border-line px-2 py-1.5 text-center"
                                  >
                                    <span
                                      className={cn(
                                        'tabular',
                                        value == null && 'text-fg-subtle',
                                      )}
                                    >
                                      {value ?? '—'}
                                    </span>
                                  </td>
                                )
                              }),
                            )}
                          {hasActions && (
                            <td className="border-b border-r border-line px-2 py-1.5">
                              <div className="flex items-center gap-1">
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onPress={() => openReasonModal(item)}
                                >
                                  修改
                                </Button>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="text-danger"
                                  onPress={() => openDeleteSingle(item)}
                                >
                                  删除
                                </Button>
                              </div>
                            </td>
                          )}
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

      <Modal state={reasonState}>
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
                    value={reasonDraft}
                    onChange={(event) => setReasonDraft(event.target.value)}
                    placeholder="如：Lab1 未通过，需重点跟进"
                    aria-label="重点关注原因"
                  />
                </div>
              </Modal.Body>
              <Modal.Footer>
                <Button slot="close" variant="secondary">
                  取消
                </Button>
                <Button
                  variant="primary"
                  isDisabled={!reasonTarget}
                  isPending={savingReason}
                  onPress={() => void saveReason()}
                >
                  {({ isPending }) => (
                    <>
                      {isPending && <Spinner color="current" size="sm" />}
                      保存
                    </>
                  )}
                </Button>
              </Modal.Footer>
            </Modal.Dialog>
          </Modal.Container>
        </Modal.Backdrop>
      </Modal>

      <Modal state={addState}>
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

                <div className="flex flex-col gap-1.5">
                  <div className="text-xs font-semibold text-fg-muted">重点关注原因</div>
                  <Input
                    fullWidth
                    maxLength={200}
                    value={addReason}
                    onChange={(event) => setAddReason(event.target.value)}
                    placeholder="如：Lab1 未通过，需重点跟进"
                    aria-label="重点关注原因"
                  />
                </div>
              </Modal.Body>
              <Modal.Footer>
                <Button slot="close" variant="secondary">
                  取消
                </Button>
                <Button
                  variant="primary"
                  isDisabled={addStuId == null}
                  isPending={adding}
                  onPress={() => void submitAdd()}
                >
                  {({ isPending }) => (
                    <>
                      {isPending && <Spinner color="current" size="sm" />}
                      添加
                    </>
                  )}
                </Button>
              </Modal.Footer>
            </Modal.Dialog>
          </Modal.Container>
        </Modal.Backdrop>
      </Modal>

      <Modal state={confirmState}>
        <Modal.Backdrop>
          <Modal.Container>
            <Modal.Dialog className="sm:max-w-md">
              <Modal.CloseTrigger />
              <Modal.Header>
                <Modal.Icon className="bg-danger/10 text-danger">
                  <Trash2 width={18} height={18} className="shrink-0" />
                </Modal.Icon>
                <Modal.Heading>
                  {confirm?.kind === 'single' ? '移除重点关注学生' : '移除所选学生'}
                </Modal.Heading>
              </Modal.Header>
              <Modal.Body>
                <p className="text-sm text-fg-muted">
                  {confirm?.kind === 'single'
                    ? `确定将 ${confirm.target.student?.name ?? '该学生'} 从重点关注名单中移除吗？`
                    : `确定将选中的 ${selected.size} 名学生从重点关注名单中移除吗？`}
                </p>
              </Modal.Body>
              <Modal.Footer>
                <Button slot="close" variant="secondary">
                  取消
                </Button>
                <Button
                  variant="danger"
                  isDisabled={!confirm}
                  isPending={deleting}
                  onPress={() => void submitDelete()}
                >
                  {({ isPending }) => (
                    <>
                      {isPending && <Spinner color="current" size="sm" />}
                      删除
                    </>
                  )}
                </Button>
              </Modal.Footer>
            </Modal.Dialog>
          </Modal.Container>
        </Modal.Backdrop>
      </Modal>
    </>
  )
}
