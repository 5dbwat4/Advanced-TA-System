import { useOverlayState } from '@heroui/react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import School from '~icons/lucide/school'

import { FocusAddModal } from '@/components/focus-students/FocusAddModal'
import { FocusExportModal } from '@/components/focus-students/FocusExportModal'
import { FocusImportModal } from '@/components/focus-students/FocusImportModal'
import { FocusReasonModal } from '@/components/focus-students/FocusReasonModal'
import { FocusStudentsTable } from '@/components/focus-students/FocusStudentsTable'
import { FocusStudentsToolbar } from '@/components/focus-students/FocusStudentsToolbar'
import type {
  FocusStudentOption,
  FocusStudentsViewTab,
} from '@/components/focus-students/types'
import { BackLink } from '@/components/ui/BackLink'
import { EmptyState } from '@/components/ui/Card'
import { PageHeader } from '@/components/ui/PageHeader'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import {
  deleteFocusStudents,
  fetchClassTables,
  listFocusStudents,
  type FocusStudent,
} from '@/lib/api'
import { getErrorMessage } from '@/lib/error'
import { buildFocusStudentsExportData } from '@/lib/focus-students-export'
import { matchStudent } from '@/lib/pinyin'
import { useAsyncData } from '@/lib/request'
import { scoreKey } from '@/lib/scores'
import { useCurrentClass } from '@/lib/store'

type DeleteTarget = { kind: 'single'; target: FocusStudent } | { kind: 'bulk' }

export default function FocusStudents() {
  const currentClass = useCurrentClass()
  const classId = currentClass?.id ?? null

  const [editing, setEditing] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [query, setQuery] = useState('')
  const [tab, setTab] = useState<FocusStudentsViewTab>('all')

  const [focusStudents, setFocusStudents] = useState<FocusStudent[]>([])
  const [loading, setLoading] = useState(true)

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

  const candidates = useMemo<FocusStudentOption[]>(
    () =>
      classStudents
        .filter((student) => !focusIds.has(student.userId))
        .map((student) => ({
          id: student.userId,
          name: student.name,
          studentId: student.studentId,
        })),
    [classStudents, focusIds],
  )

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

  const reasonState = useOverlayState({
    onOpenChange: (open) => {
      if (!open) setReasonTarget(null)
    },
  })
  const [reasonTarget, setReasonTarget] = useState<FocusStudent | null>(null)

  const openReasonModal = (target: FocusStudent) => {
    setReasonTarget(target)
    reasonState.open()
  }

  const addState = useOverlayState()
  const importState = useOverlayState()
  const exportState = useOverlayState()

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
    if (selected.size === 0) return
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

  const exportData = useMemo(
    () =>
      buildFocusStudentsExportData({
        className: currentClass?.name ?? '课程',
        hasScoreCols: tab === 'scores' || tab === 'all',
        experiments: classExperiments,
        scores,
        students: rows,
      }),
    [currentClass?.name, tab, classExperiments, scores, rows],
  )

  const toggleEditing = () => {
    setEditing((prev) => !prev)
    setSelected(new Set())
  }

  return (
    <>
      <div className="mx-auto max-w-6xl">
        <BackLink to="/console/courses/settings">返回课程设置</BackLink>

        <PageHeader title="“重点关注学生”名单" />

        {!classId ? (
          <EmptyState icon={School} title="未选择课程" hint="请先在右上角选择或绑定一个课程" />
        ) : (
          <>
            <FocusStudentsToolbar
              editing={editing}
              selectedCount={selected.size}
              query={query}
              tab={tab}
              onQueryChange={setQuery}
              onTabChange={setTab}
              onToggleEditing={toggleEditing}
              onSelectAll={selectAll}
              onInvertSelection={invertSelection}
              onDeleteSelected={openDeleteBulk}
              onImport={importState.open}
              onExport={exportState.open}
              onAdd={addState.open}
            />

            <FocusStudentsTable
              loading={loading}
              tableLoading={tableLoading}
              focusStudentsCount={focusStudents.length}
              rows={rows}
              editing={editing}
              selected={selected}
              tab={tab}
              experiments={classExperiments}
              scores={scores}
              onToggleRow={toggleRow}
              onToggleAll={toggleAll}
              onEditReason={openReasonModal}
              onDelete={openDeleteSingle}
            />
          </>
        )}
      </div>

      {classId && (
        <>
          <FocusReasonModal
            state={reasonState}
            classId={classId}
            target={reasonTarget}
            onSaved={reload}
          />
          <FocusAddModal
            state={addState}
            classId={classId}
            candidates={candidates}
            onSaved={reload}
          />
          <FocusImportModal
            state={importState}
            classId={classId}
            candidates={candidates}
            onSaved={reload}
          />
          <FocusExportModal state={exportState} data={exportData} />
        </>
      )}

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
