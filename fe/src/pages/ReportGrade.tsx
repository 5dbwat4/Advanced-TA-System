import { Alert, Spinner } from '@heroui/react'
import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Group, Panel, Separator, useDefaultLayout } from 'react-resizable-panels'

import ArrowLeft from '~icons/lucide/arrow-left'
import { FilePreviewPanel } from '@/components/reportgrade/FilePreviewPanel'
import { GradePanel } from '@/components/reportgrade/GradePanel'
import { StudentListPanel } from '@/components/reportgrade/StudentListPanel'
import type { GradeStudent } from '@/components/reportgrade/shared'
import {
  apiFetch,
  fetchClassTables,
  fetchXzzdPushPreview,
  type ClassTables,
  type Experiment,
  type Score,
  type ZjuamHomeworkSubmission,
  type ZjuamHomeworkSyncData,
} from '@/lib/api'
import { getErrorMessage } from '@/lib/error'

export default function ReportGrade() {
  const { id } = useParams<{ id: string }>()

  const [experiment, setExperiment] = useState<Experiment | null>(null)
  const [syncData, setSyncData] = useState<ZjuamHomeworkSyncData | null>(null)
  const [tables, setTables] = useState<ClassTables | null>(null)
  const [scores, setScores] = useState<Map<string, Score>>(new Map())
  const [selectedPersonId, setSelectedPersonId] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const { defaultLayout, onLayoutChanged } = useDefaultLayout({
    id: 'report-grade',
    panelIds: ['students', 'preview', 'grade'],
    storage: window.localStorage,
  })

  useEffect(() => {
    if (!id) return
    let cancelled = false
    setLoading(true)
    setError(null)

    const run = async () => {
      try {
        const [experimentRes, preview] = await Promise.all([
          apiFetch<{ experiment: Experiment }>(`/api/experiments/${id}`),
          fetchXzzdPushPreview(id, 'report'),
        ])
        const classTables = await fetchClassTables(experimentRes.experiment.classId)
        if (cancelled) return
        setExperiment(experimentRes.experiment)
        setSyncData(preview)
        setTables(classTables)
        setScores(
          new Map(
            classTables.scores
              .filter((score) => score.type === 2 && score.indId === id)
              .map((score) => [score.stuId, score]),
          ),
        )
      } catch (err) {
        if (!cancelled) setError(getErrorMessage(err, '加载批改数据失败'))
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void run()

    return () => {
      cancelled = true
    }
  }, [id])

  const studentsById = useMemo(
    () => new Map((syncData?.students ?? []).map((student) => [student.id, student])),
    [syncData],
  )

  const gradeStudents = useMemo<GradeStudent[]>(() => {
    if (!syncData || !tables) return []

    const stuIdByNo = new Map(tables.students.map((student) => [student.studentNo, student.stuId]))

    const latestByPerson = new Map<number, ZjuamHomeworkSubmission>()
    for (const submission of syncData.submissions) {
      const personId = submission.created_by?.id
      if (personId == null) continue
      const existing = latestByPerson.get(personId)
      if (!existing || submissionTime(submission) > submissionTime(existing)) {
        latestByPerson.set(personId, submission)
      }
    }

    const list: GradeStudent[] = []
    for (const personId of latestByPerson.keys()) {
      const upstream = studentsById.get(personId)
      const studentNo = upstream?.studentNo ?? ''
      const stuId = studentNo ? (stuIdByNo.get(studentNo) ?? null) : null
      list.push({
        personId,
        stuId,
        name: upstream?.name ?? String(personId),
        studentNo,
        score: stuId ? (scores.get(stuId) ?? null) : null,
      })
    }
    list.sort((a, b) => a.studentNo.localeCompare(b.studentNo))
    return list
  }, [syncData, tables, scores, studentsById])

  useEffect(() => {
    setSelectedPersonId((current) => {
      if (current != null && gradeStudents.some((student) => student.personId === current)) {
        return current
      }
      const firstUngraded = gradeStudents.find((student) => student.score == null)
      return (firstUngraded ?? gradeStudents[0])?.personId ?? null
    })
  }, [gradeStudents])

  const selectedStudent =
    gradeStudents.find((student) => student.personId === selectedPersonId) ?? null
  const gradedCount = gradeStudents.filter((student) => student.score != null).length

  if (!id) return null

  return (
    <div className="flex h-dvh flex-col overflow-hidden">
      <header className="flex h-14 shrink-0 items-center gap-3 border-b border-line bg-elevated/60 px-4 backdrop-blur-xl">
        <Link
          to="/console/reports"
          className="inline-flex items-center gap-1 text-xs font-semibold text-fg-subtle transition-colors hover:text-fg"
        >
          <ArrowLeft width={14} height={14} className="shrink-0" />
          返回
        </Link>
        <div className="h-5 w-px bg-line" />
        <div className="min-w-0 flex-1 truncate text-sm font-bold">
          {experiment ? `${experiment.mark} · ${experiment.title}` : '报告批改'}
        </div>
        {gradeStudents.length > 0 && (
          <span className="tabular shrink-0 text-xs text-fg-subtle">
            已批改 <span className="font-semibold text-fg">{gradedCount}</span> /{' '}
            {gradeStudents.length}
          </span>
        )}
      </header>

      {loading ? (
        <div className="flex min-h-0 flex-1 items-center justify-center gap-2 text-xs text-fg-subtle">
          <Spinner size="sm" />
          正在加载批改数据…
        </div>
      ) : error ? (
        <div className="flex min-h-0 flex-1 items-center justify-center p-6">
          <Alert status="danger" className="max-w-md">
            <Alert.Indicator />
            <Alert.Content>
              <Alert.Description>{error}</Alert.Description>
            </Alert.Content>
          </Alert>
        </div>
      ) : (
        <Group
          id="report-grade"
          orientation="horizontal"
          className="min-h-0 flex-1"
          defaultLayout={defaultLayout}
          onLayoutChanged={onLayoutChanged}
        >
          <Panel id="students" defaultSize="22%" minSize="14%" maxSize="40%">
            <StudentListPanel
              students={gradeStudents}
              selectedPersonId={selectedPersonId}
              onSelect={setSelectedPersonId}
            />
          </Panel>
          <Separator className="w-px shrink-0 bg-line transition-colors hover:bg-brand-500/60" />
          <Panel id="preview" defaultSize="53%" minSize="30%">
            <FilePreviewPanel experimentId={id} student={selectedStudent} />
          </Panel>
          <Separator className="w-px shrink-0 bg-line transition-colors hover:bg-brand-500/60" />
          <Panel id="grade" defaultSize="25%" minSize="18%" maxSize="45%">
            <GradePanel student={selectedStudent} experimentId={id} />
          </Panel>
        </Group>
      )}
    </div>
  )
}

function submissionTime(submission: ZjuamHomeworkSubmission): number {
  const time = submission.created_at ? Date.parse(submission.created_at) : Number.NaN
  return Number.isFinite(time) ? time : submission.id
}
