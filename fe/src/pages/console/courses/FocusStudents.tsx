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
  TextArea,
  ToggleButton,
  ToggleButtonGroup,
  Tooltip,
  useOverlayState,
  type Key,
} from '@heroui/react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'

import Check from '~icons/lucide/check'
import Download from '~icons/lucide/download'
import FlipHorizontal2 from '~icons/lucide/flip-horizontal-2'
import Import from '~icons/lucide/import'
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
  addFocusStudent,
  deleteFocusStudents,
  fetchClassTables,
  listFocusStudents,
  updateFocusStudent,
  type FocusStudent,
} from '@/lib/api'
import { downloadMarkdown } from '@/lib/download'
import { getErrorMessage } from '@/lib/error'
import { matchStudent } from '@/lib/pinyin'
import { useAsyncData } from '@/lib/request'
import { SCORE_TYPES, scoreKey } from '@/lib/scores'
import { useCurrentClass } from '@/lib/store'
import { cn } from '@/lib/utils'

type ViewTab = 'basic' | 'scores' | 'actions' | 'all'

type StudentOption = { id: string; name: string; studentId: string }

type FocusStatus = {
  label: '正常' | '有挂科风险'
  tooltip: string
  color: 'success' | 'danger'
}

function focusStatus(): FocusStatus {
  // TODO: 挂科风险判定见 TODO.md（未实现）
  return { label: '正常', tooltip: '一切正常', color: 'success' }
}

type DeleteTarget = { kind: 'single'; target: FocusStudent } | { kind: 'bulk' }

type ExportFormat = 'xlsx' | 'markdown'

type ExcelJSModule = typeof import('exceljs')

async function loadExcelJS(): Promise<ExcelJSModule> {
  const mod = (await import('exceljs')) as unknown as { default?: ExcelJSModule } & ExcelJSModule
  return mod.default ?? mod
}

