import { Button, Spinner } from '@heroui/react'
import { AnimatePresence, motion } from 'motion/react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { CheckoffTimer } from '@/components/checkoff/CheckoffTimer'
import { DemoStep } from '@/components/checkoff/DemoStep'
import { ExperimentPicker } from '@/components/checkoff/ExperimentPicker'
import { MasterSlavePanel } from '@/components/checkoff/MasterSlavePanel'
import { QuestionDrawer, type QuestionMark } from '@/components/checkoff/QuestionDrawer'
import { ScoreForm } from '@/components/checkoff/ScoreForm'
import { StepIndicator } from '@/components/checkoff/StepIndicator'
import { StudentFinder } from '@/components/checkoff/StudentFinder'
import {
  clearCheckoffQuestions,
  fetchCheckoff,
  shareCheckoffQuestions,
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
  type CheckoffPendingPick,
} from '@/lib/checkoff-multi'
import { getErrorMessage } from '@/lib/error'
import { DEFAULT_SCORE_RATIO, resolveScoreRatio } from '@/lib/scoring'

export type CheckoffTabMeta = {
  experimentMark: string
  experimentTitle: string
  /** 当前实验 id（排队面板定位 / 顶部排队徽标按它统计） */
  experimentId: string | null
  studentName: string
  /** 当前正在验收的学生 userId（null = 本 tab 空闲，可被排队定位复用） */
  studentUserId: string | null
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
  /** 排队面板下发到本 tab 的「切实验 + 定位学生」指令（非目标 tab 为 null） */
  pendingPick?: CheckoffPendingPick | null
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
  pendingPick = null,
  onMetaChange,
  onSaved,
}: CheckoffInstanceProps) {
  const [initial] = useState(() => loadInstanceSnapshot(id))
  const [experiment, setExperiment] = useState<CheckoffExperiment | null>(
    initial?.experiment ?? null,
  )
  const [student, setStudent] = useState<CheckoffStudent | null>(initial?.student ?? null)
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
  // 答题计时：选中学生时置为 Date.now()，换实验 / 保存 / 回步骤 ≤1 清零（每 tab 独立）
  const [answerStartedAt, setAnswerStartedAt] = useState<number | null>(
    initial?.answerStartedAt ?? null,
  )
  // 排队面板点击后预填到「定位学生」搜索框的学号
  const [finderPresetQuery, setFinderPresetQuery] = useState('')
  // 本 tab 已通知「正在验收」的学生 userId：离开时只解这个学生，避免误清同班其它 tab
  const checkingStudentRef = useRef<string | null>(null)
  // 已下发给学生的题目目标 + 防抖窗口内待发结果（见 B3 推送逻辑）
  const sharedTargetRef = useRef<{ experimentId: string; userId: string } | null>(null)
  const pendingShareRef = useRef<{
    experimentId: string
    userId: string
    questionIds: string[]
  } | null>(null)
  // 已消费的排队定位指令序号（按 seq 判重，避免重复执行 / 复渲染重复定位）
  const consumedPickSeqRef = useRef(0)

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
    saveInstanceSnapshot(id, {
      experiment,
      student,
      step,
      drawn,
      marks,
      existingScores,
      questionIndex,
      answerStartedAt,
    })
  }, [id, experiment, student, step, drawn, marks, existingScores, questionIndex, answerStartedAt])

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

  /**
   * 离开验收：只解除「本 tab 通知过的那个学生」的排队 CHECKING 状态并清空在场信息。
   * 群面里同一助教可能开着多个 tab，若用 clearCheckoffPresence(classId) 全清，
   * 切 tab 会把别的 tab 正在验收的学生一起清掉，这里必须按 studentId 精确定位。
   */
  const clearChecking = useCallback(
    (studentId?: string | null) => {
      const target = studentId ?? checkingStudentRef.current
      if (!target) return
      checkingStudentRef.current = null
      clearCheckoffPresence(classId, target)
    },
    [classId],
  )

  // 仅当前激活的 tab 维护「正在验收」状态：带上 studentId + experimentId 让后端把该学生置为 CHECKING；
  // tab 失活 / 回到步骤 ≤1 / 换学生时，只清自己通知过的那个学生
  useEffect(() => {
    if (!active) {
      clearChecking()
      return
    }
    if (student && step >= 2) {
      checkingStudentRef.current = student.userId
      notifyCheckoffStarted({
        classId,
        studentName: student.name,
        studentId: student.userId,
        experimentId: experiment?.id,
      })
      return
    }
    clearChecking()
  }, [active, classId, student, step, experiment?.id, clearChecking])

  // 关闭本 tab / 离开群面页：解除本 tab 的「验收中」状态（断线场景由后端 removeCheckoffPresence 兜底）
  useEffect(() => () => clearChecking(), [clearChecking])

  useEffect(() => {
    onMetaChange(id, {
      experimentMark: experiment?.mark ?? '',
      experimentTitle: experiment?.title ?? '',
      experimentId: experiment?.id ?? null,
      studentName: student?.name ?? '',
      studentUserId: student?.userId ?? null,
      step,
      slaveConnected: session.slaveConnected,
      token: session.token,
    })
  }, [
    id,
    onMetaChange,
    experiment?.id,
    experiment?.mark,
    experiment?.title,
    student?.name,
    student?.userId,
    step,
    session.slaveConnected,
    session.token,
  ])

  /**
   * 把本次抽到的题目同步给学生（B3）：抽题结果变化时防抖上报，失败静默（辅助功能，不打断验收）。
   * 进入评分（step 4）后保持可见，验收结束由后端自动删除；回退 / 换学生 / 换实验 / 关 tab 时收回。
   * 群面里每个 tab 独立上报自己的 (experimentId, student.userId)，互不影响。
   */
  const revokeSharedQuestions = useCallback(() => {
    const target = sharedTargetRef.current
    if (!target) return
    sharedTargetRef.current = null
    void clearCheckoffQuestions(target).catch(() => {})
  }, [])

  const pushSharedQuestions = useCallback(
    (payload: { experimentId: string; userId: string; questionIds: string[] }) => {
      const previous = sharedTargetRef.current
      if (
        previous &&
        (previous.experimentId !== payload.experimentId || previous.userId !== payload.userId)
      ) {
        void clearCheckoffQuestions(previous).catch(() => {})
      }
      sharedTargetRef.current = { experimentId: payload.experimentId, userId: payload.userId }
      void shareCheckoffQuestions(payload).catch(() => {})
    },
    [],
  )

  // 关闭 tab / 卸载本 tab 时收回（保存成绩由后端自动删除，这里重复 DELETE 是幂等的）
  useEffect(() => () => revokeSharedQuestions(), [revokeSharedQuestions])

  useEffect(() => {
    // 进入评分：把防抖窗口内还没发出去的抽题结果立刻补发（保持学生可见）
    if (step > 3) {
      const pending = pendingShareRef.current
      pendingShareRef.current = null
      if (pending) pushSharedQuestions(pending)
      return
    }
    // 未到抽题步骤 / 没有学生 / 已回到选人 → 收回之前推送的题目
    if (step < 3 || !experiment || !student) {
      pendingShareRef.current = null
      revokeSharedQuestions()
      return
    }

    const questionIds = drawn.map((question) => question.id)

    // 抽题结果被清空（重新抽题前 / 取消某题）→ 立刻收回，不必等防抖
    if (questionIds.length === 0) {
      pendingShareRef.current = null
      revokeSharedQuestions()
      return
    }

    const payload = { experimentId: experiment.id, userId: student.userId, questionIds }
    pendingShareRef.current = payload
    const timer = window.setTimeout(() => {
      pendingShareRef.current = null
      pushSharedQuestions(payload)
    }, 300)
    return () => window.clearTimeout(timer)
  }, [step, experiment, student, drawn, pushSharedQuestions, revokeSharedQuestions])

  const selectExperiment = useCallback((next: CheckoffExperiment) => {
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
    setAnswerStartedAt(null)
    // 换实验后旧的搜索预填词不再有意义（排队面板点击时会重新赋值）
    setFinderPresetQuery('')
    // 切换实验视为不再验收：解除上一个学生的「验收中」状态
    if (student) clearChecking(student.userId)
  }, [clearChecking, student])

  /**
   * 消费排队面板下发到本 tab 的定位指令：切到目标实验 + 把学号预填进「定位学生」搜索框。
   * 用 seq 判重（同一学生连点两次也要能重新定位），消费后把 seq 记下来保证幂等；
   * 不自动选中学生——助教仍需线下叫人并自行点选，避免误保存。
   */
  useEffect(() => {
    if (!pendingPick || pendingPick.seq === consumedPickSeqRef.current) return
    const target = experiments.find((item) => item.id === pendingPick.experimentId)
    // 实验列表尚未加载完 → 等 experiments 到位后再次触发
    if (!target) return
    consumedPickSeqRef.current = pendingPick.seq
    if (target.id !== experiment?.id) {
      selectExperiment(target)
    } else if (step !== 1) {
      // 当前已在验收别的学生：回到「定位学生」才能看到预填结果
      setAnswerStartedAt(null)
      setSearching(false)
      setStep(1)
    }
    setFinderPresetQuery(pendingPick.studentId)
  }, [pendingPick, experiments, experiment?.id, step, selectExperiment])

  const selectStudent = useCallback((next: CheckoffStudent, nextScores: Score[]) => {
    setStudent(next)
    setExistingScores(nextScores)
    setDrawn([])
    setMarks({})
    setQuestionIndex(0)
    setSearching(false)
    setStep(2)
    setAnswerStartedAt(Date.now())
  }, [])

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
      // 回到「选择实验 / 定位学生」视为重新选人，答题计时清零
      if (next <= 1) setAnswerStartedAt(null)
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
    // 保存后后端已删除该学生的排队记录与题目可见记录：这里只解除本 tab 的「验收中」状态，
    // 并把推送记录清空，避免关闭 tab 时再发一次无意义的收回请求
    clearChecking(student?.userId)
    sharedTargetRef.current = null
    pendingShareRef.current = null
    setAnswerStartedAt(null)
    setFinderPresetQuery('')
    onSaved(id)
  }, [clearChecking, student, id, onSaved])

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
        {/* tab 头部：本 tab 的答题计时（每个 tab 独立计时，step ≤1 时不显示） */}
        <div className="mb-2 flex min-h-6 items-center justify-end gap-2">
          <CheckoffTimer startedAt={answerStartedAt} compact />
        </div>
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
                presetQuery={finderPresetQuery}
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
                aiOral={null}
                marks={marks}
                existingScores={existingScores}
                ratio={scoreRatio}
                answerStartedAt={answerStartedAt}
                onSaved={handleSaved}
                active={active}
                saveLabel="保存并关闭"
              />
            )}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  )
}
