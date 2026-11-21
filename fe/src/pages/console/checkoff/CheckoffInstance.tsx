import { Button, Spinner, useOverlayState } from '@heroui/react'
import { AnimatePresence, motion } from 'motion/react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'

import { CheckoffQueueDrawer } from '@/components/checkoff/CheckoffQueueDrawer'
import { CheckoffResumeDialog } from '@/components/checkoff/CheckoffResumeDialog'
import { DemoStep } from '@/components/checkoff/DemoStep'
import { ExperimentPicker } from '@/components/checkoff/ExperimentPicker'
import { MasterSlavePanel } from '@/components/checkoff/MasterSlavePanel'
import { QuestionDrawer, type QuestionMark } from '@/components/checkoff/QuestionDrawer'
import { ScoreForm } from '@/components/checkoff/ScoreForm'
import { StepIndicator } from '@/components/checkoff/StepIndicator'
import { StudentFinder } from '@/components/checkoff/StudentFinder'
import {
  fetchCheckoff,
  type CheckoffExperiment,
  type CheckoffQuestion,
  type CheckoffStudent,
  type ClassSettings,
  type MarkdownStyleId,
  type Score,
  type UserPreferences,
} from '@/lib/api'
import {
  clearCheckoffPresence,
  notifyCheckoffStarted,
  useCheckoffMaster,
  type CheckoffMeta,
  type SlaveCardState,
} from '@/lib/checkoff-socket'
import {
  loadInstanceSnapshot,
  saveInstanceSnapshot,
  sessionStorageKey,
} from '@/lib/checkoff-multi'
import {
  clearCheckoffResume,
  loadCheckoffResume,
  multiCheckoffResumeKey,
  saveCheckoffResume,
  type CheckoffResumeSnapshot,
} from '@/lib/checkoff-resume'
import { getErrorMessage } from '@/lib/error'
import { DEFAULT_SCORE_RATIO, resolveScoreRatio } from '@/lib/scoring'

export type CheckoffTabMeta = {
  experimentMark: string
  experimentTitle: string
  studentName: string
  step: number
  slaveConnected: boolean
  token: string | null
}

export type CheckoffInstanceProps = {
  id: string
  classId: string
  userId: string
  grader: { name: string; avatar: number | null }
  experiments: CheckoffExperiment[]
  experimentsLoading: boolean
  classSettings: ClassSettings | null
  preferences: UserPreferences
  markdownStyle: MarkdownStyleId
  theme: 'light' | 'dark'
  active: boolean
  onMetaChange: (id: string, meta: CheckoffTabMeta) => void
  onSaved: (id: string) => void
}

