import { Button } from '@heroui/react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { toast } from 'sonner'
import Check from '~icons/lucide/check'
import School from '~icons/lucide/school'

import { AcceptedExperimentsSection } from '@/components/checkoff/queue-settings/AcceptedExperimentsSection'
import { QueueRulesSection } from '@/components/checkoff/queue-settings/QueueRulesSection'
import { StartTimeSection } from '@/components/checkoff/queue-settings/StartTimeSection'
import { StudentScopeSection } from '@/components/checkoff/queue-settings/StudentScopeSection'
import { TaConfigSection } from '@/components/checkoff/queue-settings/TaConfigSection'
import type {
  JumpMode,
  StartModeChoice,
  StudentScope,
} from '@/components/checkoff/queue-settings/types'
import { BackLink } from '@/components/ui/BackLink'
import { EmptyState } from '@/components/ui/Card'
import { PageHeader } from '@/components/ui/PageHeader'
import { PendingButton } from '@/components/ui/PendingButton'
import { SkeletonList } from '@/components/ui/SkeletonList'
import {
  createCheckoffSession,
  fetchCheckoff,
  fetchCheckoffSessions,
  listClassStaff,
  updateCheckoffSessionSettings,
  type CheckoffExperiment,
  type CheckoffStudent,
  type StaffMember,
} from '@/lib/api'
import { getErrorMessage } from '@/lib/error'
import { useAsyncData } from '@/lib/request'
import { useCurrentClass } from '@/lib/store'

