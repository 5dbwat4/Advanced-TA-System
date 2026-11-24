import { Alert, useOverlayState } from '@heroui/react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'
import ArrowLeft from '~icons/lucide/arrow-left'
import RefreshCw from '~icons/lucide/refresh-cw'
import Target from '~icons/lucide/target'

import { HomeworkSelectCard } from '@/components/xzzd-sync/HomeworkSelectCard'
import { SyncPreviewCard } from '@/components/xzzd-sync/SyncPreviewCard'
import { SyncTargetCard } from '@/components/xzzd-sync/SyncTargetCard'
import type { MappingDraft, ScoreType } from '@/components/xzzd-sync/types'
import { Card, EmptyState } from '@/components/ui/Card'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { PageHeader } from '@/components/ui/PageHeader'
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
import { useAsyncData } from '@/lib/request'
import { useCurrentClass } from '@/lib/store'
import { summarizeXzzdSync } from '@/lib/xzzd-sync'

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
  const [mappingDraft, setMappingDraft] = useState<MappingDraft>({
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
  const previewRequest = useRef(0)
  const applyRequest = useRef(0)

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
    previewRequest.current += 1
    applyRequest.current += 1
    setPreviewing(false)
    setApplying(false)
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

  useEffect(() => {
    return () => {
      previewRequest.current += 1
      applyRequest.current += 1
    }
  }, [])

  const loadPreview = async (keepResult = false) => {
    if (!experimentId || !activityId) return
    if (parsedMapping.error) {
      toast.error(parsedMapping.error)
      return
    }
    const request = ++previewRequest.current
    setPreviewing(true)
    if (!keepResult) setResult(null)
    try {
      const data = await fetchXzzdSyncPreview(
        experimentId,
        activityId,
        scoreType,
        parsedMapping.mapping,
      )
      if (request === previewRequest.current) setPreview(data)
    } catch (error) {
      if (request === previewRequest.current) {
        toast.error(getErrorMessage(error, '获取同步预览失败'))
        setPreview(null)
      }
    } finally {
      if (request === previewRequest.current) setPreviewing(false)
    }
  }

  const runApply = async () => {
    if (!experimentId || !activityId) return
    if (parsedMapping.error) {
      toast.error(parsedMapping.error)
      return
    }
    const request = ++applyRequest.current
    setApplying(true)
    try {
      const data = await applyXzzdSync(experimentId, {
        activityId,
        type: scoreType,
        mode,
        mapping: parsedMapping.mapping,
      })
      if (request !== applyRequest.current) return
      setResult(data)
      toast.success(`已同步 ${data.create + data.update} 条成绩`)
      void loadPreview(true)
    } catch (error) {
      if (request === applyRequest.current) toast.error(getErrorMessage(error, '同步失败'))
    } finally {
      if (request === applyRequest.current) {
        setApplying(false)
        overwriteState.close()
      }
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

      <PageHeader title="从学在浙大同步成绩" />

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
          <fieldset disabled={applying} className="contents">
          <SyncTargetCard
            experiments={experiments}
            experimentId={experimentId}
            scoreType={scoreType}
            mappingEnabled={mappingEnabled}
            mappingDraft={mappingDraft}
            mappingError={parsedMapping.error}
            onExperimentChange={setExperimentId}
            onScoreTypeChange={setScoreType}
            onMappingEnabledChange={setMappingEnabled}
            onMappingDraftChange={setMappingDraft}
          />

          <HomeworkSelectCard
            experimentId={experimentId}
            homeworks={homeworks}
            loading={homeworksLoading}
            activityId={activityId}
            selectedHomework={selectedHomework}
            onActivityChange={setActivityId}
            onRefresh={() => setHomeworksNonce((value) => value + 1)}
          />

          <SyncPreviewCard
            experimentId={experimentId}
            activityId={activityId}
            preview={preview}
            result={result}
            summary={summary}
            importable={importable}
            mode={mode}
            previewing={previewing}
            applying={applying}
            mappingError={parsedMapping.error}
            onPreview={() => void loadPreview()}
            onModeChange={setMode}
            onApply={startApply}
          />
          </fieldset>
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