export function CheckoffInstance({
  id,
  classId,
  userId,
  grader,
  experiments,
  experimentsLoading,
  classSettings,
  preferences,
  markdownStyle,
  theme,
  active,
  onMetaChange,
  onSaved,
}: CheckoffInstanceProps) {
  const resumeKey = multiCheckoffResumeKey(id, userId, classId)
  const [initialResume] = useState(() => loadCheckoffResume(resumeKey))
  const [initial] = useState(() => (initialResume ? null : loadInstanceSnapshot(id)))
  const [resume, setResume] = useState<CheckoffResumeSnapshot | null>(initialResume)
  const resumeState = useOverlayState()
  const [experiment, setExperiment] = useState<CheckoffExperiment | null>(
    initial?.experiment ?? null,
  )
  const [student, setStudent] = useState<CheckoffStudent | null>(initial?.student ?? null)
  const [activeStartedAt, setActiveStartedAt] = useState<string | null>(
    initial?.activeStartedAt ?? null,
  )
  const [questions, setQuestions] = useState<CheckoffQuestion[]>([])
  const [questionsLoaded, setQuestionsLoaded] = useState(false)
  const [questionsError, setQuestionsError] = useState<string | null>(null)
  const [finderReloadKey, setFinderReloadKey] = useState(0)
  const [drawn, setDrawn] = useState<CheckoffQuestion[]>(initial?.drawn ?? [])
  const [marks, setMarks] = useState<Record<string, QuestionMark | undefined>>(
    initial?.marks ?? {},
  )
  const [existingScores, setExistingScores] = useState<Score[]>(initial?.existingScores ?? [])
  const [step, setStep] = useState(initial?.step ?? 0)
  const [searching, setSearching] = useState(false)
  const [questionIndex, setQuestionIndex] = useState(initial?.questionIndex ?? 0)
  const [panelVisible, setPanelVisible] = useState(true)

  const { session, pushState, switchQuestion } = useCheckoffMaster(true, userId, {
    sessionKey: id,
    dedicated: true,
    storageKey: sessionStorageKey(id),
  })

  const checkoffMeta = useMemo<CheckoffMeta>(
    () => ({
      markdownStyle,
      theme,
      grader: { name: grader.name, avatar: grader.avatar },
      student: student ? { name: student.name, avatar: student.avatar } : null,
    }),
    [markdownStyle, theme, grader.name, grader.avatar, student],
  )

  const scoreRatio = useMemo(
    () => (experiment ? resolveScoreRatio(classSettings, experiment.id) : DEFAULT_SCORE_RATIO),
    [classSettings, experiment],
  )

  useEffect(() => {
    if (resume) return
    saveInstanceSnapshot(id, {
      experiment,
      student,
      step,
      drawn,
      marks,
      existingScores,
      questionIndex,
      activeStartedAt,
    })
  }, [
    activeStartedAt,
    id,
    experiment,
    student,
    step,
    drawn,
    marks,
    existingScores,
    questionIndex,
    resume,
  ])

  useEffect(() => {
    if (!resume) {
      if (!student || !experiment || step < 2) {
        clearCheckoffResume(resumeKey)
      } else {
        saveCheckoffResume(resumeKey, {
          savedAt: new Date().toISOString(),
          student,
          experiment,
          step,
          drawn,
          marks,
          existingScores,
          questionIndex,
          activeStartedAt,
        })
      }
    }
  }, [
    activeStartedAt,
    drawn,
    existingScores,
    experiment,
    marks,
    questionIndex,
    resume,
    resumeKey,
    step,
    student,
  ])

  useEffect(() => {
    resumeState.setOpen(active && resume !== null)
  }, [active, resume, resumeState, resumeState.isOpen])

  // 刷新后恢复到抽题 / 评分步骤时，补拉题目池（正常流程由 StudentFinder 首次加载）
  useEffect(() => {
    if (!experiment || step !== 3 || questionsLoaded) return
    let cancelled = false
    setQuestionsLoaded(false)
    setQuestionsError(null)
    fetchCheckoff({ classId, experimentId: experiment.id, includeQuestions: true })
      .then((res) => {
        if (cancelled) return
        setQuestions(res.questions ?? [])
        setQuestionsLoaded(true)
      })
      .catch((error) => {
        if (cancelled) return
        setQuestionsError(getErrorMessage(error, '加载题目失败'))
      })
    return () => {
      cancelled = true
    }
  }, [classId, experiment, step, questionsLoaded, finderReloadKey])

  // 仅当前激活的 tab 更新「正在验收」状态，避免多个 tab 互相覆盖
  useEffect(() => {
    if (!active) return
    if (student) {
      notifyCheckoffStarted({
        classId,
        studentId: student.userId,
        studentName: student.name,
      })
    } else clearCheckoffPresence(classId)
  }, [active, classId, student])

  useEffect(() => {
    onMetaChange(id, {
      experimentMark: experiment?.mark ?? '',
      experimentTitle: experiment?.title ?? '',
      studentName: student?.name ?? '',
      step,
      slaveConnected: session.slaveConnected,
      token: session.token,
    })
  }, [
    id,
    onMetaChange,
    experiment?.mark,
    experiment?.title,
    student?.name,
    step,
    session.slaveConnected,
    session.token,
  ])

  const selectExperiment = useCallback((next: CheckoffExperiment) => {
    setExperiment(next)
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

  const selectStudent = useCallback((next: CheckoffStudent, nextScores: Score[]) => {
    setStudent(next)
    setActiveStartedAt(new Date().toISOString())
    setExistingScores(nextScores)
    setDrawn([])
    setMarks({})
    setQuestionIndex(0)
    setSearching(false)
    setStep(2)
  }, [])

  const discardResume = useCallback(() => {
    clearCheckoffResume(resumeKey)
    setResume(null)
    resumeState.close()
  }, [resumeKey, resumeState])

  const restoreResume = useCallback(() => {
    const snapshot = resume
    setResume(null)
    resumeState.close()
    if (!snapshot) return
    setExperiment(snapshot.experiment)
    setStudent(snapshot.student)
    setActiveStartedAt(snapshot.activeStartedAt ?? snapshot.savedAt)
    setDrawn(snapshot.drawn)
    setMarks(snapshot.marks)
    setExistingScores(snapshot.existingScores)
    setQuestionIndex(snapshot.questionIndex)
    setStep(snapshot.step)
    setSearching(false)
    setQuestionsLoaded(false)
    setQuestionsError(null)
    toast.success('已恢复，验收从机需要重新连接')
  }, [resume, resumeState])

  const startQueueStudent = useCallback(
    async (next: CheckoffStudent, experimentId: string) => {
      const target = experiments.find((item) => item.id === experimentId)
      if (!target) {
        toast.error('该学生选择的实验不在当前验收范围内')
        return
      }
      try {
        const response = await fetchCheckoff({
          classId,
          experimentId,
          includeQuestions: true,
        })
        const found = response.students.find((item) => item.userId === next.userId)
        if (!found) {
          toast.error('未找到该学生')
          return
        }
        if (experiment?.id !== target.id) {
          selectExperiment(target)
        }
        setQuestions(response.questions ?? [])
        setQuestionsLoaded(true)
        setQuestionsError(null)
        selectStudent(
          found,
          response.scores.filter((score) => score.userId === next.userId),
        )
      } catch (err) {
        toast.error(getErrorMessage(err, '开始验收失败'))
      }
    },
    [classId, experiment, experiments, selectExperiment, selectStudent],
  )

  const mark = useCallback((questionId: string, next: QuestionMark) => {
    setMarks((prev) => ({
      ...prev,
      [questionId]: prev[questionId] === next ? undefined : next,
    }))
  }, [])

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
      const current = drawn[index]
      if (student && current) {
        switchQuestion({
          studentName: student.name,
          studentAvatar: student.avatar,
          questionAuthor: current.user?.name ?? '',
          questionAuthorAvatar: current.user?.avatar ?? null,
          index,
          total: drawn.length,
          content: current.question,
        })
      }
    },
    [student, drawn, switchQuestion],
  )

  const handleSaved = useCallback(() => {
    setActiveStartedAt(null)
    clearCheckoffPresence(classId, { finished: true })
    onSaved(id)
  }, [classId, id, onSaved])

  // 向该 tab 的从机推送当前展示内容
  useEffect(() => {
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
        const current = drawn[Math.min(questionIndex, drawn.length - 1)]
        state = {
          kind: 'ask_question',
          studentName: student.name,
          studentAvatar: student.avatar,
          questionAuthor: current?.user?.name ?? '',
          questionAuthorAvatar: current?.user?.avatar ?? null,
          index: questionIndex,
          total: drawn.length,
          content: current?.question ?? '',
        }
      } else {
        state = { kind: 'ask_demo' }
      }
    } else {
      state = { kind: 'thank', studentName: student?.name }
    }
    pushState(state, checkoffMeta)
  }, [
    step,
    searching,
    experiment,
    student,
    drawn,
    questionIndex,
    checkoffMeta,
    session.token,
    pushState,
  ])

  return (
    <div className={active ? undefined : 'hidden'}>
      <div className="mb-4">
        {panelVisible ? (
          <MasterSlavePanel
            session={session}
            onHide={() => setPanelVisible(false)}
          />
        ) : (
          <Button size="sm" variant="ghost" onPress={() => setPanelVisible(true)}>
            显示从机配对信息
          </Button>
        )}
      </div>

      <StepIndicator
        step={step}
        onStep={handleStep}
        hasExperiment={Boolean(experiment)}
        hasStudent={Boolean(student)}
        experimentLabel={experiment ? `${experiment.mark} · ${experiment.title}` : null}
        studentLabel={student?.name ?? null}
        layoutId={`checkoff-step-pill-${id}`}
      />

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
              (experimentsLoading ? (
                <div className="flex h-56 items-center justify-center">
                  <Spinner size="lg" />
                </div>
              ) : (
                <ExperimentPicker experiments={experiments} onSelect={selectExperiment} />
              ))}

            {step === 1 && experiment && (
              <StudentFinder
                classId={classId}
                experimentId={experiment.id}
                reloadKey={finderReloadKey}
                includeQuestions
                autoFocus={active}
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

            {step === 2 && experiment && student && (
              <DemoStep onNext={() => setStep(3)} />
            )}

            {step === 3 && experiment && student && questionsError !== null && (
              <div className="rounded-2xl border border-danger/40 bg-danger/5 p-8 text-center">
                <p className="text-sm font-semibold text-danger">{questionsError}</p>
                <div className="mt-4">
                  <Button
                    variant="secondary"
                    size="sm"
                    isPending={!questionsLoaded}
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
                showPager
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
                active={active}
                saveLabel="保存并关闭"
              />
            )}
          </motion.div>
        </AnimatePresence>
      </div>

      {active && (
        <CheckoffQueueDrawer
          classId={classId}
          activeStudentId={student?.userId ?? null}
          activeStartedAt={activeStartedAt}
          onStart={startQueueStudent}
        />
      )}
      <CheckoffResumeDialog
        state={resumeState}
        classId={classId}
        snapshot={resume}
        onRestore={restoreResume}
        onDiscard={discardResume}
      />
    </div>
  )
}
