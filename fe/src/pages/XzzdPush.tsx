import {
  Alert,
  Button,
  Skeleton,
  Spinner,
  ToggleButton,
  ToggleButtonGroup,
} from '@heroui/react'
import { fetchEventSource } from '@microsoft/fetch-event-source'
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Link, useParams } from 'react-router-dom'
import { toast } from 'sonner'

import ArrowLeft from '~icons/lucide/arrow-left'
import Check from '~icons/lucide/check'
import ListChecks from '~icons/lucide/list-checks'
import RefreshCw from '~icons/lucide/refresh-cw'
import TriangleAlert from '~icons/lucide/triangle-alert'
import Upload from '~icons/lucide/upload'
import { Card, EmptyState } from '@/components/ui/Card'
import { IconAction } from '@/components/ui/IconAction'
import { PageHeader } from '@/components/ui/PageHeader'
import { SkeletonList } from '@/components/ui/SkeletonList'
import {
  apiFetch,
  fetchXzzdPushPreview,
  getToken,
  type Experiment,
  type XzzdPushTarget,
  type ZjuamCourseStudent,
  type ZjuamHomeworkScore,
  type ZjuamHomeworkSubmission,
  type ZjuamHomeworkSyncData,
} from '@/lib/api'
import { getErrorMessage } from '@/lib/error'
import { formatBytes, formatDateTime } from '@/lib/format'

type HomeworkKind = 'checkout' | 'report'

type PushStepStatus = 'running' | 'done' | 'error'

type PushStudentStatus = 'pushing' | 'pushed' | 'unchanged' | 'failed'

type PushStep = {
  id: string
  label: string
  status: PushStepStatus
  detail?: string
}

type PushEventPayload = {
  id?: string
  label?: string
  status?: PushStepStatus | PushStudentStatus
  detail?: string
  message?: string
  stuId?: string
  targets?: XzzdPushTarget[]
}

