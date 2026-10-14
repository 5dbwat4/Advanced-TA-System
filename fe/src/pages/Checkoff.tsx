import {
  Alert,
  Button,
  Dropdown,
  Label,
  ListBox,
  Modal,
  Select,
  Spinner,
  toast as herouiToast,
  useOverlayState,
} from '@heroui/react'
import { AnimatePresence, motion } from 'motion/react'
import { useTheme } from 'next-themes'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { toast } from 'sonner'

import { DemoStep } from '@/components/checkoff/DemoStep'
import { ExperimentPicker } from '@/components/checkoff/ExperimentPicker'
import { MasterSlavePanel } from '@/components/checkoff/MasterSlavePanel'
import { PreferenceOnboarding } from '@/components/checkoff/PreferenceOnboarding'
import { QuestionDrawer, type QuestionMark } from '@/components/checkoff/QuestionDrawer'
import { ScoreForm } from '@/components/checkoff/ScoreForm'
import { StepIndicator } from '@/components/checkoff/StepIndicator'
import { StudentFinder } from '@/components/checkoff/StudentFinder'
import MoreHorizontal from '~icons/lucide/more-horizontal'
import NotebookText from '~icons/lucide/notebook-text'
import School from '~icons/lucide/school'
import Settings2 from '~icons/lucide/settings-2'
import Users from '~icons/lucide/users'
import { EmptyState } from '@/components/ui/Card'
import { IconAction } from '@/components/ui/IconAction'
import { PageHeader } from '@/components/ui/PageHeader'
import {
  fetchBankQuestions,
  fetchCheckoff,
  fetchCheckoffRecords,
  fetchClassSettings,
  listBanks,
  type CheckoffExperiment,
  type CheckoffQuestion,
  type CheckoffRecord,
  type CheckoffStudent,
  type ClassSettings,
  type QuestionBank,
  type Score,
  type UserPreferences,
} from '@/lib/api'
import { useAuth } from '@/lib/auth'
import { useCheckoffBankOverride } from '@/lib/checkoff-bank'
import {
  clearCheckoffPresence,
  notifyCheckoffStarted,
  useCheckoffMaster,
  useCheckoffWatch,
  type CheckoffStartedEvent,
  type SlaveCardState,
} from '@/lib/checkoff-socket'
import { getErrorMessage } from '@/lib/error'
import { formatLocaleDateTime } from '@/lib/format'
import { SCORE_TYPES } from '@/lib/scores'
import { DEFAULT_SCORE_RATIO, resolveScoreRatio, type ScoreRatio } from '@/lib/scoring'
import { useCurrentClass } from '@/lib/store'
import { cn } from '@/lib/utils'

/** 分数类型 → 中文标签 */
const TYPE_LABELS = new Map<number, string>(
  SCORE_TYPES.map((type) => [type.value, type.label]),
)

/** 「跟随实验设置」在题目集下拉中的哨兵值 */
const FOLLOW_BANK = '__follow__'