function sanitizeFilename(name: string): string {
  return name.replace(/[\\/:*?"<>|]/g, '_')
}

function markdownCell(value: string): string {
  return value.replace(/\|/g, '\\|').replace(/\r?\n/g, ' ')
}

const TH = 'border-b border-r border-line bg-elevated px-4 py-2'
const TH_LEFT = `${TH} text-left font-semibold`
const TH_CENTER = `${TH} text-center font-semibold`
const TH_SUB = 'border-b border-r border-line bg-elevated px-2 py-2 text-center text-xs font-medium text-fg-muted'

export default function FocusStudents() {
  const currentClass = useCurrentClass()
  const classId = currentClass?.id ?? null

  const [editing, setEditing] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [query, setQuery] = useState('')
  const [studentQuery, setStudentQuery] = useState('')
  const [tab, setTab] = useState<ViewTab>('all')

  const [focusStudents, setFocusStudents] = useState<FocusStudent[]>([])
  const [loading, setLoading] = useState(true)

  const [importText, setImportText] = useState('')
  const [importReason, setImportReason] = useState('')
  const [importSelected, setImportSelected] = useState<Set<string>>(new Set())
  const [importing, setImporting] = useState(false)

  const {
    data: tableData,
    loading: tableLoading,
    error: tableError,
  } = useAsyncData(() => fetchClassTables(classId ?? undefined), [classId])

  const students = useMemo(() => tableData?.students ?? [], [tableData])
  const experiments = useMemo(() => tableData?.experiments ?? [], [tableData])
  const scores = useMemo(
    () =>
      new Map<string, number>(
        (tableData?.scores ?? []).map(
          (item) => [scoreKey(item.userId, item.type, item.indId), item.score] as const,
        ),
      ),
    [tableData],
  )

  useEffect(() => {
    if (tableError) toast.error(tableError)
  }, [tableError])

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
      toast.error(getErrorMessage(error, '加载重点关注学生失败'))
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

  const classExperiments = useMemo(
    () => experiments.filter((experiment) => experiment.classId === classId),
    [experiments, classId],
  )

  const rows = useMemo(
    () =>
      focusStudents.filter((item) =>
        matchStudent(query, item.student ?? { name: '', studentId: '' }),
      ),
    [focusStudents, query],
  )

  const focusIds = useMemo(
    () => new Set(focusStudents.map((item) => item.userId)),
    [focusStudents],
  )

  const candidates = useMemo<StudentOption[]>(() => {
    return classStudents
      .filter((student) => !focusIds.has(student.userId))
      .map((student) => ({
        id: student.userId,
        name: student.name,
        studentId: student.studentId,
      }))
  }, [classStudents, focusIds])

  const visibleCandidates = useMemo(
    () => candidates.filter((item) => matchStudent(studentQuery, item)),
    [candidates, studentQuery],
  )

  const matchImportCandidates = useCallback(
    (text: string): StudentOption[] => {
      const normalizedText = text.replace(/\s+/g, '').toLowerCase()
      if (!normalizedText) return []
      return classStudents
        .filter((student) => !focusIds.has(student.userId))
        .filter((student) =>
          normalizedText.includes(student.name.replace(/\s+/g, '').toLowerCase()),
        )
        .map((student) => ({
          id: student.userId,
          name: student.name,
          studentId: student.studentId,
        }))
    },
    [classStudents, focusIds],
  )

  const importCandidates = useMemo(
    () => matchImportCandidates(importText),
    [matchImportCandidates, importText],
  )

  const handleImportTextChange = (value: string) => {
    setImportText(value)
    setImportSelected(new Set(matchImportCandidates(value).map((item) => item.id)))
  }

  const allImportSelected =
    importCandidates.length > 0 && importCandidates.every((item) => importSelected.has(item.id))
  const someImportSelected = importCandidates.some((item) => importSelected.has(item.id))
  const selectedImportCount = importCandidates.filter((item) =>
    importSelected.has(item.id),
  ).length

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
      toast.error(getErrorMessage(error, '保存失败'))
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
        userId: String(addStuId),
        reason: addReason.trim() || undefined,
      })
      await reload()
      toast.success('已添加重点关注学生')
      addState.close()
    } catch (error) {
      toast.error(getErrorMessage(error, '添加失败'))
    } finally {
      setAdding(false)
    }
  }

  // 一键导入弹窗
  const importState = useOverlayState({
    onOpenChange: (open) => {
      if (open) {
        setImportText('')
        setImportReason('')
        setImportSelected(new Set())
      }
    },
  })

  const toggleImportRow = (id: string, checked: boolean) => {
    setImportSelected((prev) => {
      const next = new Set(prev)
      if (checked) next.add(id)
      else next.delete(id)
      return next
    })
  }

  const toggleImportAll = (checked: boolean) => {
    setImportSelected(checked ? new Set(importCandidates.map((item) => item.id)) : new Set())
  }

  const submitImport = async () => {
    if (!classId) return
    const rows = importCandidates.filter((item) => importSelected.has(item.id))
    if (rows.length === 0) return
    setImporting(true)
    try {
      const results = await Promise.allSettled(
        rows.map((item) =>
          addFocusStudent(classId, {
            userId: item.id,
            reason: importReason.trim() || undefined,
          }),
        ),
      )
      const successCount = results.filter((result) => result.status === 'fulfilled').length
      const failedCount = results.length - successCount
      await reload()
      if (successCount > 0) {
        toast.success(
          failedCount > 0
            ? `已导入 ${successCount} 名学生，${failedCount} 名导入失败`
            : `已导入 ${successCount} 名学生`,
        )
      } else {
        toast.error('导入失败')
      }
      if (failedCount === 0) importState.close()
    } catch (error) {
      toast.error(getErrorMessage(error, '导入失败'))
    } finally {
      setImporting(false)
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
      toast.error(getErrorMessage(error, '删除失败'))
    } finally {
      setDeleting(false)
    }
  }

  const hasScoreCols = tab === 'scores' || tab === 'all'
  const hasActions = tab === 'actions' || tab === 'all'
  const constantRowSpan = hasScoreCols ? 2 : 1

  // 导出弹窗
  const exportState = useOverlayState({
    onOpenChange: (open) => {
      if (open) setExportFormat('xlsx')
    },
  })
  const [exportFormat, setExportFormat] = useState<ExportFormat>('xlsx')
  const [exporting, setExporting] = useState(false)

  const exportColumns = useMemo(() => {
    const columns = ['姓名', '学号', '重点关注原因', '当前状态']
    if (hasScoreCols) {
      for (const experiment of classExperiments) {
        for (const type of SCORE_TYPES) {
          columns.push(`${experiment.mark} · ${experiment.title} ${type.label}`)
        }
      }
    }
    return columns
  }, [hasScoreCols, classExperiments])

  const exportRows = useMemo(() => {
    return rows.map((item) => {
      const status = focusStatus()
      const base = [
        item.student?.name ?? '',
        item.student?.studentId ?? '',
        item.reason ?? '',
        status.label,
      ]
      if (!hasScoreCols) return base
      const scoreCells = classExperiments.flatMap((experiment) =>
        SCORE_TYPES.map((type) => {
          const value = scores.get(scoreKey(item.userId, type.value, experiment.id))
          return value == null ? '' : String(value)
        }),
      )
      return [...base, ...scoreCells]
    })
  }, [rows, hasScoreCols, classExperiments, scores])

  const exportBaseName = `${sanitizeFilename(currentClass?.name ?? '课程')}-重点关注学生`

  const buildMarkdown = () => {
    const header = `| ${exportColumns.map(markdownCell).join(' | ')} |`
    const separator = `| ${exportColumns.map(() => '---').join(' | ')} |`
    const body = exportRows.map(
      (row) => `| ${row.map((cell) => markdownCell(cell)).join(' | ')} |`,
    )
    const lines = [...body]
    if (lines.length === 0) lines.push(`| ${exportColumns.map(() => '—').join(' | ')} |`)
    return [
      `# ${currentClass?.name ?? '课程'} · 重点关注学生名单`,
      '',
      header,
      separator,
      ...lines,
      '',
    ].join('\n')
  }

  const exportXlsx = async () => {
    const ExcelJS = await loadExcelJS()
    const workbook = new ExcelJS.Workbook()
    const sheet = workbook.addWorksheet('重点关注学生')
    const header = sheet.addRow(exportColumns)
    header.font = { bold: true }
    for (const row of exportRows) sheet.addRow(row)
    exportColumns.forEach((name, index) => {
      const contentWidth = Math.max(
        ...exportRows.map((row) => [...(row[index] ?? '')].length),
        [...name].length,
      )
      sheet.getColumn(index + 1).width = Math.min(Math.max(contentWidth + 4, 12), 48)
    })

    const buffer = await workbook.xlsx.writeBuffer()
    const blob = new Blob([buffer], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `${exportBaseName}.xlsx`
    link.click()
    URL.revokeObjectURL(url)
  }

  const runExport = async () => {
    if (exportRows.length === 0) {
      toast.error('暂无可导出的重点关注学生')
      return
    }
    setExporting(true)
    try {
      if (exportFormat === 'markdown') {
        downloadMarkdown(`${exportBaseName}.md`, buildMarkdown())
      } else {
        await exportXlsx()
      }
      toast.success(exportFormat === 'xlsx' ? '已导出为 xlsx' : '已导出为 Markdown')
      exportState.close()
    } catch (error) {
      toast.error(getErrorMessage(error, '导出失败'))
    } finally {
      setExporting(false)
    }
  }

  const searchBox = (
    <SearchInput
      value={query}
      onChange={setQuery}
      placeholder="搜索"
      ariaLabel="搜索重点关注学生"
      className="min-w-[12rem] flex-1"
    />
  )

  return (
    <>
      <div className="mx-auto max-w-6xl">
        <BackLink to="/console/courses/settings">返回课程设置</BackLink>

        <PageHeader title="“重点关注学生”名单" />

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
                  <IconAction
                    label="一键导入"
                    variant="ghost"
                    onPress={importState.open}
                  >
                    <Import width={15} height={15} className="shrink-0" />
                  </IconAction>
                  <Button size="sm" variant="secondary" onPress={exportState.open}>
                    <Download width={15} height={15} className="shrink-0" />
                    导出
                  </Button>
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
                <div className="p-4">
                  <SkeletonList rows={4} className="h-10 rounded-xl" />
                </div>
              ) : rows.length === 0 ? (
                <div className="py-10 text-center text-sm text-fg-subtle">
                  {focusStudents.length === 0 ? '暂无重点关注学生' : '未找到匹配的学生'}
                </div>
              ) : (
                <table className="w-full table-fixed border-separate border-spacing-0 text-sm">
                  <colgroup>
                    {editing && <col className="w-12" />}
                    <col className="w-40" />
                    <col className="w-36" />
                    <col className="w-72" />
                    <col className="w-32" />
                    {hasScoreCols &&
                      classExperiments.flatMap((experiment) =>
                        SCORE_TYPES.map((type) => (
                          <col key={`${experiment.id}:${type.value}`} className="w-20" />
                        )),
                      )}
                    {hasActions && <col className="w-40" />}
                    <col />
                  </colgroup>
                  <thead className="sticky top-0 z-20">
                    <tr>
                      {editing && (
                        <th className={`sticky left-0 z-30 ${TH_LEFT}`}>
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
                        className={`sticky ${editing ? 'left-12' : 'left-0'} z-30 ${TH_LEFT}`}
                      >
                        姓名
                      </th>
                      <th rowSpan={constantRowSpan} className={TH_LEFT}>
                        学号
                      </th>
                      <th rowSpan={constantRowSpan} className={TH_LEFT}>
                        重点关注原因
                      </th>
                      <th rowSpan={constantRowSpan} className={TH_LEFT}>
                        当前状态
                      </th>
                      {hasScoreCols &&
                        classExperiments.map((experiment) => (
                          <th
                            key={experiment.id}
                            colSpan={SCORE_TYPES.length}
                            className={TH_CENTER}
                          >
                            {experiment.mark} · {experiment.title}
                          </th>
                        ))}
                      {hasActions && (
                        <th rowSpan={constantRowSpan} className={TH_LEFT}>
                          操作
                        </th>
                      )}
                      <th rowSpan={constantRowSpan} aria-hidden className={TH} />
                    </tr>
                    {hasScoreCols && (
                      <tr>
                        {editing && <th className={`sticky left-0 z-30 ${TH}`} />}
                        {classExperiments.flatMap((experiment) =>
                          SCORE_TYPES.map((type) => (
                            <th
                              key={`${experiment.id}:${type.value}`}
                              className={TH_SUB}
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
                      const studentId = item.student?.studentId ?? ''
                       const status = focusStatus()
                      return (
                        <tr key={item.id} className="transition-colors hover:bg-sunken/40">
                          {editing && (
                            <td className="sticky left-0 z-10 border-b border-r border-line bg-elevated px-4 py-2">
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
                          <td
                            className={cn(
                              'sticky z-10 border-b border-r border-line bg-elevated px-4 py-2',
                              editing ? 'left-12' : 'left-0',
                            )}
                          >
                            <Link
                              to={`/console/scores/students/${item.userId}`}
                              className="block font-bold transition-colors hover:text-brand-600 dark:hover:text-brand-300"
                              title="查看学生详情"
                            >
                              {name}
                            </Link>
                          </td>
                          <td className="tabular border-b border-r border-line px-4 py-2 text-fg-muted">
                            {studentId || '—'}
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
                                  scoreKey(item.userId, type.value, experiment.id),
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
                          <td aria-hidden className="border-b border-line" />
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
                <PendingButton
                  variant="primary"
                  icon={Pen}
                  pendingLabel="保存中"
                  isDisabled={!reasonTarget}
                  isPending={savingReason}
                  onPress={() => void saveReason()}
                >
                  保存
                </PendingButton>
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
                    <Autocomplete.Filter
                      inputValue={studentQuery}
                      onInputChange={setStudentQuery}
                    >
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

      <Modal state={importState}>
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
                    value={importText}
                    onChange={(event) => handleImportTextChange(event.target.value)}
                    placeholder="粘贴包含重点关注学生姓名的文案"
                    aria-label="上游文案"
                  />
                </div>

                <div className="flex flex-col gap-2">
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-xs font-semibold text-fg-muted">
                      选出重点关注对象学生
                    </div>
                    {importCandidates.length > 0 && (
                      <span className="tabular text-[11px] text-fg-subtle">
                        已选 {selectedImportCount} / {importCandidates.length}
                      </span>
                    )}
                  </div>

                  {!importText.trim() ? (
                    <div className="rounded-xl border border-dashed border-line px-4 py-6 text-center text-xs text-fg-subtle">
                      粘贴文案后，将自动按姓名匹配本班学生
                    </div>
                  ) : importCandidates.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-line px-4 py-6 text-center text-xs text-fg-subtle">
                      未匹配到本班学生（已在名单中的学生不会重复显示）
                    </div>
                  ) : (
                    <div className="max-h-56 overflow-auto rounded-xl border border-line">
                      <div className="sticky top-0 z-10 flex items-center gap-3 border-b border-line bg-elevated px-4 py-2">
                        <Checkbox
                          aria-label="全选匹配学生"
                          isSelected={allImportSelected}
                          isIndeterminate={someImportSelected && !allImportSelected}
                          onChange={toggleImportAll}
                        >
                          <Checkbox.Content>
                            <Checkbox.Control>
                              <Checkbox.Indicator />
                            </Checkbox.Control>
                          </Checkbox.Content>
                        </Checkbox>
                        <span className="text-xs font-semibold text-fg-muted">全选</span>
                      </div>
                      {importCandidates.map((item) => (
                        <div
                          key={item.id}
                          className="flex items-center gap-3 border-b border-line px-4 py-2 last:border-b-0 hover:bg-sunken/40"
                        >
                          <Checkbox
                            aria-label={`选择 ${item.name}`}
                            isSelected={importSelected.has(item.id)}
                            onChange={(checked) => toggleImportRow(item.id, checked)}
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
                    value={importReason}
                    onChange={(event) => setImportReason(event.target.value)}
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
                  isDisabled={selectedImportCount === 0}
                  isPending={importing}
                  onPress={() => void submitImport()}
                >
                  保存
                </PendingButton>
              </Modal.Footer>
            </Modal.Dialog>
          </Modal.Container>
        </Modal.Backdrop>
      </Modal>

      <Modal state={exportState}>
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
                    selectedKeys={new Set([exportFormat])}
                    onSelectionChange={(keys) => {
                      const first = keys.values().next().value
                      if (first != null) setExportFormat(String(first) as ExportFormat)
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

      <ConfirmDialog
        state={confirmState}
        title={confirm?.kind === 'single' ? '移除重点关注学生' : '移除所选学生'}
        description={
          confirm?.kind === 'single'
            ? `确定将 ${confirm.target.student?.name ?? '该学生'} 从重点关注名单中移除吗？`
            : `确定将选中的 ${selected.size} 名学生从重点关注名单中移除吗？`
        }
        isPending={deleting}
        onConfirm={() => void submitDelete()}
      />
    </>
  )
}
