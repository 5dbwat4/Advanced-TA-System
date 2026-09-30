import {
  Button,
  ListBox,
  Modal,
  Select,
  Skeleton,
  Spinner,
  Tooltip,
  useOverlayState,
} from '@heroui/react'
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useDebounce } from 'react-use'
import { toast } from 'sonner'

import ArrowDown from '~icons/lucide/arrow-down'
import ArrowLeft from '~icons/lucide/arrow-left'
import ArrowUp from '~icons/lucide/arrow-up'
import CalendarClock from '~icons/lucide/calendar-clock'
import Check from '~icons/lucide/check'
import ChevronRight from '~icons/lucide/chevron-right'
import ClipboardCheck from '~icons/lucide/clipboard-check'
import ExternalLink from '~icons/lucide/external-link'
import FlaskConical from '~icons/lucide/flask-conical'
import GraduationCap from '~icons/lucide/graduation-cap'
import NotebookText from '~icons/lucide/notebook-text'
import Pencil from '~icons/lucide/pencil'
import Percent from '~icons/lucide/percent'
import SlidersHorizontal from '~icons/lucide/sliders-horizontal'
import Table from '~icons/lucide/table'
import TriangleAlert from '~icons/lucide/triangle-alert'
import Users from '~icons/lucide/users'
import X from '~icons/lucide/x'
import { ScoreRatioEditor } from '@/components/settings/ScoreRatioEditor'
import { EmptyState } from '@/components/ui/Card'
import { DateTimePicker } from '@/components/ui/DateTimePicker'
import { PageHeader } from '@/components/ui/PageHeader'
import {
  apiFetch,
  fetchCheckoff,
  fetchClassSettings,
  fetchExperimentHomeworks,
  listBanks,
  updateClassSettings,
  updateExperiment,
  type CheckoffStudent,
  type ClassSettings,
  type Experiment,
  type QuestionBank,
  type ZjuamHomework,
} from '@/lib/api'
import { SCORE_TYPES, scoreKey } from '@/lib/scores'
import { DEFAULT_SCORE_RATIO, resolveScoreRatio, weightedTotal } from '@/lib/scoring'