export default function Checkoff() {
  const currentClass = useCurrentClass()
  const { user, loading: authLoading, updatePreferences } = useAuth()
  const classId = currentClass?.id
  const [searchParams] = useSearchParams()
  const preselectId = searchParams.get('experiment')

  const [experiments, setExperiments] = useState<CheckoffExperiment[]>([])
  const [classSettings, setClassSettings] = useState<ClassSettings | null>(null)
  const [ratioError, setRatioError] = useState(false)
  const [loading, setLoading] = useState(true)
  const [experiment, setExperiment] = useState<CheckoffExperiment | null>(null)
  const [student, setStudent] = useState<CheckoffStudent | null>(null)
  const [questions, setQuestions] = useState<CheckoffQuestion[]>([])
  const [questionsLoaded, setQuestionsLoaded] = useState(false)
  const [questionsError, setQuestionsError] = useState<string | null>(null)
  const [finderReloadKey, setFinderReloadKey] = useState(0)
  const [drawn, setDrawn] = useState<CheckoffQuestion[]>([])
  const [marks, setMarks] = useState<Record<string, QuestionMark | undefined>>({})
  const [existingScores, setExistingScores] = useState<Score[]>([])
  const [step, setStep] = useState(0)
  const [searching, setSearching] = useState(false)
  const [questionIndex, setQuestionIndex] = useState(0)
  const [records, setRecords] = useState<CheckoffRecord[]>([])
  const [recordsLoading, setRecordsLoading] = useState(false)
  const [banks, setBanks] = useState<QuestionBank[]>([])
  const [draftBank, setDraftBank] = useState<string | null>(null)

  const prefsState = useOverlayState()
  const presenceState = useOverlayState()
  const bankState = useOverlayState()
  const { bankId: bankOverrideId, save: saveBankOverride } = useCheckoffBankOverride()

  const isMulti = user?.preferences?.device === 'multi'
  const master = useCheckoffMaster(isMulti, user?.id)
  const { resolvedTheme } = useTheme()

  const markdownStyle = user?.preferences?.markdownStyle ?? 'github'
  const theme: 'light' | 'dark' = resolvedTheme === 'dark' ? 'dark' : 'light'

  const scoreRatio: ScoreRatio = useMemo(
    () => (experiment ? resolveScoreRatio(classSettings, experiment.id) : DEFAULT_SCORE_RATIO),
    [classSettings, experiment],
  )

  const handleCheckoffStarted = useCallback((event: CheckoffStartedEvent) => {
    herouiToast(`${event.userName}正在验收${event.studentName}。`, { timeout: 10000 })
  }, [])

  const peers = useCheckoffWatch(classId, handleCheckoffStarted)

  const openPresence = useCallback(() => {
    presenceState.open()
    if (!classId) return
    setRecordsLoading(true)
    fetchCheckoffRecords(classId)
      .then((res) => setRecords(res.records))
      .catch((error) => toast.error(getErrorMessage(error, '加载记录失败')))
      .finally(() => setRecordsLoading(false))
  }, [classId, presenceState])

  // 回到「选择实验 / 定位学生」表示不再验收，清空在场信息
  useEffect(() => {
    if (classId && step <= 1) clearCheckoffPresence(classId)
  }, [classId, step])

  // 「使用其它题目集」：本地覆盖实验设定的题目集，直接拉取该题库的题目
  useEffect(() => {
    if (!experiment || !bankOverrideId) return
    let cancelled = false
    setQuestionsLoaded(false)
    setQuestionsError(null)
    fetchBankQuestions(bankOverrideId)
      .then((res) => {
        if (cancelled) return
        setQuestions(
          res.questions.map((question) => ({
            id: question.id,
            question: question.question,
            answer: question.answer,
          })),
        )
        setQuestionsLoaded(true)
      })
      .catch((error) => {
        if (cancelled) return
        setQuestionsError(getErrorMessage(error, '加载题目失败'))
        setQuestionsLoaded(false)
      })
    return () => {
      cancelled = true
    }
  }, [experiment, bankOverrideId, finderReloadKey])

  const openBankPicker = useCallback(() => {
    bankState.open()
    setDraftBank(bankOverrideId)
    listBanks()
      .then((res) => setBanks(res.banks))
      .catch((error) => toast.error(getErrorMessage(error, '加载题目集失败')))
  }, [bankState, bankOverrideId])

  const confirmBankOverride = useCallback(() => {
    saveBankOverride(draftBank)
    bankState.close()
    toast.success(draftBank ? '已切换题目集' : '已跟随实验设置')
  }, [saveBankOverride, draftBank, bankState])

  useEffect(() => {
    if (!classId) return
    let cancelled = false
    setLoading(true)
    fetchCheckoff({ classId })
      .then((res) => {
        if (!cancelled) setExperiments(res.experiments)
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
    if (!classId) return
    let cancelled = false
    setRatioError(false)
    fetchClassSettings(classId)
      .then((res) => {
        if (!cancelled) setClassSettings(res.settings)
      })
      .catch(() => {
        if (!cancelled) setRatioError(true)
      })
    return () => {
      cancelled = true
    }
  }, [classId])

  const selectExperiment = useCallback(async (next: CheckoffExperiment) => {
    setExperiment(next)
    setStudent(null)
    setDrawn([])
    setMarks({})
    setExistingScores([])
    setQuestions([])
    setQuestionsLoaded(false)
    setQuestionsError(null)
    setQuestionIndex(0)
    setSearching(false)
    setStep(1)
  }, [])

  useEffect(() => {
    if (experiment || !preselectId || experiments.length === 0) return
    const match = experiments.find((item) => item.id === preselectId)
    if (match) void selectExperiment(match)
  }, [experiment, experiments, preselectId, selectExperiment])

  const selectStudent = useCallback(
    (next: CheckoffStudent, nextScores: Score[]) => {
      setStudent(next)
      setExistingScores(nextScores)
      setDrawn([])
      setMarks({})
      setQuestionIndex(0)
      setSearching(false)
      setStep(2)
      if (classId) notifyCheckoffStarted({ classId, studentName: next.name })
    },
    [classId],
  )

  const mark = useCallback((id: string, next: QuestionMark) => {
    setMarks((prev) => ({ ...prev, [id]: prev[id] === next ? undefined : next }))
  }, [])

  const handleSaved = useCallback(() => {
    setStudent(null)
    setDrawn([])
    setMarks({})
    setExistingScores([])
    setQuestionIndex(0)
    setSearching(false)
    setStep(1)
    if (classId) clearCheckoffPresence(classId)
  }, [classId])

  const handleStep = useCallback(
    (next: number) => {
      if (questionsError && next === 3) return
      if (next === 1) setSearching(false)
      setStep(next)
    },
    [questionsError],
  )

  const handleQuestionIndex = useCallback(
    (index: number) => {
      setQuestionIndex(index)
      if (isMulti && student && drawn[index]) {
        master.switchQuestion({
          studentName: student.name,
          index,
          total: drawn.length,
          content: drawn[index].question,
        })
      }
    },
    [isMulti, student, drawn, master.switchQuestion],
  )

  useEffect(() => {
    if (!isMulti) return
    let state: SlaveCardState
    if (step === 0) {
      state = {
        kind: 'idle',
        experimentMark: experiment?.mark ?? '',
        experimentTitle: experiment?.title ?? '',
      }
    } else if (step === 1) {
      state = searching
        ? { kind: 'ask_name' }
        : {
            kind: 'idle',
            experimentMark: experiment?.mark ?? '',
            experimentTitle: experiment?.title ?? '',
          }
    } else if (step === 2) {
      state = { kind: 'ask_demo' }
    } else if (step === 3) {
      if (student && drawn.length > 0) {
        state = {
          kind: 'ask_question',
          studentName: student.name,
          index: questionIndex,
          total: drawn.length,
          content: drawn[Math.min(questionIndex, drawn.length - 1)]?.question ?? '',
        }
      } else {
        state = { kind: 'ask_demo' }
      }
    } else {
      state = { kind: 'thank', studentName: student?.name }
    }
    master.pushState(state, { markdownStyle, theme })
  }, [
    isMulti,
    step,
    searching,
    experiment,
    student,
    drawn,
    questionIndex,
    markdownStyle,
    theme,
    master.session.token,
    master.pushState,
  ])

  const savePreferences = useCallback(
    async (prefs: UserPreferences) => {
      try {
        await updatePreferences(prefs)
        toast.success('偏好已保存')
        prefsState.close()
      } catch (error) {
        toast.error(getErrorMessage(error, '保存失败'))
        throw error
      }
    },
    [updatePreferences, prefsState],
  )

  if (authLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Spinner size="lg" />
      </div>
    )
  }

  if (!currentClass) {
    return (
      <div className="mx-auto max-w-4xl">
        <PageHeader title="验收" />
        <EmptyState icon={School} title="尚未绑定班级" hint="请先在设置中绑定班级" />
      </div>
    )
  }

  if (!user) return null

  if (user.preferences == null) {
    return (
      <div className="mx-auto flex min-h-[70vh] max-w-xl items-center">
        <div className="w-full">
          <PreferenceOnboarding initial={null} onSubmit={savePreferences} />
        </div>
      </div>
    )
  }

  const preferences = user.preferences

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        title="验收"
        actions={
          <>
            <IconAction label="偏好" onPress={prefsState.open}>
              <Settings2 width={15} height={15} className="shrink-0" />
            </IconAction>
            <Dropdown>
              <Dropdown.Trigger>
                <Button isIconOnly size="sm" variant="ghost" aria-label="更多">
                  <MoreHorizontal width={16} height={16} className="shrink-0" />
                </Button>
              </Dropdown.Trigger>
              <Dropdown.Popover className="min-w-[220px]">
                <Dropdown.Menu
                  onAction={(key) => {
                    if (key === 'presence') openPresence()
                    else if (key === 'bank') openBankPicker()
                  }}
                >
                  <Dropdown.Item id="presence" textValue="现在谁正在验收">
                    <Users width={15} height={15} className="shrink-0 text-fg-muted" />
                    <Label>现在谁正在验收</Label>
                  </Dropdown.Item>
                  <Dropdown.Item id="bank" textValue="使用其它题目集">
                    <NotebookText width={15} height={15} className="shrink-0 text-fg-muted" />
                    <Label>使用其它题目集</Label>
                  </Dropdown.Item>
                </Dropdown.Menu>
              </Dropdown.Popover>
            </Dropdown>
          </>
        }
      />

      {isMulti && (
        <div className="mb-4">
          <MasterSlavePanel session={master.session} />
        </div>
      )}

      <StepIndicator
        step={step}
        onStep={handleStep}
        hasExperiment={Boolean(experiment)}
        hasStudent={Boolean(student)}
      />

      {ratioError && (
        <Alert className="mt-4" status="warning">
          <Alert.Indicator />
          <Alert.Content>
            <Alert.Description>
              评分占比加载失败，总评按默认占比 2:5:0 估算，仅供参考
            </Alert.Description>
          </Alert.Content>
        </Alert>
      )}

      <div className="mt-6">
        <AnimatePresence mode="wait">
          <motion.div
            key={step}
            initial={{ opacity: 0, x: 24 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -24 }}
            transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
          >
            {step === 0 &&
              (loading ? (
                <div className="flex h-56 items-center justify-center">
                  <Spinner size="lg" />
                </div>
              ) : (
                <ExperimentPicker
                  experiments={experiments}
                  onSelect={(next) => void selectExperiment(next)}
                />
              ))}
            {step === 1 && experiment && (
              <StudentFinder
                classId={currentClass.id}
                experimentId={experiment.id}
                reloadKey={finderReloadKey}
                includeQuestions={!bankOverrideId}
                onSelect={selectStudent}
                onQuestionsLoaded={(loaded) => {
                  setQuestions(loaded)
                  setQuestionsLoaded(true)
                  setQuestionsError(null)
                }}
                onLoadError={(message) => {
                  setQuestionsError(message)
                  setQuestionsLoaded(false)
                }}
                onSearchFocus={() => {
                  if (step === 1) setSearching(true)
                }}
                onSearchBlur={() => {
                  if (step === 1) setSearching(false)
                }}
              />
            )}
            {step === 2 && experiment && student && <DemoStep onNext={() => setStep(3)} />}
            {step === 3 && experiment && student && questionsError !== null && (
              <div className="rounded-2xl border border-danger/40 bg-danger/5 p-8 text-center">
                <p className="text-sm font-semibold text-danger">{questionsError}</p>
                <div className="mt-4">
                  <Button
                    variant="secondary"
                    size="sm"
                    isPending={!questionsLoaded && questionsError === null}
                    onPress={() => {
                      setQuestionsError(null)
                      setFinderReloadKey((key) => key + 1)
                    }}
                  >
                    重试
                  </Button>
                </div>
              </div>
            )}
            {step === 3 && experiment && student && questionsError === null && (
              <QuestionDrawer
                mode={preferences.draw}
                questions={questions}
                drawn={drawn}
                onDrawnChange={setDrawn}
                marks={marks}
                onMark={mark}
                drawCount={preferences.drawCount}
                onNext={() => setStep(4)}
                onSkip={() => setStep(4)}
                student={student}
                loading={!questionsLoaded}
                questionIndex={questionIndex}
                onQuestionIndex={handleQuestionIndex}
                showPager={isMulti}
              />
            )}
            {step === 4 && experiment && student && (
              <ScoreForm
                experimentId={experiment.id}
                student={student}
                marks={marks}
                existingScores={existingScores}
                ratio={scoreRatio}
                onSaved={handleSaved}
              />
            )}
          </motion.div>
        </AnimatePresence>
      </div>

      <Modal state={prefsState}>
        <Modal.Backdrop>
          <Modal.Container>
            <Modal.Dialog className="sm:max-w-3xl">
              <Modal.CloseTrigger />
              <Modal.Body>
                <PreferenceOnboarding
                  initial={preferences}
                  onSubmit={savePreferences}
                  onCancel={prefsState.close}
                  layout="rows"
                />
              </Modal.Body>
            </Modal.Dialog>
          </Modal.Container>
        </Modal.Backdrop>
      </Modal>
      <Modal state={presenceState}>
        <Modal.Backdrop>
          <Modal.Container>
            <Modal.Dialog className="sm:max-w-lg">
              <Modal.CloseTrigger />
              <Modal.Header>
                <Modal.Icon className="bg-brand-500/10 text-brand-600 dark:text-brand-300">
                  <Users width={18} height={18} className="shrink-0" />
                </Modal.Icon>
                <Modal.Heading>现在谁正在验收</Modal.Heading>
              </Modal.Header>
              <Modal.Body className="flex flex-col gap-5">
                <section className="flex flex-col gap-2">
                  <div className="text-xs font-semibold tracking-wider text-fg-subtle">
                    正在线上 {peers.length}
                  </div>
                  {peers.length === 0 ? (
                    <p className="rounded-xl border border-dashed border-line py-4 text-center text-xs text-fg-subtle">
                      暂无其他人在验收页
                    </p>
                  ) : (
                    peers.map((peer) => (
                      <div
                        key={peer.userId}
                        className="flex items-center gap-3 rounded-xl border border-line bg-sunken px-3 py-2"
                      >
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-600/15 text-xs font-bold text-brand-600 dark:text-brand-300">
                          {peer.name.slice(0, 1)}
                        </div>
                        <div className="min-w-0 flex-1 truncate text-sm font-semibold text-fg">
                          {peer.name}
                          {peer.userId === user?.id && (
                            <span className="ml-1 text-xs font-normal text-fg-subtle">（我）</span>
                          )}
                        </div>
                        <span
                          className={cn(
                            'shrink-0 text-xs',
                            peer.studentName
                              ? 'font-medium text-brand-600 dark:text-brand-300'
                              : 'text-fg-subtle',
                          )}
                        >
                          {peer.studentName ? `正在验收 ${peer.studentName}` : '空闲'}
                        </span>
                      </div>
                    ))
                  )}
                </section>

                <section className="flex flex-col gap-2">
                  <div className="text-xs font-semibold tracking-wider text-fg-subtle">最近保存</div>
                  {recordsLoading ? (
                    <div className="flex justify-center py-4">
                      <Spinner size="sm" />
                    </div>
                  ) : records.length === 0 ? (
                    <p className="rounded-xl border border-dashed border-line py-4 text-center text-xs text-fg-subtle">
                      暂无记录
                    </p>
                  ) : (
                    records.map((record, index) => (
                      <div
                        key={`${record.stuId}-${record.type}-${record.updatedAt}-${index}`}
                        className="flex items-center gap-3 rounded-xl border border-line px-3 py-2"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm font-semibold text-fg">
                            {record.studentName}
                          </div>
                          <div className="truncate text-xs text-fg-muted">
                            {record.experimentMark ? `${record.experimentMark} · ` : ''}
                            {record.experimentTitle} · {TYPE_LABELS.get(record.type) ?? record.type}
                          </div>
                        </div>
                        <div className="shrink-0 text-right">
                          <div className="tabular text-sm font-bold text-fg">{record.score}</div>
                          <div className="text-[11px] text-fg-subtle">
                            {record.graderName ?? '—'} · {formatLocaleDateTime(record.updatedAt)}
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </section>
              </Modal.Body>
            </Modal.Dialog>
          </Modal.Container>
        </Modal.Backdrop>
      </Modal>
      <Modal state={bankState}>
        <Modal.Backdrop>
          <Modal.Container>
            <Modal.Dialog className="sm:max-w-md">
              <Modal.CloseTrigger />
              <Modal.Header>
                <Modal.Icon className="bg-brand-500/10 text-brand-600 dark:text-brand-300">
                  <NotebookText width={18} height={18} className="shrink-0" />
                </Modal.Icon>
                <Modal.Heading>使用其它题目集</Modal.Heading>
              </Modal.Header>
              <Modal.Body className="flex flex-col gap-3">
                <p className="text-xs text-fg-subtle">
                  选择后将覆盖实验设定的题目集；此设置仅保存在当前设备。
                </p>
                <Select
                  aria-label="题目集"
                  className="w-full"
                  placeholder="跟随实验设置"
                  value={draftBank ?? FOLLOW_BANK}
                  onChange={(key) =>
                    setDraftBank(key == null || key === FOLLOW_BANK ? null : String(key))
                  }
                >
                  <Select.Trigger>
                    <Select.Value />
                    <Select.Indicator />
                  </Select.Trigger>
                  <Select.Popover>
                    <ListBox>
                      <ListBox.Item id={FOLLOW_BANK} textValue="跟随实验设置">
                        跟随实验设置
                        <ListBox.ItemIndicator />
                      </ListBox.Item>
                      {banks.map((bank) => (
                        <ListBox.Item key={bank.id} id={bank.id} textValue={bank.name}>
                          {bank.name}
                          <ListBox.ItemIndicator />
                        </ListBox.Item>
                      ))}
                    </ListBox>
                  </Select.Popover>
                </Select>
              </Modal.Body>
              <Modal.Footer>
                <Button slot="close" variant="secondary">
                  取消
                </Button>
                <Button variant="primary" onPress={confirmBankOverride}>
                  保存
                </Button>
              </Modal.Footer>
            </Modal.Dialog>
          </Modal.Container>
        </Modal.Backdrop>
      </Modal>
    </div>
  )
}
