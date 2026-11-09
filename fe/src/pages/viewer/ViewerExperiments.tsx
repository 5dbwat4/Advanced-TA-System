import { useEffect, useMemo } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { toast } from 'sonner'

import ChevronRight from '~icons/lucide/chevron-right'
import FlaskConical from '~icons/lucide/flask-conical'
import RefreshCw from '~icons/lucide/refresh-cw'
import School from '~icons/lucide/school'
import { ExperimentGantt } from '@/components/experiments/ExperimentGantt'
import { ExperimentStatusChip } from '@/components/experiments/ExperimentTimeline'
import { EmptyState } from '@/components/ui/Card'
import { IconAction } from '@/components/ui/IconAction'
import { PageHeader } from '@/components/ui/PageHeader'
import { SkeletonList } from '@/components/ui/SkeletonList'
import { apiFetch, type Experiment } from '@/lib/api'
import { formatDateTime } from '@/lib/format'
import { useAsyncData } from '@/lib/request'
import { useCurrentClass } from '@/lib/store'

export default function ViewerExperiments() {
  const currentClass = useCurrentClass()
  const navigate = useNavigate()
  const classId = currentClass?.id ?? null

  const { data, error, loading, reload } = useAsyncData(
    () => apiFetch<{ experiments: Experiment[] }>('/api/experiments'),
    [classId],
  )

  useEffect(() => {
    if (error) toast.error(error)
  }, [error])

  const experiments = useMemo(() => {
    const list = data?.experiments ?? []
    return classId ? list.filter((item) => item.classId === classId) : list
  }, [data, classId])

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title="实验列表"
        actions={
          <IconAction label="刷新" isDisabled={loading} onPress={reload}>
            <RefreshCw width={15} height={15} className="shrink-0" />
          </IconAction>
        }
      />

      {!loading && experiments.length > 0 && (
        <div className="mb-6">
          <ExperimentGantt
            experiments={experiments}
            showBuffer
            clickable
            onSelect={(id) => navigate(`/viewer/experiments/${id}`)}
          />
        </div>
      )}

      {!classId ? (
        <EmptyState icon={School} title="未绑定班级" hint="当前观察者账号尚未加入任何课程" />
      ) : loading ? (
        <SkeletonList rows={4} className="h-20 rounded-2xl" />
      ) : experiments.length === 0 ? (
        <EmptyState icon={FlaskConical} title="暂无实验" hint="该课程还未创建实验" />
      ) : (
        <div className="space-y-3">
          {experiments.map((exp) => (
            <Link
              key={exp.id}
              to={`/viewer/experiments/${exp.id}`}
              className="group flex flex-wrap items-center gap-4 rounded-2xl border border-line bg-elevated p-5 transition-colors hover:border-brand-500/40 hover:bg-sunken/40"
            >
              <span className="tabular rounded-lg bg-brand-500/10 px-2.5 py-1 text-xs font-bold text-brand-600 dark:text-brand-300">
                {exp.mark}
              </span>
              <h3 className="min-w-0 flex-1 truncate font-bold">{exp.title}</h3>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-fg-subtle">
                <span>公开：{formatDateTime(exp.publishTime)}</span>
                <span>验收截止：{formatDateTime(exp.checkoffDeadline)}</span>
                <span>报告截止：{formatDateTime(exp.reportDeadline)}</span>
              </div>
              <ExperimentStatusChip experiment={exp} />
              <ChevronRight
                width={18}
                height={18}
                className="shrink-0 text-fg-subtle transition-transform group-hover:translate-x-0.5"
              />
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