export default function XzzdPush() {
  const { id } = useParams<{ id: string }>()
  const [experiment, setExperiment] = useState<Experiment | null>(null)
  const [loadingExperiment, setLoadingExperiment] = useState(true)

  const [kind, setKind] = useState<HomeworkKind>('checkout')
  const [data, setData] = useState<ZjuamHomeworkSyncData | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [steps, setSteps] = useState<PushStep[]>([])
  const [targets, setTargets] = useState<XzzdPushTarget[]>([])
  const [studentStatus, setStudentStatus] = useState<Record<string, PushStudentStatus>>({})
  const [pushing, setPushing] = useState(false)
  const [pushError, setPushError] = useState<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const doneMessageRef = useRef<string | null>(null)

  useEffect(() => () => abortRef.current?.abort(), [])

  useEffect(() => {
    if (!id) return
    let cancelled = false
    const run = async () => {
      try {
        const { experiment: detail } = await apiFetch<{ experiment: Experiment }>(
          `/api/experiments/${id}`,
        )
        if (!cancelled) setExperiment(detail)
      } catch (error) {
        if (!cancelled) toast.error(getErrorMessage(error, '加载实验失败'))
      } finally {
        if (!cancelled) setLoadingExperiment(false)
      }
    }
    void run()
    return () => {
      cancelled = true
    }
  }, [id])

  const loadPreview = useCallback(async () => {
    if (!id) return
    setLoading(true)
    setError(null)
    try {
      const payload = await fetchXzzdPushPreview(id, kind)
      setData(payload)
    } catch (err) {
      setData(null)
      setError(getErrorMessage(err, '获取上游数据失败'))
    } finally {
      setLoading(false)
    }
  }, [id, kind])

  useEffect(() => {
    void loadPreview()
  }, [loadPreview])

  const upsertStep = (update: PushStep) => {
    setSteps((prev) => {
      const index = prev.findIndex((item) => item.id === update.id)
      if (index === -1) return [...prev, update]
      const next = prev.slice()
      next[index] = update
      return next
    })
  }

  const startPush = async () => {
    if (!id || pushing) return
    const token = getToken()
    setSteps([])
    setTargets([])
    setStudentStatus({})
    setPushError(null)
    doneMessageRef.current = null
    setPushing(true)
    const controller = new AbortController()
    abortRef.current = controller

    try {
      await fetchEventSource(`/api/experiments/${id}/xzzd-push/stream`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ kind }),
        signal: controller.signal,
        openWhenHidden: true,
        async onopen(response) {
          if (response.ok && response.headers.get('content-type')?.includes('text/event-stream')) {
            return
          }
          const payload = (await response.json().catch(() => null)) as { message?: string } | null
          throw new Error(payload?.message ?? `推送请求失败（${response.status}）`)
        },
        onmessage(message) {
          const payload = JSON.parse(message.data) as PushEventPayload
          if (message.event === 'step' && payload.id && payload.label && payload.status) {
            upsertStep({
              id: payload.id,
              label: payload.label,
              status: payload.status as PushStepStatus,
              detail: payload.detail,
            })
            return
          }
          if (message.event === 'assembled' && Array.isArray(payload.targets)) {
            setTargets(payload.targets)
            return
          }
          if (message.event === 'push' && payload.stuId && payload.status) {
            const status = payload.status as PushStudentStatus
            setStudentStatus((prev) => ({ ...prev, [payload.stuId as string]: status }))
            return
          }
          if (message.event === 'done') {
            doneMessageRef.current = payload.message ?? null
            return
          }
          if (message.event === 'error') {
            throw new Error(payload.message ?? '推送失败')
          }
        },
        onerror(error) {
          // 抛出以停止 fetch-event-source 的自动重试
          throw error
        },
      })
      toast.success(doneMessageRef.current ?? '推送完成')
      void loadPreview()
    } catch (err) {
      if (!controller.signal.aborted) {
        setPushError(getErrorMessage(err, '推送失败'))
      }
    } finally {
      setPushing(false)
      abortRef.current = null
    }
  }


  const studentsById = useMemo(
    () => new Map<number, ZjuamCourseStudent>((data?.students ?? []).map((item) => [item.id, item])),
    [data],
  )

  return (
    <div className="mx-auto max-w-4xl">
      <Link
        to={id ? `/console/experiments/${id}` : '/console/experiments'}
        className="mb-3 inline-flex items-center gap-1 text-xs font-semibold text-fg-subtle transition-colors hover:text-fg-muted"
      >
        <ArrowLeft width={14} height={14} className="shrink-0" />
        返回实验
      </Link>

      <PageHeader
        title="向上游推送成绩"
        actions={
          experiment && (
            <span className="text-xs text-fg-subtle">
              {experiment.mark} · {experiment.title}
            </span>
          )
        }
      />

      <Alert className="mb-4" status="warning">
        <Alert.Indicator />
        <Alert.Content>
          <Alert.Description>
            推送成绩会向学在浙大发送多个请求，完成用时较长，推送过程中请勿离开此页面。
          </Alert.Description>
        </Alert.Content>
      </Alert>

      {loadingExperiment ? (
        <Skeleton className="h-40 rounded-2xl" />
      ) : !experiment ? (
        <EmptyState icon={Upload} title="实验不存在" hint="它可能已被删除" />
      ) : pushing || steps.length > 0 ? null : (
        <Card index={0}>
          <div className="flex flex-wrap items-center gap-2">
            <Upload
              width={16}
              height={16}
              className="shrink-0 text-brand-600 dark:text-brand-300"
            />
            <h2 className="text-sm font-bold">上游数据</h2>
            <div className="ms-auto flex items-center gap-2">
              <ToggleButtonGroup
                selectionMode="single"
                disallowEmptySelection
                size="sm"
                selectedKeys={new Set([kind])}
                onSelectionChange={(keys) => {
                  const first = keys.values().next().value
                  if (first != null) setKind(String(first) as HomeworkKind)
                }}
              >
                <ToggleButton id="checkout">验收作业</ToggleButton>
                <ToggleButton id="report">
                  <ToggleButtonGroup.Separator />
                  报告作业
                </ToggleButton>
              </ToggleButtonGroup>
              <IconAction
                label="重新获取"
                tooltip="重新获取"
                placement="bottom"
                variant="secondary"
                isDisabled={loading}
                onPress={() => void loadPreview()}
              >
                <RefreshCw width={15} height={15} className="shrink-0" />
              </IconAction>
              {loading && <Spinner size="sm" />}
            </div>
          </div>

          <div className="mt-4 flex flex-col gap-6">
            <Alert status="warning">
              <Alert.Indicator />
              <Alert.Content>
                <Alert.Description>继续推送将会覆盖上游已有数据。</Alert.Description>
              </Alert.Content>
            </Alert>

            {error ? (
              <Alert status="danger">
                <Alert.Indicator />
                <Alert.Content>
                  <Alert.Description>{error}</Alert.Description>
                  <Button className="mt-2" size="sm" variant="secondary" onPress={() => void loadPreview()}>
                    重试
                  </Button>
                </Alert.Content>
              </Alert>
            ) : loading && !data ? (
              <div className="flex flex-col gap-2">
                <SkeletonList rows={3} className="h-10 rounded-xl" />
              </div>
            ) : data ? (
              <>
                <p className="text-xs text-fg-subtle">
                  上游作业 <span className="tabular">#{data.activityId}</span>
                </p>

                <SubmissionTable submissions={data.submissions} students={studentsById} />
                <ScoreTable scores={data.homeworkScores} students={studentsById} />
              </>
            ) : null}
          </div>
        </Card>
      )}

      {experiment && !pushing && steps.length === 0 && (
        <Button
          className="mt-4 w-full"
          size="lg"
          isDisabled={loading || !data}
          onPress={() => void startPush()}
        >
          <Upload width={16} height={16} className="shrink-0" />
          开始推送
        </Button>
      )}

      {(steps.length > 0 || pushError) && (
        <Card className="mt-4" index={1}>
          <div className="flex items-center gap-2">
            <ListChecks
              width={16}
              height={16}
              className="shrink-0 text-brand-600 dark:text-brand-300"
            />
            <h2 className="text-sm font-bold">推送进度</h2>
            {pushing && <Spinner size="sm" />}
          </div>

          {steps.length > 0 && (
            <ol className="mt-4 flex flex-col gap-3">
              {steps.map((step) => (
                <li key={step.id} className="flex items-start gap-3">
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center">
                    <StepIcon status={step.status} />
                  </span>
                  <div className="min-w-0">
                    <div
                      className={
                        step.status === 'error' ? 'text-sm text-danger' : 'text-sm text-fg'
                      }
                    >
                      {step.label}
                    </div>
                    {step.detail && (
                      <div className="mt-0.5 text-xs text-fg-subtle">{step.detail}</div>
                    )}
                  </div>
                </li>
              ))}
            </ol>
          )}

          {targets.length > 0 && <AssembledTable targets={targets} statuses={studentStatus} />}

          {pushError && (
            <Alert className="mt-4" status="danger">
              <Alert.Indicator />
              <Alert.Content>
                <Alert.Description>{pushError}</Alert.Description>
              </Alert.Content>
            </Alert>
          )}
        </Card>
      )}
    </div>
  )
}

