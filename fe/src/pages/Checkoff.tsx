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
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { toast } from 'sonner'

import ArrowLeft from '~icons/lucide/arrow-left'
import { CheckoffQueuePanel } from '@/components/checkoff/CheckoffQueuePanel'
import { CheckoffTimer, formatElapsed } from '@/components/checkoff/CheckoffTimer'
import { DemoStep } from '@/components/checkoff/DemoStep'
import { CustomCardRail } from '@/components/checkoff/CustomCardRail'
import { ExperimentPicker } from '@/components/checkoff/ExperimentPicker'
import { MasterSlavePanel } from '@/components/checkoff/MasterSlavePanel'
import { PreferenceOnboarding } from '@/components/checkoff/PreferenceOnboarding'
import { QuestionDrawer, type QuestionMark } from '@/components/checkoff/QuestionDrawer'
import { ScoreForm } from '@/components/checkoff/ScoreForm'
import { SpecialDrawIntroModal } from '@/components/checkoff/SpecialDrawIntroModal'
import { StepIndicator } from '@/components/checkoff/StepIndicator'
import { StudentFinder } from '@/components/checkoff/StudentFinder'
import Dices from '~icons/lucide/dices'
import Eye from '~icons/lucide/eye'
import EyeOff from '~icons/lucide/eye-off'
import ListOrdered from '~icons/lucide/list-ordered'
import MoreHorizontal from '~icons/lucide/more-horizontal'
import NotebookText from '~icons/lucide/notebook-text'
import School from '~icons/lucide/school'
import Settings2 from '~icons/lucide/settings-2'
import Users from '~icons/lucide/users'
import { AvatarImage } from '@/components/ui/AvatarImage'
import { EmptyState } from '@/components/ui/Card'
import { IconAction } from '@/components/ui/IconAction'
import { Markdown } from '@/components/ui/Markdown'
import {
  fetchBankQuestions,
  fetchCheckoff,
  fetchCheckoffRecords,
  fetchClassSettings,
  listBanks,
  type CheckoffExperiment,
  type CheckoffQuestion,
  type CheckoffQueueEntry,
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
  useCheckoffQueue,
  useCheckoffWatch,
  type CheckoffMeta,
  type CheckoffStartedEvent,
  type SlaveCardState,
} from '@/lib/checkoff-socket'
import {
  createDefaultCustomCards,
  type CustomCard,
} from '@/lib/custom-cards'
import { getErrorMessage } from '@/lib/error'
import { formatLocaleDateTime } from '@/lib/format'
import { SCORE_TYPES } from '@/lib/scores'
import { DEFAULT_SCORE_RATIO, resolveScoreRatio, type ScoreRatio } from '@/lib/scoring'
import {
  clearSpecialDrawMachine,
  loadSpecialDrawBanks,
  loadSpecialDrawMachine,
  runSpecialDrawMachine,
  SPECIAL_DRAW_STORAGE_KEY,
  type SpecialDrawBank,
  type SpecialDrawMachine,
} from '@/lib/special-draw'
import { useCurrentClass } from '@/lib/store'
import { cn } from '@/lib/utils'

/** 分数类型 → 中文标签 */
const TYPE_LABELS = new Map<number, string>(
  SCORE_TYPES.map((type) => [type.value, type.label]),
)

/** 「跟随实验设置」在题目集下拉中的哨兵值 */
const FOLLOW_BANK = '__follow__'

function CheckoffLayout({
  children,
  actions,
}: {
  children: ReactNode
  actions?: ReactNode
}) {
  return (
    <div className="flex h-dvh flex-col overflow-hidden">
      <header className="flex h-14 shrink-0 items-center gap-3 border-b border-line bg-elevated/60 px-4 backdrop-blur-xl">
        <Link
          to="/console"
          className="inline-flex items-center gap-1 text-xs font-semibold text-fg-subtle transition-colors hover:text-fg"
        >
          <ArrowLeft width={14} height={14} className="shrink-0" />
          返回
        </Link>
        <div className="h-5 w-px bg-line" />
        <div className="min-w-0 flex-1 truncate text-sm font-bold">验收</div>
        {actions && <div className="flex shrink-0 items-center gap-1">{actions}</div>}
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-4xl px-4 py-6">{children}</div>
      </div>
    </div>
  )
}

