import { Button, Skeleton, useOverlayState } from '@heroui/react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { toast } from 'sonner'
import ArrowLeft from '~icons/lucide/arrow-left'
import ClipboardCheck from '~icons/lucide/clipboard-check'
import FlaskConical from '~icons/lucide/flask-conical'

import { ExperimentBankSection } from '@/components/experiments/ExperimentBankSection'
import { ExperimentBindHomeworkModal } from '@/components/experiments/ExperimentBindHomeworkModal'
import { ExperimentPreferencesModal } from '@/components/experiments/ExperimentPreferencesModal'
import { ExperimentScoreTable } from '@/components/experiments/ExperimentScoreTable'
import { ExperimentScoringSection } from '@/components/experiments/ExperimentScoringSection'
import { ExperimentTimelineSection } from '@/components/experiments/ExperimentTimelineSection'
import { ExperimentXzzdSection } from '@/components/experiments/ExperimentXzzdSection'
import { QuestionBankPickerModal } from '@/components/questions/QuestionBankPickerModal'
import { EmptyState } from '@/components/ui/Card'
import { PageHeader } from '@/components/ui/PageHeader'
import {
  apiFetch,
  fetchCheckoff,
  fetchClassSettings,
  fetchClassTables,
  listBanks,
  updateClassSettings,
  updateExperiment,
  type CheckoffStudent,
  type ClassSettings,
  type Experiment,
  type QuestionBank,
} from '@/lib/api'
import { getErrorMessage } from '@/lib/error'
import { scoreKey } from '@/lib/scores'
import { DEFAULT_SCORE_RATIO, resolveScoreRatio } from '@/lib/scoring'
import { useDebouncedSave } from '@/lib/use-class-settings'