function StepIcon({ status }: { status: PushStepStatus }) {
  if (status === 'running') return <Spinner size="sm" />
  if (status === 'done') return <Check width={15} height={15} className="shrink-0 text-emerald-500" />
  return <TriangleAlert width={15} height={15} className="shrink-0 text-danger" />
}

function AssembledTable({
  targets,
  statuses,
}: {
  targets: XzzdPushTarget[]
  statuses: Record<string, PushStudentStatus>
}) {
  const ready = targets.filter((item) => !item.skippedReason).length
  return (
    <div className="mt-2">
      <div className="mb-2 flex items-center gap-2">
        <span className="text-xs font-semibold text-fg-muted">组装结果</span>
        <span className="tabular text-[11px] text-fg-subtle">
          {targets.length} 人 · 可推送 {ready}
        </span>
      </div>
      <div className="max-h-[45vh] overflow-auto rounded-2xl border border-line">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr>
              <th className={`${HEAD_CLASS} text-left`}>学生</th>
              <th className={`${HEAD_CLASS} text-center`}>功能</th>
              <th className={`${HEAD_CLASS} text-center`}>验收</th>
              <th className={`${HEAD_CLASS} text-center`}>报告</th>
              <th className={`${HEAD_CLASS} text-center`}>推送分</th>
              <th className={`${HEAD_CLASS} text-left`}>评语</th>
              <th className={`${HEAD_CLASS} border-r-0 text-left`}>状态</th>
            </tr>
          </thead>
          <tbody>
            {targets.map((item) => (
              <tr key={item.stuId} className="transition-colors hover:bg-sunken/40">
                <td className={CELL_CLASS}>
                  {item.name}
                  <span className="tabular text-fg-subtle">
                    {item.personId != null ? `（${item.personId}）` : `（${item.studentNo}）`}
                  </span>
                </td>
                <td className={`${CELL_CLASS} tabular text-center`}>{formatScore(item.functionScore)}</td>
                <td className={`${CELL_CLASS} tabular text-center`}>{formatScore(item.answerScore)}</td>
                <td className={`${CELL_CLASS} tabular text-center`}>{formatScore(item.reportScore)}</td>
                <td className={`${CELL_CLASS} tabular text-center font-bold`}>
                  {item.pushScore ?? <span className="font-normal text-fg-subtle">—</span>}
                </td>
                <td className={`${CELL_CLASS} max-w-xs`}>
                  {item.comment ? (
                    <span className="block truncate" title={item.comment}>
                      {item.comment}
                    </span>
                  ) : (
                    <span className="text-fg-subtle">未配置模板</span>
                  )}
                </td>
                <td className={`${CELL_CLASS} border-r-0`}>
                  <PushStatusCell target={item} status={statuses[item.stuId]} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function PushStatusCell({
  target,
  status,
}: {
  target: XzzdPushTarget
  status?: PushStudentStatus
}) {
  if (target.skippedReason) {
    return <span className="text-amber-600 dark:text-amber-400">{target.skippedReason}</span>
  }
  if (status === 'pushing') {
    return (
      <span className="inline-flex items-center gap-1.5 text-fg-muted">
        <Spinner size="sm" />
        推送中
      </span>
    )
  }
  if (status === 'pushed') {
    return (
      <span className="inline-flex items-center gap-1 text-emerald-500">
        <Check width={13} height={13} className="shrink-0" />
        已推送
      </span>
    )
  }
  if (status === 'unchanged') {
    return (
      <span className="inline-flex items-center gap-1 text-fg-subtle">
        <Check width={13} height={13} className="shrink-0" />
        无变化
      </span>
    )
  }
  if (status === 'failed') {
    return (
      <span className="inline-flex items-center gap-1 text-danger">
        <TriangleAlert width={13} height={13} className="shrink-0" />
        推送失败
      </span>
    )
  }
  return <span className="text-fg-subtle">就绪</span>
}

function formatScore(value: number | null): ReactNode {
  if (value == null) return <span className="text-fg-subtle">—</span>
  return value
}

const HEAD_CLASS = 'sticky top-0 z-10 border-b border-r border-line bg-elevated px-4 py-2 font-semibold'
const CELL_CLASS = 'border-b border-r border-line px-4 py-2'

type StudentMap = Map<number, ZjuamCourseStudent>

/** 学生名（id）；未知 id 直接显示原始数字 */
function StudentLabel({ id, students }: { id: number | null; students: StudentMap }) {
  if (id == null) return <span className="text-fg-subtle">—</span>
  const student = students.get(id)
  if (!student) return <span className="tabular">{id}</span>
  return (
    <>
      {student.name}
      <span className="tabular text-fg-subtle">（{student.id}）</span>
    </>
  )
}

function SubmissionTable({
  submissions,
  students,
}: {
  submissions: ZjuamHomeworkSubmission[]
  students: StudentMap
}) {
  return (
    <div>
      <div className="mb-2 flex items-center gap-2">
        <span className="text-xs font-semibold text-fg-muted">提交记录</span>
        <span className="tabular text-[11px] text-fg-subtle">{submissions.length} 条</span>
      </div>
      {submissions.length === 0 ? (
        <p className="text-xs text-fg-subtle">暂无提交记录。</p>
      ) : (
        <div className="max-h-[45vh] overflow-auto rounded-2xl border border-line">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr>
                <th className={`${HEAD_CLASS} text-left`}>提交 ID</th>
                <th className={`${HEAD_CLASS} text-left`}>提交者</th>
                <th className={`${HEAD_CLASS} text-left`}>提交时间</th>
                <th className={`${HEAD_CLASS} text-right`}>附件</th>
                <th className={`${HEAD_CLASS} border-r-0 text-center`}>状态</th>
              </tr>
            </thead>
            <tbody>
              {submissions.map((item) => (
                <tr key={item.id} className="transition-colors hover:bg-sunken/40">
                  <td className={`${CELL_CLASS} tabular`}>{item.id}</td>
                  <td className={CELL_CLASS}>
                    <StudentLabel id={item.created_by?.id ?? null} students={students} />
                  </td>
                  <td className={`${CELL_CLASS} tabular`}>{formatDateTime(item.created_at)}</td>
                  <td className={`${CELL_CLASS} tabular text-right`}>
                    {formatBytes(item.attachments_size)}
                  </td>
                  <td className={`${CELL_CLASS} border-r-0 text-center`}>
                    {item.marked_submitted ? (
                      '已提交'
                    ) : (
                      <span className="text-fg-subtle">未提交</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function ScoreTable({ scores, students }: { scores: ZjuamHomeworkScore[]; students: StudentMap }) {
  return (
    <div>
      <div className="mb-2 flex items-center gap-2">
        <span className="text-xs font-semibold text-fg-muted">上游成绩</span>
        <span className="tabular text-[11px] text-fg-subtle">{scores.length} 条</span>
      </div>
      {scores.length === 0 ? (
        <p className="text-xs text-fg-subtle">暂无成绩记录。</p>
      ) : (
        <div className="max-h-[45vh] overflow-auto rounded-2xl border border-line">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr>
                <th className={`${HEAD_CLASS} text-left`}>学生</th>
                <th className={`${HEAD_CLASS} text-center`}>最终分数</th>
                <th className={`${HEAD_CLASS} text-center`}>分数</th>
                <th className={`${HEAD_CLASS} border-r-0 text-left`}>教师评语</th>
              </tr>
            </thead>
            <tbody>
              {scores.map((item) => (
                <tr key={item.student_id} className="transition-colors hover:bg-sunken/40">
                  <td className={CELL_CLASS}>
                    <StudentLabel id={item.student_id} students={students} />
                  </td>
                  <td className={`${CELL_CLASS} tabular text-center`}>
                    {item.final_score ?? <span className="text-fg-subtle">—</span>}
                  </td>
                  <td className={`${CELL_CLASS} tabular text-center`}>
                    {item.score ?? <span className="text-fg-subtle">—</span>}
                  </td>
                  <td className={`${CELL_CLASS} border-r-0 max-w-xs break-all`}>
                    {item.instructor_comment ?? <span className="text-fg-subtle">—</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