export default function Checkoff() {
  const currentClass = useCurrentClass()
  const { user, loading: authLoading, updatePreferences } = useAuth()
  const classId = currentClass?.id
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
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
  const [specialMachine, setSpecialMachine] = useState<SpecialDrawMachine | null>(
    loadSpecialDrawMachine,
  )
  const [specialBanks, setSpecialBanks] = useState<SpecialDrawBank[]>([])
  const [specialLoading, setSpecialLoading] = useState(specialMachine !== null)
  const [specialError, setSpecialError] = useState<string | null>(null)
  const [masterPanelVisible, setMasterPanelVisible] = useState(true)
  const [customCardActive, setCustomCardActive] = useState(false)
  const [selectedCustomCard, setSelectedCustomCard] = useState<CustomCard | null>(null)
  const [activeCustomCardSlotId, setActiveCustomCardSlotId] = useState<string | null>(null)
  const [cardRailOpen, setCardRailOpen] = useState(false)
  // 答题计时：选中学生时置为 Date.now()，换实验 / 保存后清零
  const [answerStartedAt, setAnswerStartedAt] = useState<number | null>(null)
  // 排队面板点击某条后，把该学生学号预填进「定位学生」的搜索框
  const [finderPresetQuery, setFinderPresetQuery] = useState('')

  const prefsState = useOverlayState()
  const presenceState = useOverlayState()
  const queueState = useOverlayState()
  const bankState = useOverlayState()
  const specialDrawState = useOverlayState()
  const customCardState = useOverlayState()
  const { bankId: bankOverrideId, save: saveBankOverride } = useCheckoffBankOverride()

  const isMulti = user?.preferences?.device === 'multi'
  const master = useCheckoffMaster(isMulti, user?.id)
  const { resolvedTheme } = useTheme()

  const markdownStyle = user?.preferences?.markdownStyle ?? 'github'
  const theme: 'light' | 'dark' = resolvedTheme === 'dark' ? 'dark' : 'light'

  const checkoffMeta = useMemo<CheckoffMeta>(
    () => ({
      markdownStyle,
      theme,
      grader: { name: user?.name ?? '', avatar: user?.avatar ?? null },
      student: student ? { name: student.name, avatar: student.avatar } : null,
    }),
    [markdownStyle, theme, user?.name, user?.avatar, student],
  )

  const scoreRatio: ScoreRatio = useMemo(
    () => (experiment ? resolveScoreRatio(classSettings, experiment.id) : DEFAULT_SCORE_RATIO),
    [classSettings, experiment],
  )

  const specialQuestionList = useMemo(() => {
    if (!specialMachine) return []
    const seen = new Set<string>()
    const list: CheckoffQuestion[] = []
    for (const bank of specialBanks) {
      for (const question of bank.questions) {
        if (seen.has(question.id)) continue
        seen.add(question.id)
        list.push(question)
      }
    }
    return list
  }, [specialMachine, specialBanks])

  const pickSpecialQuestions = useCallback(() => {
    if (!specialMachine) return []
    const result = runSpecialDrawMachine(specialMachine, specialBanks)
    if (result.error) {
      toast.error(result.error)
      return []
    }
    return result.questions
  }, [specialMachine, specialBanks])

  const handleCheckoffStarted = useCallback((event: CheckoffStartedEvent) => {
    herouiToast(`${event.userName}正在验收${event.studentName}。`, { timeout: 10000 })
  }, [])

  const peers = useCheckoffWatch(classId, handleCheckoffStarted)

  // 排队快照：REST 初始 + checkoff:queue 实时替换
  const {
    entries: queueEntries,
    loading: queueLoading,
    reload: reloadQueue,
  } = useCheckoffQueue(classId)

  // 徽标优先显示当前实验的排队人数；未选实验时显示全班人数
  const queueCount = useMemo(
    () =>
      experiment
        ? queueEntries.filter((entry) => entry.experimentId === experiment.id).length
        : queueEntries.length,
    [queueEntries, experiment],
  )

  const openQueue = useCallback(() => {
    queueState.open()
    reloadQueue()
  }, [queueState, reloadQueue])

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
            user: question.user,
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

  useEffect(() => {
    if (!specialMachine) {
      setSpecialBanks([])
      setSpecialError(null)
      setSpecialLoading(false)
      return
    }

    let cancelled = false
    setSpecialLoading(true)
    setSpecialError(null)
    loadSpecialDrawBanks(specialMachine)
      .then((banks) => {
        if (cancelled) return
        setSpecialBanks(banks)
      })
      .catch((error) => {
        if (cancelled) return
        setSpecialBanks([])
        setSpecialError(getErrorMessage(error, '加载特殊抽题题目失败'))
      })
      .finally(() => {
        if (!cancelled) setSpecialLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [specialMachine, finderReloadKey])

  const loadBanks = useCallback(() => {
    listBanks()
      .then((res) => setBanks(res.banks))
      .catch((error) => toast.error(getErrorMessage(error, '加载题目集失败')))
  }, [])

  const openBankPicker = useCallback(() => {
    bankState.open()
    setDraftBank(bankOverrideId)
    loadBanks()
  }, [bankState, bankOverrideId, loadBanks])

  const openSpecialDrawIntro = useCallback(() => {
    specialDrawState.open()
  }, [specialDrawState])

  const openSpecialDrawEditor = useCallback(() => {
    navigate('/console/checkoff/special')
  }, [navigate])

  const applySpecialDrawMachine = useCallback(
    (machine: SpecialDrawMachine) => {
      saveBankOverride(null)
      setSpecialMachine(machine)
      setDrawn([])
      setMarks({})
      setQuestionIndex(0)
    },
    [saveBankOverride],
  )

  const resetSpecialDraw = useCallback(() => {
    clearSpecialDrawMachine()
    setSpecialMachine(null)
    setSpecialBanks([])
    setSpecialError(null)
    setSpecialLoading(false)
    setDrawn([])
    setMarks({})
    setQuestionIndex(0)
    toast.success('已恢复默认抽题方式')
  }, [])

  const resetBankOverride = useCallback(() => {
    saveBankOverride(null)
    setDraftBank(null)
    toast.success('已恢复默认题目集')
  }, [saveBankOverride])

  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key === SPECIAL_DRAW_STORAGE_KEY) {
        const next = loadSpecialDrawMachine()
        setSpecialMachine(next)
        if (next) saveBankOverride(null)
        setDrawn([])
        setMarks({})
        setQuestionIndex(0)
      }
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [saveBankOverride])

  const confirmBankOverride = useCallback(() => {
    saveBankOverride(draftBank)
    if (draftBank) {
      clearSpecialDrawMachine()
      setSpecialMachine(null)
      setSpecialBanks([])
      setSpecialError(null)
      setSpecialLoading(false)
      setDrawn([])
      setMarks({})
      setQuestionIndex(0)
    }
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
    setAnswerStartedAt(null)
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
      setAnswerStartedAt(Date.now())
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
    setAnswerStartedAt(null)
    setFinderPresetQuery('')
    if (classId) clearCheckoffPresence(classId)
  }, [classId])

  // 排队面板点击某条：先切到对应实验，再把学号预填进「定位学生」搜索框。
  // 不自动选中学生——助教仍需线下叫人并自行点选，避免误保存。
  const handlePickQueueEntry = useCallback(
    (entry: CheckoffQueueEntry) => {
      queueState.close()
      if (entry.experimentId !== experiment?.id) {
        const match = experiments.find((item) => item.id === entry.experimentId)
        if (match) void selectExperiment(match)
      } else if (step !== 1) {
        // 当前已在验收别的学生：回到「定位学生」才能看到预填结果（当前学生未保存的录入会被放弃）
        setAnswerStartedAt(null)
        setSearching(false)
        setStep(1)
      }
      setFinderPresetQuery(entry.studentId)
      toast.success(`已定位到 ${entry.name}`)
    },
    [experiment, experiments, queueState, selectExperiment, step],
  )

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
      if (isMulti && student && drawn[index] && !customCardActive) {
        master.switchQuestion({
          studentName: student.name,
          studentAvatar: student.avatar,
          questionAuthor: drawn[index].user?.name ?? '',
          questionAuthorAvatar: drawn[index].user?.avatar ?? null,
          index,
          total: drawn.length,
          content: drawn[index].question,
        })
      }
    },
    [isMulti, customCardActive, student, drawn, master.switchQuestion],
  )

  const showCustomCard = useCallback(
    (slotId: string, card: CustomCard) => {
      setSelectedCustomCard(card)
      setActiveCustomCardSlotId(slotId)
      if (!isMulti) {
        customCardState.open()
        return
      }
      setCustomCardActive(true)
      master.pushState(
        { kind: 'custom_card', title: '', content: card.content },
        checkoffMeta,
      )
      toast.success('已切换到自定义 Card')
    },
    [isMulti, customCardState, master.pushState, checkoffMeta],
  )

  const cancelCustomCard = useCallback(() => {
    setCustomCardActive(false)
    setSelectedCustomCard(null)
    setActiveCustomCardSlotId(null)
    customCardState.close()
    toast.success('已取消自定义 Card')
  }, [customCardState])

  useEffect(() => {
    if (!isMulti || customCardActive) return
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
          studentAvatar: student.avatar,
          questionAuthor:
            drawn[Math.min(questionIndex, drawn.length - 1)]?.user?.name ?? '',
          questionAuthorAvatar:
            drawn[Math.min(questionIndex, drawn.length - 1)]?.user?.avatar ?? null,
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
    master.pushState(state, checkoffMeta)
  }, [
    isMulti,
    customCardActive,
    step,
    searching,
    experiment,
    student,
    drawn,
    questionIndex,
    checkoffMeta,
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
      <CheckoffLayout>
        <div className="flex h-64 items-center justify-center">
          <Spinner size="lg" />
        </div>
      </CheckoffLayout>
    )
  }

  if (!currentClass) {
    return (
      <CheckoffLayout>
        <EmptyState icon={School} title="尚未绑定班级" hint="请先在设置中绑定班级" />
      </CheckoffLayout>
    )
  }

  if (!user) return null

  if (user.preferences == null) {
    return (
      <CheckoffLayout>
        <div className="flex min-h-[70vh] items-center justify-center">
          <div className="w-full max-w-xl">
            <PreferenceOnboarding initial={null} onSubmit={savePreferences} />
          </div>
        </div>
      </CheckoffLayout>
    )
  }

  const preferences = user.preferences
  const bankOverrideName = banks.find((bank) => bank.id === bankOverrideId)?.name
  const customCards = preferences.customCards ?? createDefaultCustomCards()
  const customCardById = new Map(customCards.cards.map((card) => [card.id, card]))
  const activeCustomCardSlots = customCards.slots.flatMap((slot) => {
    const card = slot.cardId ? customCardById.get(slot.cardId) : null
    return card ? [{ slot, card }] : []
  })
  const activeQuestions = specialMachine ? specialQuestionList : questions
  const activeQuestionsLoading = specialMachine ? specialLoading : !questionsLoaded
  const activeQuestionsError = specialMachine ? specialError : questionsError

  return (
    <CheckoffLayout
      actions={
        <>
            <div className="relative">
              <IconAction label="排队情况" onPress={openQueue}>
                <ListOrdered width={15} height={15} className="shrink-0" />
              </IconAction>
              {queueCount > 0 && (
                <span className="tabular pointer-events-none absolute -right-1 -top-1 z-10 flex h-4 min-w-4 items-center justify-center rounded-full bg-brand-600 px-1 text-[10px] font-bold leading-none text-white">
                  {queueCount > 99 ? '99+' : queueCount}
                </span>
              )}
            </div>
            {step >= 2 && <CheckoffTimer startedAt={answerStartedAt} />}
            <IconAction label="偏好" onPress={prefsState.open}>
              <Settings2 width={15} height={15} className="shrink-0" />
            </IconAction>
            <Dropdown>
              <Dropdown.Trigger
                className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-fg-muted transition-colors hover:bg-sunken hover:text-fg"
                aria-label="更多"
              >
                <MoreHorizontal width={16} height={16} className="shrink-0" />
              </Dropdown.Trigger>
              <Dropdown.Popover className="min-w-[220px]">
                <Dropdown.Menu
                  onAction={(key) => {
                    if (key === 'presence') openPresence()
                    else if (key === 'bank') openBankPicker()
                    else if (key === 'special') openSpecialDrawIntro()
                    else if (key === 'master-panel') setMasterPanelVisible((visible) => !visible)
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
                  <Dropdown.Item id="special" textValue="特殊的抽题方式">
                    <Dices width={15} height={15} className="shrink-0 text-fg-muted" />
                    <Label>特殊的抽题方式</Label>
                  </Dropdown.Item>
                  {isMulti && (
                    <Dropdown.Item
                      id="master-panel"
                      textValue={
                        masterPanelVisible ? '隐藏从机配对信息' : '显示从机配对信息'
                      }
                    >
                      {masterPanelVisible ? (
                        <EyeOff width={15} height={15} className="shrink-0 text-fg-muted" />
                      ) : (
                        <Eye width={15} height={15} className="shrink-0 text-fg-muted" />
                      )}
                      <Label>
                        {masterPanelVisible ? '隐藏从机配对信息' : '显示从机配对信息'}
                      </Label>
                    </Dropdown.Item>
                  )}
                </Dropdown.Menu>
              </Dropdown.Popover>
            </Dropdown>
          </>
      }
    >

      {isMulti && masterPanelVisible && (
        <div className="mb-4">
          <MasterSlavePanel
            session={master.session}
            onHide={() => setMasterPanelVisible(false)}
          />
        </div>
      )}

      {specialMachine && (
        <div className="mb-4 flex flex-wrap items-center gap-2 rounded-xl border border-brand-500/25 bg-brand-500/5 px-3 py-2 text-xs">
          <Dices width={15} height={15} className="shrink-0 text-brand-600 dark:text-brand-300" />
          <span className="font-semibold text-fg">特殊的抽题方式已启用</span>
          <div className="ml-auto flex items-center gap-1">
            <Button size="sm" variant="ghost" onPress={openSpecialDrawIntro}>
              编辑
            </Button>
            <Button size="sm" variant="ghost" onPress={resetSpecialDraw}>
              恢复默认
            </Button>
          </div>
        </div>
      )}

      {bankOverrideId && !specialMachine && (
        <div className="mb-4 flex flex-wrap items-center gap-2 rounded-xl border border-brand-500/25 bg-brand-500/5 px-3 py-2 text-xs">
          <NotebookText
            width={15}
            height={15}
            className="shrink-0 text-brand-600 dark:text-brand-300"
          />
          <span className="font-semibold text-fg">已使用其它题目集</span>
          {bankOverrideName && <span className="text-fg-muted">{bankOverrideName}</span>}
          <div className="ml-auto flex items-center gap-1">
            <Button size="sm" variant="ghost" onPress={openBankPicker}>
              编辑
            </Button>
            <Button size="sm" variant="ghost" onPress={resetBankOverride}>
              恢复默认
            </Button>
          </div>
        </div>
      )}

      <div className="relative">
        <StepIndicator
          step={step}
          onStep={handleStep}
          hasExperiment={Boolean(experiment)}
          hasStudent={Boolean(student)}
        />
        {activeCustomCardSlots.length > 0 && (
          <div className="z-20 mt-3 lg:absolute lg:left-full lg:top-0 lg:ml-3 lg:mt-0">
            <CustomCardRail
              customCards={customCards}
              open={cardRailOpen}
              activeSlotId={activeCustomCardSlotId}
              markdownStyle={markdownStyle}
              onToggle={() => setCardRailOpen((open) => !open)}
              onShow={showCustomCard}
              onCancel={cancelCustomCard}
            />
          </div>
        )}
      </div>

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
            {step === 2 && experiment && student && <DemoStep onNext={() => setStep(3)} />}
            {step === 3 && experiment && student && activeQuestionsError !== null && (
              <div className="rounded-2xl border border-danger/40 bg-danger/5 p-8 text-center">
                <p className="text-sm font-semibold text-danger">{activeQuestionsError}</p>
                <div className="mt-4">
                  <Button
                    variant="secondary"
                    size="sm"
                    isPending={activeQuestionsLoading}
                    onPress={() => {
                      setQuestionsError(null)
                      setSpecialError(null)
                      setFinderReloadKey((key) => key + 1)
                    }}
                  >
                    重试
                  </Button>
                </div>
              </div>
            )}
            {step === 3 && experiment && student && activeQuestionsError === null && (
              <QuestionDrawer
                mode={specialMachine ? 'random' : preferences.draw}
                questions={activeQuestions}
                drawn={drawn}
                onDrawnChange={setDrawn}
                marks={marks}
                onMark={mark}
                drawCount={preferences.drawCount}
                drawQuestions={specialMachine ? pickSpecialQuestions : undefined}
                onNext={() => setStep(4)}
                onSkip={() => setStep(4)}
                student={student}
                loading={activeQuestionsLoading}
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
                answerStartedAt={answerStartedAt}
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
      <Modal
        state={customCardState}
        onOpenChange={(open) => {
          customCardState.setOpen(open)
          if (!open) {
            setSelectedCustomCard(null)
            setActiveCustomCardSlotId(null)
          }
        }}
      >
        <Modal.Backdrop>
          <Modal.Container>
            <Modal.Dialog className="sm:max-w-2xl">
              <Modal.CloseTrigger />
              <Modal.Header>
                <Modal.Icon className="bg-brand-500/10 text-brand-600 dark:text-brand-300">
                  <NotebookText width={18} height={18} className="shrink-0" />
                </Modal.Icon>
                <Modal.Heading>自定义 Card</Modal.Heading>
              </Modal.Header>
              <Modal.Body>
                {selectedCustomCard?.content.trim() ? (
                  <Markdown source={selectedCustomCard.content} style={markdownStyle} />
                ) : (
                  <p className="py-8 text-center text-sm text-fg-subtle">这张 Card 暂无内容</p>
                )}
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
                        <AvatarImage
                          id={peer.avatar}
                          size={32}
                          fallback={peer.name.slice(0, 1)}
                        />
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
                        key={`${record.userId}-${record.type}-${record.updatedAt}-${index}`}
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
                            {record.durationMs != null &&
                              ` · 用时 ${formatElapsed(record.durationMs)}`}
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
      <Modal state={queueState}>
        <Modal.Backdrop>
          <Modal.Container>
            <Modal.Dialog className="sm:max-w-lg">
              <Modal.CloseTrigger />
              <Modal.Header>
                <Modal.Icon className="bg-brand-500/10 text-brand-600 dark:text-brand-300">
                  <ListOrdered width={18} height={18} className="shrink-0" />
                </Modal.Icon>
                <Modal.Heading>排队情况</Modal.Heading>
              </Modal.Header>
              <Modal.Body>
                <CheckoffQueuePanel
                  entries={queueEntries}
                  loading={queueLoading}
                  currentExperimentId={experiment?.id ?? null}
                  onPick={handlePickQueueEntry}
                  onRefresh={reloadQueue}
                />
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
      <SpecialDrawIntroModal
        state={specialDrawState}
        onEdit={openSpecialDrawEditor}
        onApplied={applySpecialDrawMachine}
      />
    </CheckoffLayout>
  )
}
