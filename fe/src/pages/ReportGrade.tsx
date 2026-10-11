import { Alert, Spinner, toast as herouiToast } from '@heroui/react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Group, Panel, Separator, useDefaultLayout } from 'react-resizable-panels'
import { toast } from 'sonner'

import ArrowLeft from '~icons/lucide/arrow-left'
import ArrowRightLeft from '~icons/lucide/arrow-right-left'
import Users from '~icons/lucide/users'
import { FilePreviewPanel } from '@/components/reportgrade/FilePreviewPanel'
import { GradePanel } from '@/components/reportgrade/GradePanel'
import { StudentListPanel } from '@/components/reportgrade/StudentListPanel'
import type { GradeStudent, ReportSync } from '@/components/reportgrade/shared'
import {
  apiFetch,
  fetchClassTables,
  fetchRemark,
  fetchReportReview,
  fetchXzzdPushPreview,
  type ClassTables,
  type Experiment,
  type Score,
  type ZjuamHomeworkSubmission,
  type ZjuamHomeworkSyncData,
} from '@/lib/api'
import { useAuth } from '@/lib/auth'
import { getErrorMessage } from '@/lib/error'
import { useReportRoom, type ReportPeer, type ReportScoreEvent } from '@/lib/report-socket'

export default function ReportGrade() {
  const { id } = useParams<{ id: string }>()

  const [experiment, setExperiment] = useState<Experiment | null>(null)
  const [syncData, setSyncData] = useState<ZjuamHomeworkSyncData | null>(null)
  const [tables, setTables] = useState<ClassTables | null>(null)
  const [scores, setScores] = useState<Map<string, Score>>(new Map())
  const [selectedPersonId, setSelectedPersonId] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [peers, setPeers] = useState<ReportPeer[]>([])
  const [remoteSaves, setRemoteSaves] = useState<Map<string, ReportScoreEvent>>(new Map())
  const [sync, setSync] = useState<ReportSync | null>(null)

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
      const fromHash = readHashStudent(gradeStudents)
      if (fromHash) return fromHash.personId
      if (current != null && gradeStudents.some((student) => student.personId === current)) {
        return current
      }
      const firstUngraded = gradeStudents.find((student) => student.score == null)
      return (firstUngraded ?? gradeStudents[0])?.personId ?? null
    })
  }, [gradeStudents])

  useEffect(() => {
    const onHashChange = () => {
      const student = readHashStudent(gradeStudents)
      if (student) setSelectedPersonId(student.personId)
    }
    window.addEventListener('hashchange', onHashChange)
    return () => window.removeEventListener('hashchange', onHashChange)
  }, [gradeStudents])

  const selectStudent = useCallback(
    (personId: number) => {
      setSelectedPersonId(personId)
      const student = gradeStudents.find((item) => item.personId === personId)
      if (student) {
        const key = student.studentNo || String(student.personId)
        window.history.replaceState(null, '', `#${encodeURIComponent(key)}`)
      }
    },
    [gradeStudents],
  )

  const selectedStudent =
    gradeStudents.find((student) => student.personId === selectedPersonId) ?? null
  const gradedCount = gradeStudents.filter((student) => student.score != null).length

  const handleScoreSaved = useCallback((score: Score) => {
    setScores((prev) => {
      const next = new Map(prev)
      next.set(score.stuId, score)
      return next
    })
  }, [])

  const { user } = useAuth()
  const myUserId = user?.id ?? null
  const selectedStuId = selectedStudent?.stuId ?? null

  /** 他人保存/删除成绩：刷新左侧分数列表；他人保存则记录为可同步内容 */
  const handleRemoteScore = useCallback(
    (event: ReportScoreEvent) => {
      setScores((prev) => {
        const next = new Map(prev)
        if (event.score) next.set(event.stuId, event.score)
        else next.delete(event.stuId)
        return next
      })
      if (!event.score || event.byUserId === myUserId) return
      setRemoteSaves((prev) => new Map(prev).set(event.stuId, event))
    },
    [myUserId],
  )

  useReportRoom({
    experimentId: id,
    stuId: selectedStuId,
    onPresence: setPeers,
    onScore: handleRemoteScore,
  })

  /** stuId → 正在批改该学生的他人姓名（去重，排除自己） */
  const editorsByStuId = useMemo(() => {
    const map = new Map<string, string[]>()
    for (const peer of peers) {
      if (!peer.stuId || peer.userId === myUserId) continue
      const names = map.get(peer.stuId) ?? []
      if (!names.includes(peer.name)) names.push(peer.name)
      map.set(peer.stuId, names)
    }
    return map
  }, [peers, myUserId])

  const coEditors = selectedStuId ? (editorsByStuId.get(selectedStuId) ?? []) : []
  const saveNotice = selectedStuId ? (remoteSaves.get(selectedStuId) ?? null) : null

  /** 同步对方成绩：从数据库 GET 最新批阅与附言，覆盖到编辑器 */
  const handleSync = useCallback(async () => {
    if (!id || !saveNotice) return
    const { stuId } = saveNotice
    try {
      const [review, remark] = await Promise.all([
        fetchReportReview(stuId, id),
        fetchRemark(stuId, id),
      ])
      setSync({
        nonce: Date.now(),
        stuId,
        ruleId: review?.ruleId ?? null,
        ruleContent: review?.ruleContent ?? null,
        remark: remark?.text ?? '',
      })
      setRemoteSaves((prev) => {
        const next = new Map(prev)
        next.delete(stuId)
        return next
      })
      toast.success('已同步对方成绩')
    } catch (err) {
      toast.error(getErrorMessage(err, '同步失败'))
    }
  }, [id, saveNotice])

  /** 仅当待处理事件仍是最新那条时才清除（避免异步 onClose 误删新事件） */
  const dismissRemoteSave = useCallback((stuId: string, event: ReportScoreEvent) => {
    setRemoteSaves((prev) => {
      if (prev.get(stuId) !== event) return prev
      const next = new Map(prev)
      next.delete(stuId)
      return next
    })
  }, [])

  // 顶部通知：他人也在批改同一份报告（对方离开即消失）
  const coEditorsLabel = coEditors.join('、')
  const coToastRef = useRef<string | null>(null)
  useEffect(() => {
    const previous = coToastRef.current
    if (!coEditorsLabel) {
      if (previous) {
        coToastRef.current = null
        herouiToast.close(previous)
      }
      return
    }
    const message = `${coEditorsLabel}也在批改这份报告`
    if (previous) herouiToast.update(previous, message, { timeout: 0 })
    else
      coToastRef.current = herouiToast(message, {
        variant: 'warning',
        timeout: 0,
        indicator: <Users width={18} height={18} />,
      })
  }, [coEditorsLabel])
  useEffect(
    () => () => {
      if (coToastRef.current) herouiToast.close(coToastRef.current)
    },
    [],
  )

  // 顶部通知：他人保存了成绩，可同步
  const saveToastRef = useRef<string | null>(null)
  useEffect(() => {
    const previous = saveToastRef.current
    if (previous) {
      saveToastRef.current = null
      herouiToast.close(previous)
    }
    if (!saveNotice) return
    const event = saveNotice
    saveToastRef.current = herouiToast(`${event.byName || '对方'}保存了这份报告的成绩`, {
      description: '你可以同步成绩，同步将覆盖你当前做出的批改',
      variant: 'accent',
      timeout: 0,
      indicator: <ArrowRightLeft width={18} height={18} />,
      actionProps: { children: '同步', onPress: () => void handleSync() },
      onClose: () => dismissRemoteSave(event.stuId, event),
    })
  }, [saveNotice, handleSync, dismissRemoteSave])

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
              onSelect={selectStudent}
              editorsByStuId={editorsByStuId}
            />
          </Panel>
          <Separator className="w-px shrink-0 bg-line transition-colors hover:bg-brand-500/60" />
          <Panel id="preview" defaultSize="53%" minSize="30%">
            <FilePreviewPanel experimentId={id} student={selectedStudent} />
          </Panel>
          <Separator className="w-px shrink-0 bg-line transition-colors hover:bg-brand-500/60" />
          <Panel id="grade" defaultSize="25%" minSize="18%" maxSize="45%">
            <GradePanel
              student={selectedStudent}
              experimentId={id}
              onScoreSaved={handleScoreSaved}
              sync={sync}
            />
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

/** 读取 URL hash（如 #20210001）并按学号 / personId / stuId / 姓名匹配学生 */
function readHashStudent(students: GradeStudent[]): GradeStudent | null {
  const raw = window.location.hash.replace(/^#/, '')
  if (!raw) return null
  let value = raw
  try {
    value = decodeURIComponent(raw)
  } catch {
    value = raw
  }
  return (
    students.find(
      (student) =>
        student.studentNo === value ||
        String(student.personId) === value ||
        student.stuId === value ||
        student.name === value,
    ) ?? null
  )
}
