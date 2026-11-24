import { Button, Modal, Spinner, useOverlayState } from '@heroui/react'
import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'

import ArrowLeft from '~icons/lucide/arrow-left'
import ChevronRight from '~icons/lucide/chevron-right'
import { PageHeader } from '@/components/ui/PageHeader'
import { fetchStudentExperimentReport, type StudentPreviewData } from '@/lib/api'
import { getErrorMessage } from '@/lib/error'
import { SCORE_TYPES } from '@/lib/scores'
import { loadStudentCases, type StudentCaseSet } from '@/lib/student-cases'
import { useCurrentClass } from '@/lib/store'
import { cn } from '@/lib/utils'
import { StudentPreviewContent } from '@/pages/student/StudentPreviewView'

export default function StudentReport({ readonly = false }: { readonly?: boolean }) {
  const { userId } = useParams<{ userId: string }>()
  const currentClass = useCurrentClass()
  const classId = currentClass?.id ?? null
  const navigate = useNavigate()
  const backPath = readonly ? '/viewer/scores' : '/console/scores'

  const [data, setData] = useState<StudentCaseSet | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const previewRequest = useRef(0)
  const previewState = useOverlayState({
    onOpenChange: (open) => {
      if (!open) {
        previewRequest.current += 1
        setPreviewExperimentId(null)
        setPreviewData(null)
        setPreviewError(null)
      }
    },
  })
  const [previewExperimentId, setPreviewExperimentId] = useState<string | null>(null)
  const [previewData, setPreviewData] = useState<StudentPreviewData | null>(null)
  const [previewError, setPreviewError] = useState<string | null>(null)
  const [previewLoading, setPreviewLoading] = useState(false)

  useEffect(() => {
    if (!classId || !userId) return
    let cancelled = false
    setLoading(true)
    setError(null)
    loadStudentCases(classId, userId)
      .then((result) => {
        if (cancelled) return
        setData(result)
      })
      .catch((err) => {
        if (!cancelled) setError(getErrorMessage(err, '加载学生信息失败'))
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [classId, userId])

  const openPreview = async (experimentId: string) => {
    if (!userId) return
    const request = ++previewRequest.current
    setPreviewExperimentId(experimentId)
    setPreviewData(null)
    setPreviewError(null)
    setPreviewLoading(true)
    previewState.open()
    try {
      const result = await fetchStudentExperimentReport(userId, experimentId)
      if (request === previewRequest.current) setPreviewData(result)
    } catch (err) {
      if (request === previewRequest.current) {
        setPreviewError(getErrorMessage(err, '加载实验详情失败'))
      }
    } finally {
      if (request === previewRequest.current) setPreviewLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center gap-2 text-xs text-fg-subtle">
        <Spinner size="sm" />
        正在加载学生信息…
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="mx-auto max-w-4xl">
        <Button variant="ghost" size="sm" className="mb-3" onPress={() => navigate(backPath)}>
          <ArrowLeft width={15} height={15} className="shrink-0" />
          {readonly ? '返回分数列表' : '返回分数和名单'}
        </Button>
        <div className="rounded-2xl border border-dashed border-danger/40 p-10 text-center text-sm text-danger">
          {error ?? '未找到该学生'}
        </div>
      </div>
    )
  }

  const previewExperiment = previewExperimentId
    ? (data.cases.find((item) => item.experiment.id === previewExperimentId)?.experiment ?? null)
    : null
  const previewTitle = previewExperiment
    ? `${previewExperiment.mark} · ${previewExperiment.title}`
    : '实验详情'

  return (
    <div className="mx-auto max-w-4xl">
      <Button variant="ghost" size="sm" className="mb-3" onPress={() => navigate(backPath)}>
        <ArrowLeft width={15} height={15} className="shrink-0" />
        {readonly ? '返回分数列表' : '返回分数和名单'}
      </Button>
      <PageHeader title={`${data.student.name} · 学生详情`} />

      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-4 rounded-2xl border border-line bg-elevated p-5">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-500/10 text-lg font-bold text-brand-600 dark:text-brand-300">
            {data.student.name.slice(0, 1)}
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-lg font-bold">{data.student.name}</div>
            <div className="tabular text-xs text-fg-subtle">
              {data.student.studentId} · {currentClass?.name ?? '当前班级'}
            </div>
          </div>
        </div>

        <section className="flex flex-col gap-3">
          <h2 className="text-sm font-bold">实验情况</h2>
          {data.cases.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-line p-8 text-center text-xs text-fg-subtle">
              当前班级还没有实验
            </div>
          ) : (
            data.cases.map((item) => {
              const reportScore = item.scores.find((score) => score.type === 2)?.score ?? null
              return (
                <button
                  key={item.experiment.id}
                  type="button"
                  onClick={() => void openPreview(item.experiment.id)}
                  className="flex w-full flex-wrap items-center gap-3 rounded-2xl border border-line bg-elevated p-4 text-left transition-colors hover:border-brand-500/40 hover:bg-sunken/40"
                >
                  <span className="rounded-md bg-sunken px-2 py-0.5 text-[11px] font-semibold text-fg-muted">
                    {item.experiment.mark}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-sm font-bold">
                    {item.experiment.title}
                  </span>
                  <div className="flex flex-wrap items-center gap-1.5">
                    {SCORE_TYPES.map((type) => {
                      const score = item.scores.find((entry) => entry.type === type.value)
                      return (
                        <span
                          key={type.value}
                          className={cn(
                            'tabular rounded-md px-2 py-0.5 text-[11px] font-semibold',
                            score
                              ? 'bg-brand-500/10 text-brand-600 dark:text-brand-300'
                              : 'bg-sunken text-fg-subtle',
                          )}
                        >
                          {type.label} {score?.score ?? '—'}
                        </span>
                      )
                    })}
                    {reportScore == null && (
                      <span className="rounded-md bg-amber-500/10 px-2 py-0.5 text-[11px] font-semibold text-amber-600 dark:text-amber-300">
                        未评报告
                      </span>
                    )}
                  </div>
                  <ChevronRight width={16} height={16} className="shrink-0 text-fg-subtle" />
                </button>
              )
            })
          )}
        </section>

      </div>

      <Modal state={previewState}>
        <Modal.Backdrop>
          <Modal.Container>
            <Modal.Dialog className="sm:max-w-3xl">
              <Modal.CloseTrigger />
              <Modal.Header>
                <Modal.Heading>{previewTitle}</Modal.Heading>
              </Modal.Header>
              <Modal.Body className="max-h-[72vh] overflow-y-auto">
                {previewLoading ? (
                  <div className="flex justify-center py-12">
                    <Spinner size="lg" />
                  </div>
                ) : previewError ? (
                  <div className="rounded-2xl border border-dashed border-danger/40 p-8 text-center text-sm text-danger">
                    {previewError}
                  </div>
                ) : previewData ? (
                  <StudentPreviewContent data={previewData} />
                ) : null}
              </Modal.Body>
            </Modal.Dialog>
          </Modal.Container>
        </Modal.Backdrop>
      </Modal>
    </div>
  )
}