export default function ExperimentDetail({ readonly = false }: { readonly?: boolean }) {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [experiment, setExperiment] = useState<Experiment | null>(null)
  const [banks, setBanks] = useState<QuestionBank[]>([])
  const [students, setStudents] = useState<CheckoffStudent[]>([])
  const [scores, setScores] = useState<Map<string, number>>(new Map())
  const [settings, setSettings] = useState<ClassSettings | null>(null)
  const [ratio, setRatio] = useState<number[]>(DEFAULT_SCORE_RATIO)
  const [savingRatio, setSavingRatio] = useState(false)
  const [loading, setLoading] = useState(true)
  const [binding, setBinding] = useState(false)

  const [publishDraft, setPublishDraft] = useState<string | null>(null)
  const [checkoffDeadlineDraft, setCheckoffDeadlineDraft] = useState<string | null>(null)
  const [reportDeadlineDraft, setReportDeadlineDraft] = useState<string | null>(null)
  const [savingTimeline, setSavingTimeline] = useState(false)
  const [editingTimeline, setEditingTimeline] = useState(false)

  const bindState = useOverlayState()
  const preferencesState = useOverlayState()
  const banksState = useOverlayState()

  const load = useCallback(async (experimentId: string) => {
    if (readonly) {
      const detail = await apiFetch<{ experiment: Experiment }>(`/api/experiments/${experimentId}`)
      const [settingsRes, tables] = await Promise.all([
        fetchClassSettings(detail.experiment.classId),
        fetchClassTables(detail.experiment.classId),
      ])
      setExperiment(detail.experiment)
      setSettings(settingsRes.settings)
      setRatio(resolveScoreRatio(settingsRes.settings, experimentId))
      setStudents(
        tables.students.map((student) => ({
          userId: student.userId,
          name: student.name,
          studentId: student.studentId,
          avatar: null,
        })),
      )
      setScores(
        new Map(
          tables.scores.map((item) => [scoreKey(item.userId, item.type, item.indId), item.score]),
        ),
      )
      return
    }

    const [detail, bankData] = await Promise.all([
      apiFetch<{ experiment: Experiment }>(`/api/experiments/${experimentId}`),
      listBanks(),
    ])
    setExperiment(detail.experiment)
    setBanks(bankData.banks)
    setPublishDraft(detail.experiment.publishTime)
    setCheckoffDeadlineDraft(detail.experiment.checkoffDeadline)
    setReportDeadlineDraft(detail.experiment.reportDeadline)

    const [checkoff, settingsRes] = await Promise.all([
      fetchCheckoff({ classId: detail.experiment.classId, experimentId }),
      fetchClassSettings(detail.experiment.classId),
    ])
    setSettings(settingsRes.settings)
    setRatio(resolveScoreRatio(settingsRes.settings, experimentId))
    setStudents(checkoff.students)
    setScores(
      new Map(
        checkoff.scores.map((item) => [
          scoreKey(item.userId, item.type, item.indId),
          item.score,
        ]),
      ),
    )
  }, [readonly])

  useEffect(() => {
    if (!id) return
    let cancelled = false
    const run = async () => {
      try {
        await load(id)
      } catch (error) {
        if (!cancelled) toast.error(getErrorMessage(error, '加载失败'))
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    run()
    return () => {
      cancelled = true
    }
  }, [id, load])

  const experimentRef = useRef<Experiment | null>(null)
  useEffect(() => {
    experimentRef.current = experiment
  }, [experiment])

  const ratioSave = useDebouncedSave(async () => {
    const current = experimentRef.current
    if (!current) return
    setSavingRatio(true)
    try {
      await updateClassSettings(current.classId, {
        experimentScoreRatios: { [current.id]: ratio },
      })
    } catch (error) {
      toast.error(getErrorMessage(error, '保存评分占比失败'))
      throw error
    } finally {
      setSavingRatio(false)
    }
  }, 700)

  const bind = async (bankId: string) => {
    if (!experiment) return
    setBinding(true)
    try {
      const { experiment: updated } = await updateExperiment(experiment.id, {
        questionBankId: bankId || null,
      })
      setExperiment(updated)
      toast.success(bankId ? '已绑定题目集' : '已解绑题目集')
    } catch (error) {
      toast.error(getErrorMessage(error, '操作失败'))
    } finally {
      setBinding(false)
    }
  }

  const selectBank = async (bankId: string) => {
    await bind(bankId)
    banksState.close()
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-4xl space-y-3">
        <Skeleton className="h-16 rounded-2xl" />
        <Skeleton className="h-32 rounded-2xl" />
        <Skeleton className="h-64 rounded-2xl" />
      </div>
    )
  }

  if (!experiment) {
    return (
      <div className="mx-auto max-w-4xl">
        <EmptyState icon={FlaskConical} title="实验不存在" hint="它可能已被删除" />
      </div>
    )
  }

  const bank = experiment.questionBank
  const bankQuestionCount = bank
    ? (banks.find((item) => item.id === bank.id)?.questions.length ?? null)
    : null

  // 下拉框只展示最近添加/更新的题目集 Top10（附带当前已绑定项），了解更多走弹窗
  const recentBanks = [...banks]
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, 10)
  if (bank && !recentBanks.some((item) => item.id === bank.id)) {
    const bound = banks.find((item) => item.id === bank.id)
    if (bound) recentBanks.push(bound)
  }

  const xzzdBoundCount = [experiment.xzzdBindIdCheckout, experiment.xzzdBindIdReport].filter(
    Boolean,
  ).length

  const unifiedRatio = settings?.scoreRatioUnified ?? false

  const dirty =
    experiment !== null &&
    (experiment.publishTime !== publishDraft ||
      experiment.checkoffDeadline !== checkoffDeadlineDraft ||
      experiment.reportDeadline !== reportDeadlineDraft)

  const hasTimeline =
    experiment !== null &&
    Boolean(experiment.publishTime || experiment.checkoffDeadline || experiment.reportDeadline)

  const showTimelineEditor = !readonly && (editingTimeline || !hasTimeline)

  const cancelEditTimeline = () => {
    if (experiment) {
      setPublishDraft(experiment.publishTime)
      setCheckoffDeadlineDraft(experiment.checkoffDeadline)
      setReportDeadlineDraft(experiment.reportDeadline)
    }
    setEditingTimeline(false)
  }

  const saveTimeline = async () => {
    if (!experiment || !dirty) return
    setSavingTimeline(true)
    try {
      const { experiment: updated } = await updateExperiment(experiment.id, {
        publishTime: publishDraft,
        checkoffDeadline: checkoffDeadlineDraft,
        reportDeadline: reportDeadlineDraft,
      })
      setExperiment(updated)
      setPublishDraft(updated.publishTime)
      setCheckoffDeadlineDraft(updated.checkoffDeadline)
      setReportDeadlineDraft(updated.reportDeadline)
      setEditingTimeline(false)
      toast.success('时间线已保存')
    } catch (error) {
      toast.error(getErrorMessage(error, '保存失败'))
    } finally {
      setSavingTimeline(false)
    }
  }

  const changeRatio = (next: number[]) => {
    ratioSave.schedule()
    setRatio(next)
  }

  return (
    <div className="mx-auto max-w-4xl">
      <Link
        to={readonly ? '/viewer/experiments' : '/console/experiments'}
        className="mb-3 inline-flex items-center gap-1 text-xs font-semibold text-fg-subtle transition-colors hover:text-fg-muted"
      >
        <ArrowLeft width={14} height={14} className="shrink-0" />
        返回实验列表
      </Link>

      <PageHeader
        title={`${experiment.mark} · ${experiment.title}`}
        actions={
          readonly ? undefined : (
            <Button
              size="sm"
              onPress={() => navigate(`/console/checkoff?experiment=${experiment.id}`)}
            >
              <ClipboardCheck width={15} height={15} className="shrink-0" />
              去验收
            </Button>
          )
        }
      />

      <ExperimentBankSection
        readonly={readonly}
        binding={binding}
        bank={bank}
        recentBanks={recentBanks}
        bankQuestionCount={bankQuestionCount}
        onBind={bind}
        onOpenBanks={banksState.open}
      />

      <ExperimentTimelineSection
        readonly={readonly}
        experiment={experiment}
        publishDraft={publishDraft}
        checkoffDeadlineDraft={checkoffDeadlineDraft}
        reportDeadlineDraft={reportDeadlineDraft}
        onPublishChange={setPublishDraft}
        onCheckoffDeadlineChange={setCheckoffDeadlineDraft}
        onReportDeadlineChange={setReportDeadlineDraft}
        savingTimeline={savingTimeline}
        showTimelineEditor={showTimelineEditor}
        hasTimeline={hasTimeline}
        dirty={dirty}
        onEdit={() => setEditingTimeline(true)}
        onCancel={cancelEditTimeline}
        onSave={saveTimeline}
      />

      <ExperimentScoringSection
        readonly={readonly}
        ratio={ratio}
        unifiedRatio={unifiedRatio}
        savingRatio={savingRatio}
        saveFailed={ratioSave.saveFailed}
        onChange={changeRatio}
      />

      <ExperimentXzzdSection
        readonly={readonly}
        experiment={experiment}
        boundCount={xzzdBoundCount}
        onBind={bindState.open}
        onPush={() => navigate(`/console/experiments/${experiment.id}/xzzd-push`)}
        onOpenPreferences={preferencesState.open}
      />

      <ExperimentScoreTable
        students={students}
        scores={scores}
        experimentId={experiment.id}
        ratio={ratio}
        onViewRemarks={() =>
          navigate(
            readonly
              ? `/viewer/experiments/${experiment.id}/remarks`
              : `/console/remarks/experiments/${experiment.id}`,
          )
        }
      />

      <ExperimentBindHomeworkModal
        state={bindState}
        experiment={experiment}
        onSaved={setExperiment}
      />

      <ExperimentPreferencesModal state={preferencesState} />

      <QuestionBankPickerModal
        state={banksState}
        banks={banks}
        selectedBankId={bank?.id ?? null}
        onSelect={selectBank}
      />
    </div>
  )
}
