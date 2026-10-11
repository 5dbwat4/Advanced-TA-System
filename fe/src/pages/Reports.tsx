import { Alert, Button, ListBox, Select, Spinner } from '@heroui/react'
import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'

import ClipboardCheck from '~icons/lucide/clipboard-check'
import Construction from '~icons/lucide/construction'
import FileText from '~icons/lucide/file-text'
import RefreshCw from '~icons/lucide/refresh-cw'
import School from '~icons/lucide/school'
import { Card, EmptyState } from '@/components/ui/Card'
import { IconAction } from '@/components/ui/IconAction'
import { PageHeader } from '@/components/ui/PageHeader'
import { SkeletonList } from '@/components/ui/SkeletonList'
import {
  fetchClassTables,
  fetchExperimentsWithCurrent,
  fetchXzzdPushPreview,
  type ClassTables,
  type Experiment,
  type ZjuamCourseStudent,
  type ZjuamHomeworkSubmission,
  type ZjuamHomeworkSyncData,
} from '@/lib/api'
import { getErrorMessage } from '@/lib/error'
import { formatBytes, formatDateTime } from '@/lib/format'
import { useCurrentClass } from '@/lib/store'

export default function Reports() {
  const currentClass = useCurrentClass()
  const classId = currentClass?.id ?? null
  const navigate = useNavigate()

  const [experiments, setExperiments] = useState<Experiment[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const [submissions, setSubmissions] = useState<ZjuamHomeworkSyncData | null>(null)
  const [submissionsLoading, setSubmissionsLoading] = useState(false)
  const [submissionsError, setSubmissionsError] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)

  const [classTables, setClassTables] = useState<ClassTables | null>(null)

  useEffect(() => {
    if (!classId) return
    let cancelled = false
    setLoading(true)
    setSelectedId(null)
    fetchExperimentsWithCurrent(classId)
      .then((res) => {
        if (cancelled) return
        setExperiments(res.experiments)
        const current = res.currentMark
          ? res.experiments.find((item) => item.mark === res.currentMark)
          : undefined
        setSelectedId(current?.id ?? null)
      })
      .catch((error) => {
        if (!cancelled) toast.error(getErrorMessage(error, '加载失败'))
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [classId])

  useEffect(() => {
    if (!selectedId) {
      setSubmissions(null)
      setSubmissionsError(null)
      setSubmissionsLoading(false)
      return
    }
    let cancelled = false
    setSubmissionsLoading(true)
    setSubmissionsError(null)
    fetchXzzdPushPreview(selectedId, 'report')
      .then((payload) => {
        if (!cancelled) setSubmissions(payload)
      })
      .catch((error) => {
        if (!cancelled) {
          setSubmissions(null)
          setSubmissionsError(getErrorMessage(error, '获取提交列表失败'))
        }
      })
      .finally(() => {
        if (!cancelled) setSubmissionsLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [selectedId, reloadKey])

  useEffect(() => {
    if (!classId) {
      setClassTables(null)
      return
    }
    let cancelled = false
    fetchClassTables(classId)
      .then((tables) => {
        if (!cancelled) setClassTables(tables)
      })
      .catch((error) => {
        if (!cancelled) {
          setClassTables(null)
          toast.error(getErrorMessage(error, '加载成绩失败'))
        }
      })
    return () => {
      cancelled = true
    }
  }, [classId])

  const studentsById = useMemo(
    () =>
      new Map<number, ZjuamCourseStudent>(
        (submissions?.students ?? []).map((item) => [item.id, item]),
      ),
    [submissions],
  )

  const submittedRows = useMemo(() => {
    const rows = submissions?.submissions ?? []
    return [...rows].sort((a, b) => {
      const noA =
        a.created_by?.id == null ? '' : (studentsById.get(a.created_by.id)?.studentNo ?? '')
      const noB =
        b.created_by?.id == null ? '' : (studentsById.get(b.created_by.id)?.studentNo ?? '')
      return noA.localeCompare(noB)
    })
  }, [submissions, studentsById])

  const reportStats = useMemo(() => {
    if (!submissions) return null

    const submittedPersonIds = new Set<number>()
    for (const row of submissions.submissions) {
      if (row.created_by?.id != null) submittedPersonIds.add(row.created_by.id)
    }
    const submitted = submittedPersonIds.size

    const localStudents = classTables?.students
    const localScores = classTables?.scores
    if (!localStudents || !localScores) {
      return { submitted, graded: null, remaining: null }
    }

    const stuIdByNo = new Map(localStudents.map((student) => [student.studentNo, student.stuId]))
    const gradedStuIds = new Set(
      localScores
        .filter((score) => score.type === 2 && score.indId === selectedId)
        .map((score) => score.stuId),
    )

    let graded = 0
    for (const personId of submittedPersonIds) {
      const studentNo = studentsById.get(personId)?.studentNo
      const stuId = studentNo ? stuIdByNo.get(studentNo) : undefined
      if (stuId && gradedStuIds.has(stuId)) graded += 1
    }

    return { submitted, graded, remaining: submitted - graded }
  }, [submissions, classTables, studentsById, selectedId])

  if (!currentClass) {
    return (
      <div className="mx-auto max-w-6xl">
        <PageHeader title="实验报告" />
        <EmptyState icon={School} title="尚未绑定班级" hint="请先在设置中绑定班级" />
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title="实验报告"
        actions={
          <div className="flex items-center gap-2">
            <Select
              className="w-64"
              aria-label="选择实验"
              placeholder="选择实验"
              isDisabled={loading || experiments.length === 0}
              value={selectedId}
              onChange={(key) => setSelectedId(key == null ? null : String(key))}
            >
              <Select.Trigger>
                <Select.Value />
                <Select.Indicator />
              </Select.Trigger>
              <Select.Popover>
                <ListBox>
                  {experiments.map((experiment) => (
                    <ListBox.Item
                      key={experiment.id}
                      id={experiment.id}
                      textValue={`${experiment.mark} · ${experiment.title}`}
                    >
                      {experiment.mark} · {experiment.title}
                      <ListBox.ItemIndicator />
                    </ListBox.Item>
                  ))}
                </ListBox>
              </Select.Popover>
            </Select>
            {loading && <Spinner size="sm" />}
          </div>
        }
      />

      {experiments.length === 0 ? (
        loading ? null : (
          <EmptyState icon={Construction} title="暂无实验" hint="请先在实验页创建实验" />
        )
      ) : (
        <div className="flex flex-col gap-4">
          <Card index={0}>
            <div className="flex flex-wrap items-center gap-2">
              <ClipboardCheck
                width={16}
                height={16}
                className="shrink-0 text-brand-600 dark:text-brand-300"
              />
              <h2 className="text-sm font-bold">报告批改</h2>
              <Button
                className="ms-auto"
                size="sm"
                isDisabled={!selectedId}
                onPress={() => selectedId && navigate(`/console/reports/${selectedId}`)}
              >
                进入批改
              </Button>
            </div>

            <div className="mt-4 grid grid-cols-3 divide-x divide-line rounded-xl border border-line">
              <ReportStat
                label="已提交"
                value={reportStats?.submitted ?? null}
                valueClass="text-brand-600 dark:text-brand-300"
              />
              <ReportStat
                label="已批改"
                value={reportStats?.graded ?? null}
                valueClass="text-emerald-600 dark:text-emerald-400"
              />
              <ReportStat
                label="剩余"
                value={reportStats?.remaining ?? null}
                valueClass="text-amber-600 dark:text-amber-400"
              />
            </div>
          </Card>

          <Card index={1}>
            <div className="flex flex-wrap items-center gap-2">
              <FileText
                width={16}
                height={16}
                className="shrink-0 text-brand-600 dark:text-brand-300"
              />
              <h2 className="text-sm font-bold">当前实验已提交列表</h2>
              {submissions && (
                <span className="tabular text-[11px] text-fg-subtle">
                  共 {submissions.submissions.length} 条
                </span>
              )}
              <div className="ms-auto flex items-center gap-2">
                <IconAction
                  label="刷新"
                  tooltip="重新获取"
                  placement="bottom"
                  variant="secondary"
                  isDisabled={!selectedId || submissionsLoading}
                  onPress={() => setReloadKey((key) => key + 1)}
                >
                  <RefreshCw width={15} height={15} className="shrink-0" />
                </IconAction>
                {submissionsLoading && <Spinner size="sm" />}
              </div>
            </div>

            <div className="mt-4">
              {!selectedId ? (
                <p className="text-xs text-fg-subtle">请选择实验以查看报告提交情况。</p>
              ) : submissionsError ? (
                <Alert status="danger">
                  <Alert.Indicator />
                  <Alert.Content>
                    <Alert.Description>{submissionsError}</Alert.Description>
                  </Alert.Content>
                </Alert>
              ) : submissionsLoading && !submissions ? (
                <SkeletonList rows={3} className="h-10 rounded-xl" />
              ) : submittedRows.length === 0 ? (
                <p className="text-xs text-fg-subtle">暂无提交记录。</p>
              ) : (
                <SubmissionTable
                  rows={submittedRows}
                  students={studentsById}
                />
              )}
            </div>
          </Card>
        </div>
      )}
    </div>
  )
}

function ReportStat({
  label,
  value,
  valueClass,
}: {
  label: string
  value: number | null
  valueClass: string
}) {
  return (
    <div className="px-4 py-3 text-center">
      <div className="text-[11px] font-semibold text-fg-subtle">{label}</div>
      <div className={`tabular mt-1 text-2xl font-bold ${valueClass}`}>
        {value ?? '—'}
        {value != null && <span className="ms-1 text-xs font-normal text-fg-subtle">人</span>}
      </div>
    </div>
  )
}

function SubmissionTable({
  rows,
  students,
}: {
  rows: ZjuamHomeworkSubmission[]
  students: Map<number, ZjuamCourseStudent>
}) {
  return (
    <div className="overflow-auto rounded-2xl border border-line">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr>
            <th className={`${HEAD_CLASS} text-left`}>学号</th>
            <th className={`${HEAD_CLASS} text-left`}>姓名</th>
            <th className={`${HEAD_CLASS} text-left`}>提交时间</th>
            <th className={`${HEAD_CLASS} text-right`}>附件大小</th>
            <th className={`${HEAD_CLASS} border-r-0 text-left`}>提交 ID</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((item) => {
            const personId = item.created_by?.id ?? null
            const student = personId == null ? undefined : students.get(personId)
            return (
              <tr key={item.id} className="transition-colors hover:bg-sunken/40">
                <td className={`${CELL_CLASS} tabular`}>{student?.studentNo ?? '—'}</td>
                <td className={CELL_CLASS}>{student?.name ?? personId ?? '—'}</td>
                <td className={`${CELL_CLASS} tabular`}>{formatDateTime(item.created_at)}</td>
                <td className={`${CELL_CLASS} tabular text-right`}>
                  {formatBytes(item.attachments_size)}
                </td>
                <td className={`${CELL_CLASS} tabular border-r-0 text-fg-subtle`}>{item.id}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

const HEAD_CLASS = 'sticky top-0 z-10 border-b border-r border-line bg-elevated px-4 py-2 font-semibold'
const CELL_CLASS = 'border-b border-r border-line px-4 py-2'