export default function CheckoffQueueNew() {
  const currentClass = useCurrentClass()
  const classId = currentClass?.id ?? null
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const editSessionId = searchParams.get('session')
  const isEditing = Boolean(editSessionId)

  const { data, loading, error } = useAsyncData(
    async () => {
      if (!classId) return null
      const [checkoff, staff] = await Promise.all([
        fetchCheckoff({ classId }),
        listClassStaff(classId),
      ])
      return {
        experiments: checkoff.experiments,
        students: checkoff.students,
        tas: staff.filter((member) => member.role === 'TA'),
      }
    },
    [classId],
  )
  const {
    data: sessionData,
    loading: sessionLoading,
    error: sessionError,
  } = useAsyncData(
    () => (classId && isEditing ? fetchCheckoffSessions(classId) : Promise.resolve(null)),
    [classId, isEditing],
  )

  const experiments = useMemo<CheckoffExperiment[]>(() => data?.experiments ?? [], [data])
  const students = useMemo<CheckoffStudent[]>(() => data?.students ?? [], [data])
  const tas = useMemo<StaffMember[]>(() => data?.tas ?? [], [data])
  const editingSession = useMemo(() => {
    if (!isEditing || !editSessionId) return null
    return sessionData?.sessions.find((session) => session.id === editSessionId) ?? null
  }, [isEditing, editSessionId, sessionData])

  const [acceptedIds, setAcceptedIds] = useState<string[]>([])
  const [priorityIds, setPriorityIds] = useState<string[]>([])
  const [taIds, setTaIds] = useState<string[]>([])
  const [allowStudentChooseTa, setAllowStudentChooseTa] = useState(false)
  const [taPreferences, setTaPreferences] = useState<Record<string, string[]>>({})
  const [studentScope, setStudentScope] = useState<StudentScope>('all')
  const [studentIds, setStudentIds] = useState<string[]>([])
  const [allowSelfMoveDown, setAllowSelfMoveDown] = useState(true)
  const [jumpMode, setJumpMode] = useState<JumpMode>('none')
  const [startMode, setStartMode] = useState<StartModeChoice>(isEditing ? 'unchanged' : 'now')
  const [startAt, setStartAt] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (error) toast.error(error)
  }, [error])

  useEffect(() => {
    if (sessionError) toast.error(sessionError)
  }, [sessionError])

  const taDefaultedFor = useRef<string | null>(null)
  useEffect(() => {
    if (!classId || !data || isEditing) return
    if (taDefaultedFor.current === classId) return
    taDefaultedFor.current = classId
    setTaIds(tas.map((ta) => ta.id))
  }, [classId, data, tas, isEditing])

  const prefilledSession = useRef<string | null>(null)
  useEffect(() => {
    if (!editingSession) return
    if (prefilledSession.current === editingSession.id) return
    prefilledSession.current = editingSession.id
    const settings = editingSession.settings
    setAcceptedIds(settings.acceptedExperimentIds)
    setPriorityIds(settings.priorityExperimentIds)
    setTaIds(settings.taIds)
    setAllowStudentChooseTa(settings.allowStudentChooseTa)
    setTaPreferences(settings.taPreferences)
    setStudentScope(settings.studentScope)
    setStudentIds(settings.studentIds)
    setAllowSelfMoveDown(settings.allowSelfMoveDown)
    setJumpMode(settings.jumpMode)
    setStartMode('unchanged')
    setStartAt(settings.startAt || null)
  }, [editingSession])

  const acceptedSet = useMemo(() => new Set(acceptedIds), [acceptedIds])
  const acceptedExperiments = useMemo(
    () => experiments.filter((experiment) => acceptedSet.has(experiment.id)),
    [experiments, acceptedSet],
  )
  const taPreferenceExperiments = useMemo(
    () => (acceptedExperiments.length > 0 ? acceptedExperiments : experiments),
    [acceptedExperiments, experiments],
  )
  const selectedTas = useMemo(() => {
    const selected = new Set(taIds)
    return tas.filter((ta) => selected.has(ta.id))
  }, [tas, taIds])

  const updateAccepted = (ids: string[]) => {
    setAcceptedIds(ids)
    const next = new Set(ids)
    setPriorityIds((prev) => prev.filter((id) => next.has(id)))
    setTaPreferences((prev) => {
      let changed = false
      const entries = Object.entries(prev).map(([taId, ids]) => {
        const filtered = ids.filter((id) => next.has(id))
        if (filtered.length !== ids.length) changed = true
        return [taId, filtered] as const
      })
      return changed ? Object.fromEntries(entries) : prev
    })
  }

  const updateTaPreferences = (taId: string, ids: string[]) => {
    setTaPreferences((prev) => ({ ...prev, [taId]: ids }))
  }

  const updateStudentScope = (scope: StudentScope) => {
    setStudentScope(scope)
    if (scope === 'all') setStudentIds([])
  }

  const canSubmit =
    acceptedIds.length > 0 &&
    (studentScope === 'all' || studentIds.length > 0) &&
    (startMode === 'now' || startMode === 'unchanged' || startAt !== null)

  const submit = async () => {
    if (!classId) return
    if (acceptedIds.length === 0) {
      toast.error('请选择接受验收的实验')
      return
    }
    if (studentScope !== 'all' && studentIds.length === 0) {
      toast.error('请选择白名单 / 黑名单中的学生')
      return
    }
    if (startMode === 'scheduled' && !startAt) {
      toast.error('请选择定时开始时间')
      return
    }

    const nowStartAt = new Date().toISOString()
    const nextStartAt = startMode === 'scheduled' ? (startAt ?? nowStartAt) : nowStartAt
    const settings = {
      acceptedExperimentIds: acceptedIds,
      priorityExperimentIds: priorityIds,
      taIds,
      allowStudentChooseTa,
      taPreferences,
      studentScope,
      studentIds,
      allowSelfMoveDown,
      jumpMode,
      ...(startMode === 'unchanged' ? {} : { startAt: nextStartAt }),
    }

    setSubmitting(true)
    try {
      if (isEditing && editSessionId) {
        await updateCheckoffSessionSettings(editSessionId, settings)
        toast.success('设置已保存')
      } else {
        await createCheckoffSession({
          classId,
          settings: { ...settings, startAt: nextStartAt },
        })
        toast.success('排队已创建')
      }
      navigate('/console/checkoff-queue')
    } catch (err) {
      toast.error(getErrorMessage(err, isEditing ? '保存失败' : '创建排队失败'))
    } finally {
      setSubmitting(false)
    }
  }

  if (!classId) {
    return (
      <div className="mx-auto max-w-4xl">
        <PageHeader title={isEditing ? '编辑排队设置' : '创建新排队'} />
        <EmptyState icon={School} title="未选择课程" hint="请先在右上角选择或绑定一个课程" />
      </div>
    )
  }

  if (isEditing && !sessionLoading && !editingSession) {
    return (
      <div className="mx-auto max-w-4xl">
        <BackLink to="/console/checkoff-queue">返回验收排队</BackLink>
        <PageHeader title="编辑排队设置" />
        <EmptyState
          icon={School}
          title="排队不存在"
          hint="它可能已被删除，或不属于当前课程"
        />
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-4xl">
      <BackLink to="/console/checkoff-queue">返回验收排队</BackLink>
      <PageHeader title={isEditing ? '编辑排队设置' : '创建新排队'} />

      {loading || (isEditing && sessionLoading) ? (
        <SkeletonList rows={6} className="h-24 rounded-2xl" />
      ) : (
        <div className="flex flex-col gap-4">
          <AcceptedExperimentsSection
            experiments={experiments}
            acceptedIds={acceptedIds}
            priorityIds={priorityIds}
            acceptedExperiments={acceptedExperiments}
            onAcceptedChange={updateAccepted}
            onPriorityChange={setPriorityIds}
          />

          <TaConfigSection
            tas={tas}
            taIds={taIds}
            selectedTas={selectedTas}
            allowStudentChooseTa={allowStudentChooseTa}
            taPreferences={taPreferences}
            taPreferenceExperiments={taPreferenceExperiments}
            onTaIdsChange={setTaIds}
            onAllowStudentChooseTaChange={setAllowStudentChooseTa}
            onTaPreferenceChange={updateTaPreferences}
          />

          <StudentScopeSection
            className={currentClass?.name ?? '—'}
            students={students}
            studentScope={studentScope}
            studentIds={studentIds}
            onScopeChange={updateStudentScope}
            onStudentIdsChange={setStudentIds}
          />

          <QueueRulesSection
            allowSelfMoveDown={allowSelfMoveDown}
            jumpMode={jumpMode}
            onAllowSelfMoveDownChange={setAllowSelfMoveDown}
            onJumpModeChange={setJumpMode}
          />

          <StartTimeSection
            isEditing={isEditing}
            startMode={startMode}
            startAt={startAt}
            onStartModeChange={setStartMode}
            onStartAtChange={setStartAt}
          />

          <div className="flex flex-col-reverse gap-2 pb-6 sm:flex-row sm:justify-end">
            <Button variant="secondary" onPress={() => navigate('/console/checkoff-queue')}>
              取消
            </Button>
            <PendingButton
              variant="primary"
              icon={Check}
              pendingLabel={isEditing ? '保存中' : '创建中'}
              isPending={submitting}
              isDisabled={!canSubmit}
              onPress={() => void submit()}
            >
              {isEditing ? '保存' : '创建'}
            </PendingButton>
          </div>
        </div>
      )}
    </div>
  )
}
