import { TextArea } from '@heroui/react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { toast } from 'sonner'

import ArrowLeft from '~icons/lucide/arrow-left'
import NotebookText from '~icons/lucide/notebook-text'
import Users from '~icons/lucide/users'
import { EmptyState } from '@/components/ui/Card'
import { IconAction } from '@/components/ui/IconAction'
import { PageHeader } from '@/components/ui/PageHeader'
import { SkeletonList } from '@/components/ui/SkeletonList'
import {
  apiFetch,
  fetchCheckoff,
  fetchExperimentRemarks,
  REMARK_TYPE_CHECKOFF,
  REMARK_TYPE_REPORT,
  saveRemark,
  type CheckoffStudent,
  type Experiment,
} from '@/lib/api'
import { getErrorMessage } from '@/lib/error'

/** 该实验下两种附言（验收 / 报告） */
const REMARK_COLUMNS: Array<{ type: number; label: string }> = [
  { type: REMARK_TYPE_CHECKOFF, label: '验收评语' },
  { type: REMARK_TYPE_REPORT, label: '报告评语' },
]

function remarkKey(stuId: string, type: number): string {
  return `${stuId}:${type}`
}

/** 单元格：本地编辑 + 停止输入防抖保存 */
function RemarkCell({
  stuId,
  experimentId,
  type,
  initial,
}: {
  stuId: string
  experimentId: string
  type: number
  initial: string
}) {
  const [text, setText] = useState(initial)
  const [saving, setSaving] = useState(false)
  const savedRef = useRef(initial)

  useEffect(() => {
    setText(initial)
    savedRef.current = initial
  }, [initial, stuId, type])

  const persist = useCallback(
    async (value: string) => {
      if (value === savedRef.current) return
      setSaving(true)
      try {
        await saveRemark({ stuId, experimentId, type, text: value })
        savedRef.current = value
      } catch (error) {
        toast.error(getErrorMessage(error, '附言保存失败'))
      } finally {
        setSaving(false)
      }
    },
    [stuId, experimentId, type],
  )

  useEffect(() => {
    if (text === savedRef.current) return
    const timer = window.setTimeout(() => void persist(text), 800)
    return () => window.clearTimeout(timer)
  }, [text, persist])

  return (
    <div className="flex flex-col gap-1">
      <TextArea
        rows={2}
        value={text}
        placeholder="—"
        aria-label="评语"
        style={{ resize: 'vertical' }}
        onChange={(event) => setText(event.target.value)}
        onBlur={() => void persist(text)}
      />
      {saving ? <span className="text-[11px] text-fg-subtle">保存中…</span> : null}
    </div>
  )
}

/** 某实验全部学生的两种评语：批量展示 + 可就地修改。 */
export default function ExperimentRemarks() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const experimentId = id ?? ''

  const [experiment, setExperiment] = useState<Experiment | null>(null)
  const [students, setStudents] = useState<CheckoffStudent[]>([])
  const [remarks, setRemarks] = useState<Map<string, string>>(new Map())
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!experimentId) return
    let cancelled = false
    const run = async () => {
      try {
        const { experiment: exp } = await apiFetch<{ experiment: Experiment }>(
          `/api/experiments/${experimentId}`,
        )
        const [checkoff, remarkList] = await Promise.all([
          fetchCheckoff({ classId: exp.classId, experimentId }),
          fetchExperimentRemarks(experimentId),
        ])
        if (cancelled) return
        setExperiment(exp)
        setStudents(checkoff.students)
        setRemarks(new Map(remarkList.map((item) => [remarkKey(item.stuId, item.type), item.text])))
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
  }, [experimentId])

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title="查看评语"
        subtitle={
          experiment ? (
            <span className="inline-flex items-center gap-1.5">
              <NotebookText width={14} height={14} className="shrink-0" />
              {experiment.mark} · {experiment.title}
            </span>
          ) : undefined
        }
        actions={
          <IconAction
            label="返回实验"
            onPress={() =>
              navigate(experimentId ? `/console/experiments/${experimentId}` : '/console/experiments')
            }
          >
            <ArrowLeft width={15} height={15} className="shrink-0" />
          </IconAction>
        }
      />

      {loading ? (
        <SkeletonList rows={8} className="h-16 rounded-xl" />
      ) : students.length === 0 ? (
        <EmptyState icon={Users} title="暂无学生" hint="请先到「分数和名单」导入学生名单" />
      ) : (
        <div className="max-h-[75vh] overflow-auto rounded-2xl border border-line">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr>
                <th className="sticky left-0 top-0 z-30 w-44 border-b border-r border-line bg-elevated px-4 py-2 text-left font-semibold">
                  学生
                </th>
                {REMARK_COLUMNS.map((col) => (
                  <th
                    key={col.type}
                    className="sticky top-0 z-20 border-b border-r border-line bg-elevated px-4 py-2 text-left font-semibold last:border-r-0"
                  >
                    {col.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {students.map((student) => (
                <tr key={student.stuId} className="align-top">
                  <td className="sticky left-0 z-10 border-b border-r border-line bg-elevated px-4 py-3">
                    <div className="font-bold">{student.name}</div>
                    <div className="tabular text-xs text-fg-muted">{student.studentNo}</div>
                  </td>
                  {REMARK_COLUMNS.map((col) => (
                    <td key={col.type} className="border-b border-r border-line p-2 last:border-r-0">
                      <RemarkCell
                        stuId={student.stuId}
                        experimentId={experimentId}
                        type={col.type}
                        initial={remarks.get(remarkKey(student.stuId, col.type)) ?? ''}
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
