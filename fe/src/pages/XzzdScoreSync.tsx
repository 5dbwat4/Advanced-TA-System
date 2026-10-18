import {
  Alert,
  Button,
  Input,
  Label,
  ListBox,
  Select,
  Spinner,
  Switch,
  ToggleButton,
  ToggleButtonGroup,
  useOverlayState,
} from '@heroui/react'
import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'

import ArrowLeft from '~icons/lucide/arrow-left'
import ArrowRight from '~icons/lucide/arrow-right'
import BookOpenCheck from '~icons/lucide/book-open-check'
import ListChecks from '~icons/lucide/list-checks'
import RefreshCw from '~icons/lucide/refresh-cw'
import Target from '~icons/lucide/target'
import { Card, EmptyState } from '@/components/ui/Card'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { PageHeader } from '@/components/ui/PageHeader'
import { PendingButton } from '@/components/ui/PendingButton'
import { SectionHeader } from '@/components/ui/SectionHeader'
import { SkeletonList } from '@/components/ui/SkeletonList'
import {
  applyXzzdSync,
  fetchClassTables,
  fetchExperimentHomeworks,
  fetchXzzdSyncPreview,
  type XzzdSyncApplyResult,
  type XzzdSyncMapping,
  type XzzdSyncMode,
  type XzzdSyncPreview,
  type ZjuamHomework,
} from '@/lib/api'
import { getErrorMessage } from '@/lib/error'
import { formatDateTime } from '@/lib/format'
import { useAsyncData } from '@/lib/request'
import { SCORE_TYPES } from '@/lib/scores'
import { useCurrentClass } from '@/lib/store'
import { cn } from '@/lib/utils'
import {
  summarizeXzzdSync,
  xzzdSyncAction,
  type XzzdSyncAction,
} from '@/lib/xzzd-sync'

type ScoreType = 0 | 1 | 2

const ACTION_STYLES: Record<XzzdSyncAction, { label: string; className: string }> = {
  create: { label: '新建', className: 'bg-brand-500/10 text-brand-600 dark:text-brand-300' },
  update: { label: '覆盖', className: 'bg-warning/10 text-warning' },
  unchanged: { label: '不变', className: 'bg-sunken text-fg-muted' },
  skip: { label: '跳过', className: 'bg-sunken text-fg-subtle' },
  unmatched: { label: '未匹配', className: 'bg-danger/10 text-danger' },
}

function displayScore(value: number | null): string {
  return value == null ? '—' : String(value)
}