function formatDateTime(value: string | null): string {
  if (!value) return '未指定'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '未指定'
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}/${pad(date.getMonth() + 1)}/${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

function TimeStat({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <div className="text-xs font-semibold text-fg-muted">{label}</div>
      <div className={value ? 'tabular mt-1.5 text-sm' : 'tabular mt-1.5 text-sm text-fg-subtle'}>
        {formatDateTime(value)}
      </div>
    </div>
  )
}

export default function ExperimentDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [experiment, setExperiment] = useState<Experiment | null>(null)
  const [banks, setBanks] = useState<QuestionBank[]>([])
  const [students, setStudents] = useState<CheckoffStudent[]>([])
  const [scores, setScores] = useState<Map<string, number>>(new Map())
  const [settings, setSettings] = useState<ClassSettings | null>(null)
  const [ratio, setRatio] = useState<number[]>(DEFAULT_SCORE_RATIO)
  const [savingRatio, setSavingRatio] = useState(false)
  const ratioDirty = useRef(false)
  const [loading, setLoading] = useState(true)
  const [binding, setBinding] = useState(false)

  const [homeworks, setHomeworks] = useState<ZjuamHomework[]>([])
  const [homeworksLoading, setHomeworksLoading] = useState(false)
  const [homeworksError, setHomeworksError] = useState<string | null>(null)
  const [checkoutDraft, setCheckoutDraft] = useState<string | null>(null)
  const [reportDraft, setReportDraft] = useState<string | null>(null)
  const [savingXzzd, setSavingXzzd] = useState(false)

  const [publishDraft, setPublishDraft] = useState<string | null>(null)
  const [checkoffDeadlineDraft, setCheckoffDeadlineDraft] = useState<string | null>(null)
  const [reportDeadlineDraft, setReportDeadlineDraft] = useState<string | null>(null)
  const [savingTimeline, setSavingTimeline] = useState(false)
  const [editingTimeline, setEditingTimeline] = useState(false)

  const [xzzdExpanded, setXzzdExpanded] = useState(false)

  const bindState = useOverlayState()
  const syncDownState = useOverlayState()
  const preferencesState = useOverlayState()

  const loadHomeworks = useCallback(async () => {
    if (!id) return
    setHomeworksLoading(true)
    setHomeworksError(null)
    try {
      const { homeworks: list } = await fetchExperimentHomeworks(id)
      setHomeworks(list)
    } catch (error) {
      setHomeworksError(error instanceof Error ? error.message : '获取学在浙大作业失败')
    } finally {
      setHomeworksLoading(false)
    }
  }, [id])

  const load = useCallback(async (experimentId: string) => {
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
      new Map(checkoff.scores.map((item) => [scoreKey(item.stuId, item.type, item.indId), item.score])),
    )
  }, [])

  useEffect(() => {
    if (!id) return
    let cancelled = false
    const run = async () => {
      try {
        await load(id)
      } catch (error) {
        if (!cancelled) toast.error(error instanceof Error ? error.message : '加载失败')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    run()
    return () => {
      cancelled = true
    }
  }, [id, load])

  useDebounce(
    () => {
      if (!ratioDirty.current || !experiment) return
      ratioDirty.current = false
      setSavingRatio(true)
      updateClassSettings(experiment.classId, {
        experimentScoreRatios: { [experiment.id]: ratio },
      })
        .catch((error) => {
          toast.error(error instanceof Error ? error.message : '保存评分占比失败')
        })
        .finally(() => setSavingRatio(false))
    },
    700,
    [ratio],
  )

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
      toast.error(error instanceof Error ? error.message : '操作失败')
    } finally {
      setBinding(false)
    }
  }

  const scoreOf = (stuId: string, type: number) =>
    experiment ? scores.get(scoreKey(stuId, type, experiment.id)) : undefined

  const totalOf = (stuId: string) =>
    weightedTotal(
      [scoreOf(stuId, 0) ?? null, scoreOf(stuId, 1) ?? null, scoreOf(stuId, 2) ?? null],
      ratio,
    )

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

  const xzzdBoundCount = [experiment.xzzdBindIdCheckout, experiment.xzzdBindIdReport].filter(
    Boolean,
  ).length

  const unifiedRatio = settings?.scoreRatioUnified ?? false

  const toggleXzzd = () => setXzzdExpanded((prev) => !prev)

  const openBindModal = () => {
    setCheckoutDraft(experiment.xzzdBindIdCheckout)
    setReportDraft(experiment.xzzdBindIdReport)
    void loadHomeworks()
    bindState.open()
  }

  const saveXzzdBind = async () => {
    setSavingXzzd(true)
    try {
      const { experiment: updated } = await updateExperiment(experiment.id, {
        xzzdBindIdCheckout: checkoutDraft,
        xzzdBindIdReport: reportDraft,
      })
      setExperiment(updated)
      toast.success('已保存学在浙大作业绑定')
      bindState.close()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '保存失败')
    } finally {
      setSavingXzzd(false)
    }
  }

  const dirty =
    experiment !== null &&
    (experiment.publishTime !== publishDraft ||
      experiment.checkoffDeadline !== checkoffDeadlineDraft ||
      experiment.reportDeadline !== reportDeadlineDraft)

  const hasTimeline =
    experiment !== null &&
    Boolean(experiment.publishTime || experiment.checkoffDeadline || experiment.reportDeadline)

  const showTimelineEditor = editingTimeline || !hasTimeline

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
      toast.error(error instanceof Error ? error.message : '保存失败')
    } finally {
      setSavingTimeline(false)
    }
  }

  const changeRatio = (next: number[]) => {
    ratioDirty.current = true
    setRatio(next)
  }

  return (
    <div className="mx-auto max-w-4xl">
      <Link
        to="/console/experiments"
        className="mb-3 inline-flex items-center gap-1 text-xs font-semibold text-fg-subtle transition-colors hover:text-fg-muted"
      >
        <ArrowLeft width={14} height={14} className="shrink-0" />
        返回实验列表
      </Link>

      <PageHeader
        title={`${experiment.mark} · ${experiment.title}`}
        actions={
          <Button
            size="sm"
            onPress={() => navigate(`/console/checkoff?experiment=${experiment.id}`)}
          >
            <ClipboardCheck width={15} height={15} className="shrink-0" />
            去验收
          </Button>
        }
      />

      <div className="mb-4 rounded-2xl border border-line bg-elevated p-5">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <NotebookText
              width={16}
              height={16}
              className="shrink-0 text-brand-600 dark:text-brand-300"
            />
            <span className="text-sm font-bold">抽题题目集</span>
          </div>
          <Select
            className="min-w-[14rem]"
            aria-label="抽题题目集"
            isDisabled={binding}
            value={bank?.id ?? null}
            placeholder="未绑定题目集"
            onChange={(key) => void bind(key == null ? '' : String(key))}
            onClear={() => void bind('')}
          >
            <Select.Trigger>
              <Select.Value />
              <Select.ClearButton />
              <Select.Indicator />
            </Select.Trigger>
            <Select.Popover>
              <ListBox>
                {banks.map((item) => (
                  <ListBox.Item key={item.id} id={item.id} textValue={item.name}>
                    {item.name}
                    <ListBox.ItemIndicator />
                  </ListBox.Item>
                ))}
              </ListBox>
            </Select.Popover>
          </Select>
          {binding && <Spinner size="sm" />}
          {bankQuestionCount !== null && (
            <span className="tabular rounded-lg bg-brand-500/10 px-2.5 py-1 text-xs font-semibold text-brand-600 dark:text-brand-300">
              {bankQuestionCount} 题
            </span>
          )}
          <Link
            to="/console/questions?tab=sets"
            className="ml-auto text-xs font-semibold text-brand-600 hover:underline dark:text-brand-300"
          >
            管理题目集 →
          </Link>
        </div>
        {!bank && (
          <p className="mt-3 flex items-center gap-1.5 text-xs text-amber-600 dark:text-amber-400">
            <TriangleAlert width={13} height={13} className="shrink-0" />
            未绑定题目集时，验收抽题将没有题目。
          </p>
        )}
      </div>

      <div className="mb-4 rounded-2xl border border-line bg-elevated p-5">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <CalendarClock
              width={16}
              height={16}
              className="shrink-0 text-brand-600 dark:text-brand-300"
            />
            <span className="text-sm font-bold">时间线</span>
          </div>
          <div className="ml-auto flex items-center gap-2">
            {showTimelineEditor ? (
              <>
                {hasTimeline && (
                  <Tooltip delay={0}>
                    <Tooltip.Trigger className="inline-flex">
                      <Button
                        isIconOnly
                        size="sm"
                        variant="secondary"
                        isDisabled={savingTimeline}
                        aria-label="取消编辑"
                        onPress={cancelEditTimeline}
                      >
                        <X width={15} height={15} className="shrink-0" />
                      </Button>
                    </Tooltip.Trigger>
                    <Tooltip.Content placement="bottom" showArrow>
                      取消
                    </Tooltip.Content>
                  </Tooltip>
                )}
                <Tooltip delay={0}>
                  <Tooltip.Trigger className="inline-flex">
                    <Button
                      isIconOnly
                      size="sm"
                      isDisabled={!dirty}
                      isPending={savingTimeline}
                      aria-label="保存时间线"
                      onPress={saveTimeline}
                    >
                      {({ isPending }) =>
                        isPending ? (
                          <Spinner color="current" size="sm" />
                        ) : (
                          <Check width={16} height={16} className="shrink-0" />
                        )
                      }
                    </Button>
                  </Tooltip.Trigger>
                  <Tooltip.Content placement="bottom" showArrow>
                    保存
                  </Tooltip.Content>
                </Tooltip>
              </>
            ) : (
              <Tooltip delay={0}>
                <Tooltip.Trigger className="inline-flex">
                  <Button
                    isIconOnly
                    size="sm"
                    variant="secondary"
                    aria-label="编辑时间线"
                    onPress={() => setEditingTimeline(true)}
                  >
                    <Pencil width={15} height={15} className="shrink-0" />
                  </Button>
                </Tooltip.Trigger>
                <Tooltip.Content placement="bottom" showArrow>
                  编辑
                </Tooltip.Content>
              </Tooltip>
            )}
          </div>
        </div>
        {showTimelineEditor ? (
          <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <DateTimePicker
              label="公开时间"
              value={publishDraft}
              onChange={setPublishDraft}
              isDisabled={savingTimeline}
            />
            <DateTimePicker
              label="验收截止时间"
              value={checkoffDeadlineDraft}
              onChange={setCheckoffDeadlineDraft}
              isDisabled={savingTimeline}
            />
            <DateTimePicker
              label="报告提交截止时间"
              value={reportDeadlineDraft}
              onChange={setReportDeadlineDraft}
              isDisabled={savingTimeline}
            />
          </div>
        ) : (
          <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <TimeStat label="公开时间" value={experiment.publishTime} />
            <TimeStat label="验收截止时间" value={experiment.checkoffDeadline} />
            <TimeStat label="报告提交截止时间" value={experiment.reportDeadline} />
          </div>
        )}
      </div>

      <div className="mb-4 rounded-2xl border border-line bg-elevated p-5">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <Percent
              width={16}
              height={16}
              className="shrink-0 text-brand-600 dark:text-brand-300"
            />
            <span className="text-sm font-bold">实验计分方式</span>
          </div>
          {savingRatio && <Spinner size="sm" />}
          {unifiedRatio && (
            <span className="text-xs text-fg-subtle">
              已启用课程统一评分占比，
              <Link
                to="/console/courses/settings#scoring"
                className="font-semibold text-brand-600 transition-colors hover:underline dark:text-brand-300"
              >
                前往设置修改
              </Link>
            </span>
          )}
        </div>
        <div className="mt-4">
          <ScoreRatioEditor value={ratio} onChange={changeRatio} disabled={unifiedRatio} />
        </div>
      </div>

      <div className="mb-4 rounded-2xl border border-line bg-elevated">
        <button
          type="button"
          onClick={toggleXzzd}
          aria-expanded={xzzdExpanded}
          className="flex w-full cursor-pointer items-center gap-3 rounded-2xl p-5 text-left transition-colors hover:bg-sunken/40"
        >
          <GraduationCap
            width={16}
            height={16}
            className="shrink-0 text-brand-600 dark:text-brand-300"
          />
          <span className="text-sm font-bold">学在浙大作业</span>
          <span className="ml-auto text-xs text-fg-subtle">
            {xzzdBoundCount === 0 ? '未绑定' : `已绑定 ${xzzdBoundCount}/2`}
          </span>
          <ChevronRight
            width={16}
            height={16}
            className={`shrink-0 text-fg-subtle transition-transform ${xzzdExpanded ? 'rotate-90' : ''}`}
          />
        </button>
        {xzzdExpanded && (
          <div className="flex flex-col gap-4 border-t border-line p-5">
            <div className="flex flex-wrap items-center gap-x-6 gap-y-3 rounded-2xl border border-line p-4">
              <div className="flex items-center gap-3">
                <span className="text-sm text-fg-muted">验收</span>
                <HomeworkTag
                  id={experiment.xzzdBindIdCheckout}
                  courseId={experiment.klass?.xzzdClassId ?? null}
                />
              </div>
              <div className="flex items-center gap-3">
                <span className="text-sm text-fg-muted">报告</span>
                <HomeworkTag
                  id={experiment.xzzdBindIdReport}
                  courseId={experiment.klass?.xzzdClassId ?? null}
                />
              </div>
              <Button className="sm:ml-auto" size="sm" variant="secondary" onPress={openBindModal}>
                {xzzdBoundCount > 0 ? '重新绑定' : '绑定'}
              </Button>
            </div>

            <div className="rounded-2xl border border-line p-4">
              <p className="mb-3 text-xs font-semibold text-fg-muted">上次同步时间</p>
              <div className="grid grid-cols-2 gap-2">
                <SyncStat
                  icon={<ArrowUp width={14} height={14} className="shrink-0" />}
                  tooltip="向上游推送成绩时间"
                  time={formatSync(experiment.lastXzzdUpSyncAt)}
                />
                <SyncStat
                  icon={<ArrowDown width={14} height={14} className="shrink-0" />}
                  tooltip="从上游同步提交情况时间"
                  time={formatSync(experiment.lastXzzdDownSyncAt)}
                />
              </div>
              <div className="mt-3 flex items-stretch gap-2">
                <div className="grid flex-1 gap-2 sm:grid-cols-2">
                  <Button
                    variant="secondary"
                    onPress={() => navigate(`/console/experiments/${experiment.id}/xzzd-push`)}
                  >
                    向上游推送成绩
                  </Button>
                  <Button variant="secondary" onPress={syncDownState.open}>
                    从上游同步提交情况
                  </Button>
                </div>
                <Tooltip delay={0}>
                  <Tooltip.Trigger className="inline-flex">
                    <Button
                      isIconOnly
                      variant="secondary"
                      aria-label="偏好设置"
                      onPress={preferencesState.open}
                    >
                      <SlidersHorizontal width={16} height={16} className="shrink-0" />
                    </Button>
                  </Tooltip.Trigger>
                  <Tooltip.Content placement="top" showArrow>
                    偏好设置
                  </Tooltip.Content>
                </Tooltip>
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="mb-3 flex items-center gap-2 text-sm font-bold">
        <Table width={16} height={16} className="shrink-0" />
        学生得分
        <span className="tabular text-xs font-normal text-fg-subtle">{students.length} 人</span>
      </div>

      {students.length === 0 ? (
        <EmptyState
          icon={Users}
          title="暂无学生"
          hint="请先到「分数和名单」导入学生名单"
        />
      ) : (
        <div className="max-h-[70vh] overflow-auto rounded-2xl border border-line">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr>
                <th className="sticky left-0 top-0 z-30 border-b border-r border-line bg-elevated px-4 py-2 text-left font-semibold">
                  学生
                </th>
                {SCORE_TYPES.map((type) => (
                  <th
                    key={type.value}
                    className="sticky top-0 z-20 border-b border-r border-line bg-elevated px-4 py-2 text-center font-semibold"
                  >
                    {type.label}
                  </th>
                ))}
                <th className="sticky top-0 z-20 border-b border-line bg-elevated px-4 py-2 text-center font-semibold">
                  总评
                </th>
              </tr>
            </thead>
            <tbody>
              {students.map((student) => (
                <tr key={student.stuId} className="transition-colors hover:bg-sunken/40">
                  <td className="sticky left-0 z-10 border-b border-r border-line bg-elevated px-4 py-2">
                    <div className="font-bold">{student.name}</div>
                    <div className="tabular text-xs text-fg-muted">{student.studentNo}</div>
                  </td>
                  {SCORE_TYPES.map((type) => {
                    const value = scoreOf(student.stuId, type.value)
                    return (
                      <td
                        key={type.value}
                        className="tabular border-b border-r border-line px-4 py-2 text-center"
                      >
                        {value ?? <span className="text-fg-subtle">—</span>}
                      </td>
                    )
                  })}
                  <td className="tabular border-b border-line px-4 py-2 text-center font-bold">
                    {totalOf(student.stuId)?.toFixed(1) ?? (
                      <span className="font-normal text-fg-subtle">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal state={bindState}>
        <Modal.Backdrop>
          <Modal.Container>
            <Modal.Dialog className="sm:max-w-md">
              <Modal.CloseTrigger />
              <Modal.Header>
                <Modal.Icon className="bg-brand-500/10 text-brand-600 dark:text-brand-300">
                  <GraduationCap width={18} height={18} className="shrink-0" />
                </Modal.Icon>
                <Modal.Heading>绑定学在浙大作业</Modal.Heading>
              </Modal.Header>
              <Modal.Body className="flex flex-col gap-4">
                {homeworksLoading ? (
                  <div className="flex items-center justify-center gap-2 py-6 text-sm text-fg-muted">
                    <Spinner size="sm" />
                    正在从学在浙大获取作业…
                  </div>
                ) : homeworksError ? (
                  <div className="flex flex-col items-start gap-3 py-1">
                    <p className="text-sm text-danger">{homeworksError}</p>
                    <Button size="sm" variant="secondary" onPress={() => void loadHomeworks()}>
                      重试
                    </Button>
                  </div>
                ) : homeworks.length === 0 ? (
                  <p className="py-1 text-sm text-fg-muted">该课程暂无可绑定的作业。</p>
                ) : (
                  <>
                    <HomeworkSelect
                      label="验收作业"
                      value={checkoutDraft}
                      homeworks={homeworks}
                      disabled={savingXzzd}
                      onChange={setCheckoutDraft}
                    />
                    <HomeworkSelect
                      label="报告作业"
                      value={reportDraft}
                      homeworks={homeworks}
                      disabled={savingXzzd}
                      onChange={setReportDraft}
                    />
                    <p className="text-[11px] text-fg-subtle">
                      验收与报告是两个不同的学在浙大作业，可分别绑定；不绑定可点击右侧清除。
                    </p>
                  </>
                )}
              </Modal.Body>
              <Modal.Footer>
                <Button slot="close" variant="secondary">
                  取消
                </Button>
                <Button
                  isPending={savingXzzd}
                  isDisabled={homeworksLoading || Boolean(homeworksError)}
                  onPress={saveXzzdBind}
                >
                  {({ isPending }) => (
                    <>
                      {isPending ? (
                        <Spinner color="current" size="sm" />
                      ) : (
                        <Check width={16} height={16} className="shrink-0" />
                      )}
                      保存
                    </>
                  )}
                </Button>
              </Modal.Footer>
            </Modal.Dialog>
          </Modal.Container>
        </Modal.Backdrop>
      </Modal>

      <Modal state={syncDownState}>
        <Modal.Backdrop>
          <Modal.Container>
            <Modal.Dialog className="sm:max-w-md">
              <Modal.CloseTrigger />
              <Modal.Header>
                <Modal.Icon className="bg-brand-500/10 text-brand-600 dark:text-brand-300">
                  <ArrowDown width={18} height={18} className="shrink-0" />
                </Modal.Icon>
                <Modal.Heading>从上游同步提交情况</Modal.Heading>
              </Modal.Header>
              <Modal.Body>
                <p className="text-sm text-fg-muted">功能开发中。</p>
              </Modal.Body>
              <Modal.Footer>
                <Button slot="close" variant="secondary">
                  关闭
                </Button>
              </Modal.Footer>
            </Modal.Dialog>
          </Modal.Container>
        </Modal.Backdrop>
      </Modal>

      <Modal state={preferencesState}>
        <Modal.Backdrop>
          <Modal.Container>
            <Modal.Dialog className="sm:max-w-md">
              <Modal.CloseTrigger />
              <Modal.Header>
                <Modal.Icon className="bg-brand-500/10 text-brand-600 dark:text-brand-300">
                  <SlidersHorizontal width={18} height={18} className="shrink-0" />
                </Modal.Icon>
                <Modal.Heading>偏好设置</Modal.Heading>
              </Modal.Header>
              <Modal.Body>
                <p className="text-sm text-fg-muted">功能开发中。</p>
              </Modal.Body>
              <Modal.Footer>
                <Button slot="close" variant="secondary">
                  关闭
                </Button>
              </Modal.Footer>
            </Modal.Dialog>
          </Modal.Container>
        </Modal.Backdrop>
      </Modal>
    </div>
  )
}

function formatSync(value: string | null): string {
  if (!value) return '—'
  return new Date(value).toLocaleString('zh-CN', {
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
}

function HomeworkTag({ id, courseId }: { id: string | null; courseId: string | null }) {
  if (!id) return <span className="text-xs text-fg-subtle">未绑定</span>
  const className =
    'tabular inline-flex items-center gap-1 rounded-lg bg-brand-500/10 px-2 py-0.5 text-[11px] font-semibold text-brand-600 dark:text-brand-300'
  if (!courseId) {
    return <span className={className}>学在浙大 #{id}</span>
  }
  return (
    <a
      href={`https://courses.zju.edu.cn/course/${courseId}/learning-activity/full-screen#/${id}`}
      target="_blank"
      rel="noreferrer"
      className={`${className} transition-colors hover:bg-brand-500/20`}
    >
      学在浙大 #{id}
      <ExternalLink width={11} height={11} className="shrink-0" />
    </a>
  )
}

type SyncStatProps = {
  icon: ReactNode
  tooltip: string
  time: string
}

function SyncStat({ icon, tooltip, time }: SyncStatProps) {
  return (
    <Tooltip delay={0}>
      <Tooltip.Trigger className="inline-flex w-fit items-center gap-2 text-fg-muted">
        {icon}
        <span className="tabular text-xs">{time}</span>
      </Tooltip.Trigger>
      <Tooltip.Content placement="top" showArrow>
        {tooltip}
      </Tooltip.Content>
    </Tooltip>
  )
}

type HomeworkSelectProps = {
  label: string
  value: string | null
  homeworks: ZjuamHomework[]
  disabled: boolean
  onChange: (value: string | null) => void
}

function HomeworkSelect({ label, value, homeworks, disabled, onChange }: HomeworkSelectProps) {
  return (
    <div>
      <label className="mb-1.5 block text-xs font-semibold text-fg-muted">{label}</label>
      <Select
        className="w-full"
        aria-label={label}
        isDisabled={disabled}
        value={value}
        placeholder="未绑定"
        onChange={(key) => onChange(key == null ? null : String(key))}
        onClear={() => onChange(null)}
      >
        <Select.Trigger>
          <Select.Value />
          <Select.ClearButton />
          <Select.Indicator />
        </Select.Trigger>
        <Select.Popover>
          <ListBox>
            {homeworks.map((homework) => (
              <ListBox.Item key={homework.id} id={String(homework.id)} textValue={homework.title}>
                {homework.title}
                <ListBox.ItemIndicator />
              </ListBox.Item>
            ))}
          </ListBox>
        </Select.Popover>
      </Select>
    </div>
  )
}
