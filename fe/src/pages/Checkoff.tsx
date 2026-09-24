import { Button, Modal, Spinner, toast as herouiToast, useOverlayState } from '@heroui/react'
import { AnimatePresence, motion } from 'motion/react'
import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'

import { DemoStep } from '@/components/checkoff/DemoStep'
import { ExperimentPicker } from '@/components/checkoff/ExperimentPicker'
import { MasterSlavePanel } from '@/components/checkoff/MasterSlavePanel'
import { PreferenceOnboarding } from '@/components/checkoff/PreferenceOnboarding'
import { QuestionDrawer, type QuestionMark } from '@/components/checkoff/QuestionDrawer'
import { ScoreForm } from '@/components/checkoff/ScoreForm'
import { StepIndicator } from '@/components/checkoff/StepIndicator'
import { StudentFinder } from '@/components/checkoff/StudentFinder'
import School from '~icons/lucide/school'
import Settings2 from '~icons/lucide/settings-2'
import { EmptyState } from '@/components/ui/Card'
import { PageHeader } from '@/components/ui/PageHeader'
import {
  fetchCheckoff,
  fetchCheckoffQuestions,
  type CheckoffExperiment,
  type CheckoffQuestion,
  type CheckoffStudent,
  type Score,
  type UserPreferences,
} from '@/lib/api'
import { useAuth } from '@/lib/auth'
import {
  notifyCheckoffStarted,
  useCheckoffMaster,
  useCheckoffWatch,
  type CheckoffStartedEvent,
  type SlaveCardState,
} from '@/lib/checkoff-socket'
import { useCurrentClass } from '@/lib/store'

export default function Checkoff() {
  const currentClass = useCurrentClass()
  const { user, loading: authLoading, updatePreferences } = useAuth()
  const classId = currentClass?.id

  const [experiments, setExperiments] = useState<CheckoffExperiment[]>([])
  const [loading, setLoading] = useState(true)
  const [experiment, setExperiment] = useState<CheckoffExperiment | null>(null)
  const [student, setStudent] = useState<CheckoffStudent | null>(null)
  const [questions, setQuestions] = useState<CheckoffQuestion[]>([])
  const [questionsLoading, setQuestionsLoading] = useState(false)
  const [drawn, setDrawn] = useState<CheckoffQuestion[]>([])
  const [marks, setMarks] = useState<Record<string, QuestionMark | undefined>>({})
  const [existingScores, setExistingScores] = useState<Score[]>([])
  const [step, setStep] = useState(0)
  const [nameAsked, setNameAsked] = useState(false)
  const [questionIndex, setQuestionIndex] = useState(0)

  const prefsState = useOverlayState()

  const isMulti = user?.preferences?.device === 'multi'
  const master = useCheckoffMaster(isMulti, user?.id)

  const handleCheckoffStarted = useCallback((event: CheckoffStartedEvent) => {
    herouiToast(`${event.userName}正在验收${event.studentName}。`, { timeout: 10000 })
  }, [])

  useCheckoffWatch(classId, handleCheckoffStarted)

  useEffect(() => {
    if (!classId) return
    let cancelled = false
    setLoading(true)
    fetchCheckoff({ classId })
      .then((res) => {
        if (!cancelled) setExperiments(res.experiments)
      })
      .catch((error) => {
        if (!cancelled) toast.error(error instanceof Error ? error.message : '加载失败')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
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
    setQuestionIndex(0)
    setNameAsked(false)
    setStep(1)
    setQuestionsLoading(true)
    try {
      const res = await fetchCheckoffQuestions(next.id)
      setQuestions(res.questions)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '加载题目失败')
    } finally {
      setQuestionsLoading(false)
    }
  }, [])

  const selectStudent = useCallback(
    (next: CheckoffStudent, nextScores: Score[]) => {
      setStudent(next)
      setExistingScores(nextScores)
      setDrawn([])
      setMarks({})
      setQuestionIndex(0)
      setNameAsked(false)
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
    setNameAsked(false)
    setStep(1)
  }, [])

  const handleStep = useCallback((next: number) => {
    if (next === 1) setNameAsked(false)
    setStep(next)
  }, [])

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
      state = nameAsked
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
    master.pushState(state)
  }, [isMulti, step, nameAsked, experiment, student, drawn, questionIndex])

  const savePreferences = useCallback(
    async (prefs: UserPreferences) => {
      try {
        await updatePreferences(prefs)
        toast.success('偏好已保存')
        prefsState.close()
      } catch (error) {
        toast.error(error instanceof Error ? error.message : '保存失败')
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
          <Button size="sm" variant="ghost" onPress={prefsState.open}>
            <Settings2 width={15} height={15} className="shrink-0" />
            偏好
          </Button>
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
                onSelect={selectStudent}
                onSearchBlur={() => {
                  if (step === 1) setNameAsked(true)
                }}
              />
            )}
            {step === 2 && experiment && student && <DemoStep onNext={() => setStep(3)} />}
            {step === 3 && experiment && student && (
              <QuestionDrawer
                mode={preferences.draw}
                questions={questions}
                drawn={drawn}
                onDrawnChange={setDrawn}
                marks={marks}
                onMark={mark}
                onNext={() => setStep(4)}
                onSkip={() => setStep(4)}
                student={student}
                loading={questionsLoading}
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
                onSaved={handleSaved}
              />
            )}
          </motion.div>
        </AnimatePresence>
      </div>

      <Modal state={prefsState}>
        <Modal.Backdrop>
          <Modal.Container>
            <Modal.Dialog className="sm:max-w-xl">
              <Modal.CloseTrigger />
              <Modal.Body>
                <PreferenceOnboarding
                  initial={preferences}
                  onSubmit={savePreferences}
                  onCancel={prefsState.close}
                />
              </Modal.Body>
            </Modal.Dialog>
          </Modal.Container>
        </Modal.Backdrop>
      </Modal>
    </div>
  )
}