export default function XzzdScoreSync() {
  const currentClass = useCurrentClass()
  const classId = currentClass?.id ?? null
  const {
    data: tableData,
    loading: tableLoading,
    error: tableError,
  } = useAsyncData(() => fetchClassTables(classId ?? undefined), [classId])

  const [experimentId, setExperimentId] = useState('')
  const [scoreType, setScoreType] = useState<ScoreType>(0)
  const [mappingEnabled, setMappingEnabled] = useState(false)
  const [mappingDraft, setMappingDraft] = useState({
    sourceMin: '0',
    sourceMax: '100',
    targetMin: '0',
    targetMax: '100',
  })
  const [homeworks, setHomeworks] = useState<ZjuamHomework[]>([])
  const [homeworksLoading, setHomeworksLoading] = useState(false)
  const [homeworksNonce, setHomeworksNonce] = useState(0)
  const [activityId, setActivityId] = useState('')
  const [preview, setPreview] = useState<XzzdSyncPreview | null>(null)
  const [mode, setMode] = useState<XzzdSyncMode>('onlyEmpty')
  const [previewing, setPreviewing] = useState(false)
  const [applying, setApplying] = useState(false)
  const [result, setResult] = useState<XzzdSyncApplyResult | null>(null)
  const overwriteState = useOverlayState()

  const experiments = useMemo(
    () => (tableData?.experiments ?? []).filter((item) => item.classId === classId),
    [tableData, classId],
  )
  const selectedHomework = useMemo(
    () => homeworks.find((item) => String(item.id) === activityId) ?? null,
    [homeworks, activityId],
  )
  const summary = useMemo(
    () => (preview ? summarizeXzzdSync(preview.rows, mode) : null),
    [preview, mode],
  )
  const importable = (summary?.create ?? 0) + (summary?.update ?? 0)
  const parsedMapping = useMemo((): {
    mapping: XzzdSyncMapping | null
    error: string | null
  } => {
    if (!mappingEnabled) return { mapping: null, error: null }

    const rawValues = [
      mappingDraft.sourceMin,
      mappingDraft.sourceMax,
      mappingDraft.targetMin,
      mappingDraft.targetMax,
    ]
    if (rawValues.some((value) => value.trim() === '')) {
      return { mapping: null, error: '请输入完整的成绩区间' }
    }

    const sourceMin = Number(mappingDraft.sourceMin)
    const sourceMax = Number(mappingDraft.sourceMax)
    const targetMin = Number(mappingDraft.targetMin)
    const targetMax = Number(mappingDraft.targetMax)

    if ([sourceMin, sourceMax, targetMin, targetMax].some((value) => !Number.isFinite(value))) {
      return { mapping: null, error: '请输入有效的数字' }
    }
    if (sourceMin === sourceMax) return { mapping: null, error: '原成绩始末不能相同' }
    if (targetMin === targetMax) return { mapping: null, error: '目标成绩始末不能相同' }

    return {
      mapping: { sourceMin, sourceMax, targetMin, targetMax },
      error: null,
    }
  }, [mappingEnabled, mappingDraft])

  useEffect(() => {
    if (tableError) toast.error(tableError)
  }, [tableError])

  useEffect(() => {
    setExperimentId('')
    setActivityId('')
    setHomeworks([])
    setPreview(null)
    setResult(null)
  }, [classId])

  useEffect(() => {
    if (experimentId && experiments.some((item) => item.id === experimentId)) return
    setExperimentId(experiments[0]?.id ?? '')
  }, [experimentId, experiments])

  useEffect(() => {
    if (!experimentId) {
      setHomeworks([])
      setActivityId('')
      return
    }

    let cancelled = false
    setHomeworksLoading(true)
    setHomeworks([])
    setActivityId('')
    setPreview(null)
    setResult(null)
    fetchExperimentHomeworks(experimentId)
      .then((data) => {
        if (!cancelled) setHomeworks(data.homeworks)
      })
      .catch((error: unknown) => {
        if (!cancelled) toast.error(getErrorMessage(error, '获取学在浙大作业失败'))
      })
      .finally(() => {
        if (!cancelled) setHomeworksLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [experimentId, homeworksNonce])

  useEffect(() => {
    setPreview(null)
    setResult(null)
  }, [
    scoreType,
    activityId,
    mappingEnabled,
    mappingDraft.sourceMin,
    mappingDraft.sourceMax,
    mappingDraft.targetMin,
    mappingDraft.targetMax,
  ])

  const loadPreview = async (keepResult = false) => {
    if (!experimentId || !activityId) return
    if (parsedMapping.error) {
      toast.error(parsedMapping.error)
      return
    }
    setPreviewing(true)
    if (!keepResult) setResult(null)
    try {
      const data = await fetchXzzdSyncPreview(
        experimentId,
        activityId,
        scoreType,
        parsedMapping.mapping,
      )
      setPreview(data)
    } catch (error) {
      toast.error(getErrorMessage(error, '获取同步预览失败'))
      setPreview(null)
    } finally {
      setPreviewing(false)
    }
  }

  const runApply = async () => {
    if (!experimentId || !activityId) return
    if (parsedMapping.error) {
      toast.error(parsedMapping.error)
      return
    }
    setApplying(true)
    try {
      const data = await applyXzzdSync(experimentId, {
        activityId,
        type: scoreType,
        mode,
        mapping: parsedMapping.mapping,
      })
      setResult(data)
      toast.success(`已同步 ${data.create + data.update} 条成绩`)
      void loadPreview(true)
    } catch (error) {
      toast.error(getErrorMessage(error, '同步失败'))
    } finally {
      setApplying(false)
      overwriteState.close()
    }
  }

  const startApply = () => {
    if (!preview || importable === 0) return
    if (mode === 'overwrite') {
      overwriteState.open()
      return
    }
    void runApply()
  }

  return (
    <div className="mx-auto max-w-4xl">
      <Link
        to="/console/courses/settings#tools"
        className="mb-3 inline-flex items-center gap-1 text-xs font-semibold text-fg-subtle transition-colors hover:text-fg-muted"
      >
        <ArrowLeft width={14} height={14} className="shrink-0" />
        返回课程设置
      </Link>

      <PageHeader
        title="从学在浙大同步成绩"
        actions={
          currentClass && <span className="text-xs text-fg-subtle">{currentClass.name}</span>
        }
      />

      <Alert className="mb-4" status="accent">
        <Alert.Indicator />
        <Alert.Content>
          <Alert.Description>
            适用于先前已在使用学在浙大管理成绩的情况，快捷同步已存在于学在浙大的旧数据。
          </Alert.Description>
        </Alert.Content>
      </Alert>

      {!classId ? (
        <EmptyState icon={Target} title="未选择课程" hint="请先在右上角选择或绑定一个课程" />
      ) : tableLoading ? (
        <Card index={0}>
          <SkeletonList rows={4} className="h-12 rounded-xl" />
        </Card>
      ) : (
        <div className="flex flex-col gap-4">
          <Card index={0}>
            <SectionHeader icon={Target}>1. 选择同步目标</SectionHeader>
            <div className="mt-4 flex flex-col gap-4">
              <div>
                <Label className="mb-1.5 block text-xs font-semibold text-fg-muted">
                  本地实验
                </Label>
                <Select
                  className="w-full"
                  aria-label="选择本地实验"
                  value={experimentId || null}
                  placeholder={experiments.length === 0 ? '当前课程暂无实验' : '选择实验'}
                  isDisabled={experiments.length === 0}
                  onChange={(key) => {
                    setExperimentId(key == null ? '' : String(key))
                  }}
                >
                  <Select.Trigger>
                    <Select.Value />
                    <Select.Indicator />
                  </Select.Trigger>
                  <Select.Popover>
                    <ListBox>
                      {experiments.map((experiment) => (
                        <ListBox.Item
                          key={experiment.id}
                          id={experiment.id}
                          textValue={`${experiment.mark} · ${experiment.title}`}
                        >
                          {experiment.mark} · {experiment.title}
                          <ListBox.ItemIndicator />
                        </ListBox.Item>
                      ))}
                    </ListBox>
                  </Select.Popover>
                </Select>
              </div>

              <div>
                <div className="mb-1.5 text-xs font-semibold text-fg-muted">写入评分项</div>
                <ToggleButtonGroup
                  selectionMode="single"
                  disallowEmptySelection
                  selectedKeys={new Set([String(scoreType)])}
                  onSelectionChange={(keys) => {
                    const first = keys.values().next().value
                    if (first != null) setScoreType(Number(first) as ScoreType)
                  }}
                >
                  {SCORE_TYPES.map((item, index) => (
                    <ToggleButton key={item.value} id={String(item.value)}>
                      {index > 0 && <ToggleButtonGroup.Separator />}
                      {item.label}
                    </ToggleButton>
                  ))}
                </ToggleButtonGroup>
                <p className="mt-2 text-[11px] text-fg-subtle">
                  学在浙大作业通常只有一个总分，请选择导入后对应的本地评分项。
                </p>
              </div>

              <div className="border-t border-line pt-4">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <div className="text-xs font-semibold text-fg-muted">百分比映射</div>
                    <div className="text-[11px] text-fg-subtle">
                      将学在浙大成绩区间等比映射到本地成绩区间
                    </div>
                  </div>
                  <Switch
                    aria-label="启用百分比映射"
                    isSelected={mappingEnabled}
                    onChange={setMappingEnabled}
                  >
                    <Switch.Content>
                      <Switch.Control>
                        <Switch.Thumb />
                      </Switch.Control>
                    </Switch.Content>
                  </Switch>
                </div>

                {mappingEnabled && (
                  <div className="mt-3 flex flex-col gap-2">
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                      <MappingField
                        label="原成绩始"
                        value={mappingDraft.sourceMin}
                        onChange={(value) =>
                          setMappingDraft((prev) => ({ ...prev, sourceMin: value }))
                        }
                      />
                      <MappingField
                        label="原成绩末"
                        value={mappingDraft.sourceMax}
                        onChange={(value) =>
                          setMappingDraft((prev) => ({ ...prev, sourceMax: value }))
                        }
                      />
                      <MappingField
                        label="目标始"
                        value={mappingDraft.targetMin}
                        onChange={(value) =>
                          setMappingDraft((prev) => ({ ...prev, targetMin: value }))
                        }
                      />
                      <MappingField
                        label="目标末"
                        value={mappingDraft.targetMax}
                        onChange={(value) =>
                          setMappingDraft((prev) => ({ ...prev, targetMax: value }))
                        }
                      />
                    </div>
                    {parsedMapping.error ? (
                      <p className="text-[11px] text-danger">{parsedMapping.error}</p>
                    ) : (
                      <p className="text-[11px] text-fg-subtle">
                        映射规则：{mappingDraft.sourceMin}–{mappingDraft.sourceMax} →{' '}
                        {mappingDraft.targetMin}–{mappingDraft.targetMax}
                      </p>
                    )}
                  </div>
                )}
              </div>
            </div>
          </Card>

          <Card index={1}>
            <SectionHeader icon={BookOpenCheck}>2. 选择学在浙大作业</SectionHeader>
            {!experimentId ? (
              <p className="mt-4 text-xs text-fg-subtle">请先选择本地实验。</p>
            ) : homeworksLoading ? (
              <div className="mt-4 flex items-center gap-2 text-xs text-fg-subtle">
                <Spinner size="sm" />
                正在获取学在浙大作业…
              </div>
            ) : homeworks.length === 0 ? (
              <p className="mt-4 text-xs text-fg-subtle">
                该课程在学在浙大中没有可用的作业。
              </p>
            ) : (
              <div className="mt-4 flex flex-col gap-2">
                <div className="flex items-end gap-2">
                  <div className="min-w-0 flex-1">
                    <Label className="mb-1.5 block text-xs font-semibold text-fg-muted">
                      旧作业
                    </Label>
                    <Select
                      className="w-full"
                      aria-label="选择学在浙大作业"
                      value={activityId || null}
                      placeholder="选择要同步的作业"
                      onChange={(key) => setActivityId(key == null ? '' : String(key))}
                    >
                      <Select.Trigger>
                        <Select.Value />
                        <Select.Indicator />
                      </Select.Trigger>
                      <Select.Popover>
                        <ListBox>
                          {homeworks.map((homework) => (
                            <ListBox.Item
                              key={homework.id}
                              id={String(homework.id)}
                              textValue={homework.title}
                            >
                              {homework.title}
                              <ListBox.ItemIndicator />
                            </ListBox.Item>
                          ))}
                        </ListBox>
                      </Select.Popover>
                    </Select>
                  </div>
                  <Button
                    variant="secondary"
                    isDisabled={homeworksLoading}
                    onPress={() => setHomeworksNonce((value) => value + 1)}
                  >
                    <RefreshCw width={15} height={15} className="shrink-0" />
                    重新获取
                  </Button>
                </div>
                {selectedHomework && (
                  <p className="text-[11px] text-fg-subtle">
                    截止 {formatDateTime(selectedHomework.endTime, '未设置')} ·{' '}
                    {selectedHomework.isClosed ? '已关闭' : '进行中'} · 已有成绩{' '}
                    {selectedHomework.hasScoreCount} 人
                  </p>
                )}
                <p className="text-[11px] text-fg-subtle">
                  如果提示未保存统一身份认证密码，请先前往{' '}
                  <Link
                    to="/console/settings#zjuam"
                    className="font-semibold text-brand-600 hover:underline dark:text-brand-300"
                  >
                    设置
                  </Link>{' '}
                  保存账号密码。
                </p>
              </div>
            )}
          </Card>

          <Card index={2}>
            <SectionHeader icon={ListChecks}>3. 预览并导入</SectionHeader>

            <div className="mt-4 flex flex-wrap items-center gap-3">
              <PendingButton
                variant="secondary"
                icon={RefreshCw}
                isPending={previewing}
                pendingLabel="获取中"
                isDisabled={
                  !activityId || !experimentId || applying || Boolean(parsedMapping.error)
                }
                onPress={() => void loadPreview()}
              >
                预览可导入成绩
              </PendingButton>
              {preview && (
                <span className="text-[11px] text-fg-subtle">
                  上次同步：{formatDateTime(preview.lastSyncAt, '尚未同步')}
                </span>
              )}
            </div>

            {result && (
              <Alert className="mt-4" status="success">
                <Alert.Indicator />
                <Alert.Content>
                  <Alert.Description>
                    同步完成：新建 {result.create} 条，覆盖 {result.update} 条，跳过{' '}
                    {result.skip} 条，未匹配 {result.unmatched} 条。
                  </Alert.Description>
                </Alert.Content>
              </Alert>
            )}

            {!preview ? (
              <div className="mt-4">
                <EmptyState
                  icon={ListChecks}
                  title="尚未生成预览"
                  hint="选择实验和学在浙大作业后，点击“预览可导入成绩”。"
                />
              </div>
            ) : (
              <div className="mt-4 flex flex-col gap-4">
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  <SummaryStat label="可新建" value={summary?.create ?? 0} tone="brand" />
                  <SummaryStat label="将覆盖" value={summary?.update ?? 0} tone="warning" />
                  <SummaryStat label="保持不变" value={summary?.unchanged ?? 0} />
                  <SummaryStat label="跳过 / 未匹配" value={(summary?.skip ?? 0) + (summary?.unmatched ?? 0)} />
                </div>

                <div className="flex flex-col gap-2">
                  <div className="text-xs font-semibold text-fg-muted">冲突处理</div>
                  <ToggleButtonGroup
                    selectionMode="single"
                    disallowEmptySelection
                    selectedKeys={new Set([mode])}
                    onSelectionChange={(keys) => {
                      const first = keys.values().next().value
                      if (first != null) setMode(String(first) as XzzdSyncMode)
                    }}
                  >
                    <ToggleButton id="onlyEmpty">仅填充空成绩</ToggleButton>
                    <ToggleButton id="overwrite">
                      <ToggleButtonGroup.Separator />
                      覆盖已有成绩
                    </ToggleButton>
                  </ToggleButtonGroup>
                  <p className="text-[11px] text-fg-subtle">
                    默认保留本地已有成绩；选择覆盖后会先弹出确认。
                  </p>
                </div>

                <div className="max-h-[55vh] overflow-auto rounded-xl border border-line">
                  <table className="w-full table-fixed border-separate border-spacing-0 text-sm">
                    <colgroup>
                      <col className="w-32" />
                      <col className="w-32" />
                      <col className="w-24" />
                      <col className="w-24" />
                      <col className="w-24" />
                      <col className="w-48" />
                      <col />
                    </colgroup>
                    <thead className="sticky top-0 z-10">
                      <tr>
                        <th className="border-b border-r border-line bg-elevated px-3 py-2 text-left font-semibold">
                          姓名
                        </th>
                        <th className="border-b border-r border-line bg-elevated px-3 py-2 text-left font-semibold">
                          学号
                        </th>
                        <th className="border-b border-r border-line bg-elevated px-3 py-2 text-right font-semibold">
                          学在浙大
                        </th>
                        <th className="border-b border-r border-line bg-elevated px-3 py-2 text-right font-semibold">
                          本地
                        </th>
                        <th className="border-b border-r border-line bg-elevated px-3 py-2 text-center font-semibold">
                          将会
                        </th>
                        <th className="border-b border-r border-line bg-elevated px-3 py-2 text-left font-semibold">
                          评语
                        </th>
                        <th className="border-b border-line bg-elevated px-3 py-2 text-left font-semibold">
                          说明
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {preview.rows.map((row, index) => {
                        const decision = xzzdSyncAction(row, mode)
                        const action = ACTION_STYLES[decision.action]
                        const willScore =
                          decision.action === 'create' || decision.action === 'update'
                            ? row.upstreamScore
                            : row.localScore
                        return (
                          <tr
                            key={`${row.userId ?? row.studentId}:${index}`}
                            className={cn(
                              'transition-colors hover:bg-sunken/40',
                              !row.userId && 'text-fg-subtle',
                            )}
                          >
                            <td className="border-b border-r border-line px-3 py-2 font-medium">
                              {row.name}
                            </td>
                            <td className="tabular border-b border-r border-line px-3 py-2 text-fg-muted">
                              {row.studentId || '—'}
                            </td>
                            <td className="tabular border-b border-r border-line px-3 py-2 text-right">
                              {displayScore(row.rawScore)}
                            </td>
                            <td className="tabular border-b border-r border-line px-3 py-2 text-right text-fg-muted">
                              {displayScore(row.localScore)}
                            </td>
                            <td className="border-b border-r border-line px-3 py-2 text-center">
                              <div className="inline-flex items-center gap-1.5">
                                <span
                                  className={cn(
                                    'inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold',
                                    action.className,
                                  )}
                                >
                                  {action.label}
                                </span>
                                {decision.action !== 'unchanged' && willScore != null && (
                                  <span className="tabular text-xs font-semibold">
                                    {displayScore(willScore)}
                                  </span>
                                )}
                              </div>
                            </td>
                            <td className="border-b border-r border-line px-3 py-2 text-xs text-fg-muted">
                              {row.upstreamComment ? (
                                <div
                                  className="max-w-[12rem] truncate"
                                  title={row.upstreamComment}
                                >
                                  {row.upstreamComment}
                                </div>
                              ) : (
                                '—'
                              )}
                            </td>
                            <td className="border-b border-line px-3 py-2 text-xs text-fg-subtle">
                              {row.issue ?? decision.reason ?? '—'}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="text-xs text-fg-muted">
                    将写入 <span className="font-semibold text-fg">{importable}</span> 条成绩
                  </p>
                  <PendingButton
                    variant="primary"
                    icon={ArrowRight}
                    isPending={applying}
                    pendingLabel="导入中"
                    isDisabled={
                      importable === 0 || previewing || Boolean(parsedMapping.error)
                    }
                    onPress={startApply}
                  >
                    导入成绩
                  </PendingButton>
                </div>
              </div>
            )}
          </Card>
        </div>
      )}

      <ConfirmDialog
        state={overwriteState}
        title="覆盖已有成绩？"
        description={`将覆盖 ${summary?.update ?? 0} 名学生的本地成绩，原成绩不可恢复。`}
        confirmLabel="覆盖并导入"
        isPending={applying}
        icon={RefreshCw}
        tone="brand"
        onConfirm={() => void runApply()}
      />
    </div>
  )
}

function SummaryStat({
  label,
  value,
  tone,
}: {
  label: string
  value: number
  tone?: 'brand' | 'warning'
}) {
  return (
    <div className="rounded-xl border border-line bg-sunken px-3 py-2">
      <div className="text-[10px] font-semibold text-fg-subtle">{label}</div>
      <div
        className={cn(
          'tabular mt-0.5 text-lg font-bold',
          tone === 'brand' && 'text-brand-600 dark:text-brand-300',
          tone === 'warning' && 'text-warning',
        )}
      >
        {value}
      </div>
    </div>
  )
}

function MappingField({
  label,
  value,
  onChange,
}: {
  label: string
  value: string
  onChange: (value: string) => void
}) {
  return (
    <div>
      <label className="mb-1 block text-[10px] font-semibold text-fg-subtle">{label}</label>
      <Input
        fullWidth
        type="number"
        step={0.1}
        value={value}
        aria-label={label}
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  )
}
