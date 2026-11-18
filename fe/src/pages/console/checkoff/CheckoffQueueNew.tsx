import {
  Button,
  ListBox,
  Radio,
  RadioGroup,
  Select,
  Switch,
  type Key,
} from '@heroui/react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { toast } from 'sonner'

import Check from '~icons/lucide/check'
import School from '~icons/lucide/school'
import { AvatarImage } from '@/components/ui/AvatarImage'
import { BackLink } from '@/components/ui/BackLink'
import { EmptyState } from '@/components/ui/Card'
import { DateTimePicker } from '@/components/ui/DateTimePicker'
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
import { cn } from '@/lib/utils'

type StudentScope = 'all' | 'whitelist' | 'blacklist'
type JumpMode = 'after3' | 'anywhere' | 'none'
type StartMode = 'now' | 'scheduled'

function keysToArray(value: Key | Key[] | null): string[] {
  if (value == null) return []
  return (Array.isArray(value) ? value : [value]).map(String)
}

const sectionClass = 'rounded-2xl border border-line bg-elevated p-5 md:p-6'
const sectionTitleClass = 'text-sm font-bold text-fg'

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
  const [startMode, setStartMode] = useState<StartMode>('now')
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
    setStartMode(settings.startMode)
    setStartAt(settings.startMode === 'scheduled' ? settings.startAt : null)
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

  const renderStudentSelect = (scope: 'whitelist' | 'blacklist') => (
    <Select
      fullWidth
      selectionMode="multiple"
      aria-label={scope === 'whitelist' ? '白名单学生' : '黑名单学生'}
      placeholder={scope === 'whitelist' ? '选择参与验收的学生' : '选择不参与验收的学生'}
      value={studentIds}
      onChange={(value) => setStudentIds(keysToArray(value))}
    >
      <Select.Trigger>
        <Select.Value>
          {({ defaultChildren, isPlaceholder, state }) => {
            if (isPlaceholder || state.selectedItems.length === 0) return defaultChildren
            return (
              <span className="flex flex-wrap items-center gap-1">
                {state.selectedItems.map((item) => {
                  const student = students.find(
                    (candidate) => candidate.userId === String(item.key),
                  )
                  if (!student) return null
                  return (
                    <span
                      key={student.userId}
                      className="inline-flex items-center gap-1 rounded-full bg-sunken px-2 py-0.5"
                    >
                      <AvatarImage
                        id={student.avatar}
                        size={16}
                        fallback={student.name.slice(0, 1)}
                      />
                      <span className="text-xs font-medium">{student.name}</span>
                      <span className="tabular text-[11px] text-fg-subtle">
                        {student.studentId}
                      </span>
                    </span>
                  )
                })}
              </span>
            )
          }}
        </Select.Value>
        <Select.Indicator />
      </Select.Trigger>
      <Select.Popover>
        <ListBox selectionMode="multiple">
          {students.map((student) => (
            <ListBox.Item
              key={student.userId}
              id={student.userId}
              textValue={`${student.name} ${student.studentId}`}
            >
              <span className="flex min-w-0 flex-1 items-center gap-2">
                <AvatarImage
                  id={student.avatar}
                  size={24}
                  fallback={student.name.slice(0, 1)}
                />
                <span className="truncate">{student.name}</span>
                <span className="tabular truncate text-xs text-fg-subtle">
                  {student.studentId}
                </span>
              </span>
              <ListBox.ItemIndicator />
            </ListBox.Item>
          ))}
        </ListBox>
      </Select.Popover>
    </Select>
  )

  const canSubmit =
    acceptedIds.length > 0 &&
    (studentScope === 'all' || studentIds.length > 0) &&
    (startMode === 'now' || startAt !== null)

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
      startMode,
      startAt:
        startMode === 'scheduled'
          ? startAt
          : isEditing && editingSession?.settings.startMode === 'now'
            ? editingSession.settings.startAt
            : null,
    }

    setSubmitting(true)
    try {
      if (isEditing && editSessionId) {
        await updateCheckoffSessionSettings(editSessionId, settings)
        toast.success('设置已保存')
      } else {
        await createCheckoffSession({ classId, settings })
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
          <section className={sectionClass}>
            <h2 className={sectionTitleClass}>接受验收哪些实验？</h2>
            <div className="mt-3">
              <Select
                fullWidth
                selectionMode="multiple"
                aria-label="接受验收的实验"
                placeholder="选择一个或多个实验"
                value={acceptedIds}
                onChange={(value) => updateAccepted(keysToArray(value))}
              >
                <Select.Trigger>
                  <Select.Value />
                  <Select.Indicator />
                </Select.Trigger>
                <Select.Popover>
                  <ListBox
                    selectionMode="multiple"
                    renderEmptyState={() => <div className="px-3 py-6 text-sm text-fg-subtle">暂无可验收实验</div>}
                  >
                    {experiments.map((experiment) => (
                      <ListBox.Item
                        key={experiment.id}
                        id={experiment.id}
                        textValue={`${experiment.mark} ${experiment.title}`}
                      >
                        {experiment.mark} · {experiment.title}
                        <ListBox.ItemIndicator />
                      </ListBox.Item>
                    ))}
                  </ListBox>
                </Select.Popover>
              </Select>
            </div>

            <h2 className={cn(sectionTitleClass, 'mt-5')}>优先验收哪些实验？</h2>
            <div className="mt-3">
              <Select
                fullWidth
                selectionMode="multiple"
                isDisabled={acceptedExperiments.length === 0}
                aria-label="优先验收的实验"
                placeholder={acceptedExperiments.length === 0 ? '请先选择接受验收的实验' : '无优先级'}
                value={priorityIds}
                onChange={(value) => setPriorityIds(keysToArray(value))}
              >
                <Select.Trigger>
                  <Select.Value />
                  <Select.Indicator />
                </Select.Trigger>
                <Select.Popover>
                  <ListBox selectionMode="multiple">
                    {acceptedExperiments.map((experiment) => (
                      <ListBox.Item
                        key={experiment.id}
                        id={experiment.id}
                        textValue={`${experiment.mark} ${experiment.title}`}
                      >
                        {experiment.mark} · {experiment.title}
                        <ListBox.ItemIndicator />
                      </ListBox.Item>
                    ))}
                  </ListBox>
                </Select.Popover>
              </Select>
            </div>
          </section>

          <section className={sectionClass}>
            <h2 className={sectionTitleClass}>哪些助教将参与验收？</h2>
            <div className="mt-3">
              <Select
                fullWidth
                selectionMode="multiple"
                aria-label="参与验收的助教"
                placeholder="选择一个或多个助教"
                value={taIds}
                onChange={(value) => setTaIds(keysToArray(value))}
              >
                <Select.Trigger>
                  <Select.Value>
                    {({ defaultChildren, isPlaceholder, state }) => {
                      if (isPlaceholder || state.selectedItems.length === 0) return defaultChildren
                      return (
                        <span className="flex flex-wrap items-center gap-1">
                          {state.selectedItems.map((item) => {
                            const ta = tas.find((candidate) => candidate.id === String(item.key))
                            if (!ta) return null
                            return (
                              <span
                                key={ta.id}
                                className="inline-flex items-center gap-1 rounded-full bg-sunken px-2 py-0.5"
                              >
                                <AvatarImage
                                  id={ta.avatar}
                                  size={16}
                                  fallback={ta.name.slice(0, 1)}
                                />
                                <span className="text-xs font-medium">{ta.name}</span>
                                <span className="tabular text-[11px] text-fg-subtle">
                                  {ta.studentId}
                                </span>
                              </span>
                            )
                          })}
                        </span>
                      )
                    }}
                  </Select.Value>
                  <Select.Indicator />
                </Select.Trigger>
                <Select.Popover>
                  <ListBox
                    selectionMode="multiple"
                    renderEmptyState={() => (
                      <div className="px-3 py-6 text-sm text-fg-subtle">本班暂无助教</div>
                    )}
                  >
                    {tas.map((ta) => (
                      <ListBox.Item
                        key={ta.id}
                        id={ta.id}
                        textValue={`${ta.name} ${ta.studentId}`}
                      >
                        <span className="flex min-w-0 flex-1 items-center gap-2">
                          <AvatarImage id={ta.avatar} size={24} fallback={ta.name.slice(0, 1)} />
                          <span className="truncate">{ta.name}</span>
                          <span className="tabular truncate text-xs text-fg-subtle">
                            {ta.studentId}
                          </span>
                        </span>
                        <ListBox.ItemIndicator />
                      </ListBox.Item>
                    ))}
                  </ListBox>
                </Select.Popover>
              </Select>
            </div>

            <div className="mt-4">
              <div className="text-xs font-semibold text-fg-muted">是否允许学生选择助教</div>
              <RadioGroup
                className="mt-2"
                orientation="horizontal"
                value={allowStudentChooseTa ? 'yes' : 'no'}
                onChange={(value) => setAllowStudentChooseTa(value === 'yes')}
              >
                <Radio value="yes">
                  <Radio.Content>
                    <Radio.Control>
                      <Radio.Indicator />
                    </Radio.Control>
                    允许
                  </Radio.Content>
                </Radio>
                <Radio value="no">
                  <Radio.Content>
                    <Radio.Control>
                      <Radio.Indicator />
                    </Radio.Control>
                    不允许
                  </Radio.Content>
                </Radio>
              </RadioGroup>
            </div>

            <h3 className="mt-5 text-xs font-semibold text-fg-muted">助教验收偏好</h3>
            <p className="mt-1 text-xs text-fg-subtle">不会影响实际分配。</p>
            <div className="mt-3 flex flex-col gap-2">
              {selectedTas.length === 0 ? (
                <div className="rounded-xl border border-dashed border-line px-4 py-5 text-center text-xs text-fg-subtle">
                  请先选择参与验收的助教
                </div>
              ) : (
                selectedTas.map((ta) => (
                  <div
                    key={ta.id}
                    className="flex flex-col gap-2 rounded-xl border border-line px-3 py-2.5 sm:flex-row sm:items-center"
                  >
                    <div className="flex min-w-0 items-center gap-2 sm:w-44 sm:shrink-0">
                      <AvatarImage id={ta.avatar} size={28} fallback={ta.name.slice(0, 1)} />
                      <span className="truncate text-sm font-semibold">{ta.name}</span>
                    </div>
                    <Select
                      fullWidth
                      selectionMode="multiple"
                      className="sm:flex-1"
                      aria-label={`${ta.name}的验收偏好`}
                      placeholder="无偏好"
                      value={taPreferences[ta.id] ?? []}
                      onChange={(value) => updateTaPreferences(ta.id, keysToArray(value))}
                    >
                      <Select.Trigger>
                        <Select.Value />
                        <Select.Indicator />
                      </Select.Trigger>
                      <Select.Popover>
                        <ListBox
                          selectionMode="multiple"
                          renderEmptyState={() => (
                            <div className="px-3 py-6 text-sm text-fg-subtle">暂无可选实验</div>
                          )}
                        >
                          {taPreferenceExperiments.map((experiment) => (
                            <ListBox.Item
                              key={experiment.id}
                              id={experiment.id}
                              textValue={`${experiment.mark} ${experiment.title}`}
                            >
                              {experiment.mark} · {experiment.title}
                              <ListBox.ItemIndicator />
                            </ListBox.Item>
                          ))}
                        </ListBox>
                      </Select.Popover>
                    </Select>
                  </div>
                ))
              )}
            </div>
          </section>

          <section className={sectionClass}>
            <h2 className={sectionTitleClass}>哪些学生将参与验收？</h2>
            <div className="mt-3 rounded-xl bg-sunken/50 px-4 py-3 text-sm text-fg-muted">
              当前班级 <span className="font-semibold text-fg">{currentClass?.name ?? '—'}</span>
              <span className="mx-3 text-fg-subtle">|</span>
              共有 <span className="tabular font-semibold text-fg">{students.length}</span> 名学生
            </div>

            <RadioGroup
              className="mt-4"
              value={studentScope}
              onChange={(value) => updateStudentScope(value as StudentScope)}
            >
              <div>
                <Radio value="all">
                  <Radio.Content>
                    <Radio.Control>
                      <Radio.Indicator />
                    </Radio.Control>
                    所有
                  </Radio.Content>
                </Radio>
              </div>
              <div>
                <Radio value="whitelist">
                  <Radio.Content>
                    <Radio.Control>
                      <Radio.Indicator />
                    </Radio.Control>
                    白名单
                  </Radio.Content>
                </Radio>
                {studentScope === 'whitelist' && (
                  <div className="ms-7 mt-2">{renderStudentSelect('whitelist')}</div>
                )}
              </div>
              <div>
                <Radio value="blacklist">
                  <Radio.Content>
                    <Radio.Control>
                      <Radio.Indicator />
                    </Radio.Control>
                    黑名单
                  </Radio.Content>
                </Radio>
                {studentScope === 'blacklist' && (
                  <div className="ms-7 mt-2">{renderStudentSelect('blacklist')}</div>
                )}
              </div>
            </RadioGroup>
          </section>

          <section className={sectionClass}>
            <h2 className={sectionTitleClass}>插队和退出</h2>
            <div className="mt-4">
              <Switch isSelected={allowSelfMoveDown} onChange={setAllowSelfMoveDown}>
                <Switch.Content>
                  <Switch.Control>
                    <Switch.Thumb />
                  </Switch.Control>
                  允许学生自行将自己下移
                </Switch.Content>
              </Switch>
            </div>

            <div className="mt-4">
              <div className="text-xs font-semibold text-fg-muted">过号时，插队规则：</div>
              <Select
                fullWidth
                className="mt-2"
                aria-label="过号时插队规则"
                value={jumpMode}
                onChange={(value) => {
                  if (typeof value === 'string') setJumpMode(value as JumpMode)
                }}
              >
                <Select.Trigger>
                  <Select.Value />
                  <Select.Indicator />
                </Select.Trigger>
                <Select.Popover>
                  <ListBox>
                    <ListBox.Item id="after3" textValue="允许学生在队列第 3 位后插队">
                      允许学生在队列第 3 位后插队
                      <ListBox.ItemIndicator />
                    </ListBox.Item>
                    <ListBox.Item id="anywhere" textValue="允许学生在任意位置插队">
                      允许学生在任意位置插队
                      <ListBox.ItemIndicator />
                    </ListBox.Item>
                    <ListBox.Item id="none" textValue="不允许插队">
                      不允许插队
                      <ListBox.ItemIndicator />
                    </ListBox.Item>
                  </ListBox>
                </Select.Popover>
              </Select>
            </div>
          </section>

          <section className={sectionClass}>
            <h2 className={sectionTitleClass}>定时开始？</h2>
            <RadioGroup
              className="mt-3"
              orientation="horizontal"
              value={startMode}
              onChange={(value) => {
                setStartMode(value as StartMode)
                if (value === 'now') setStartAt(null)
              }}
            >
              <Radio value="now">
                <Radio.Content>
                  <Radio.Control>
                    <Radio.Indicator />
                  </Radio.Control>
                  立刻
                </Radio.Content>
              </Radio>
              <Radio value="scheduled">
                <Radio.Content>
                  <Radio.Control>
                    <Radio.Indicator />
                  </Radio.Control>
                  定时
                </Radio.Content>
              </Radio>
            </RadioGroup>

            {startMode === 'scheduled' && (
              <div className="mt-4">
                <DateTimePicker label="开始时间" value={startAt} onChange={setStartAt} />
              </div>
            )}
          </section>

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
