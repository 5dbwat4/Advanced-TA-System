import { Skeleton } from '@heroui/react'
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'

import ArrowLeft from '~icons/lucide/arrow-left'
import ListChecks from '~icons/lucide/list-checks'
import { EmptyState } from '@/components/ui/Card'
import { PageHeader } from '@/components/ui/PageHeader'
import { fetchCheckpointClaims, type CheckpointClaim } from '@/lib/api'
import { getErrorMessage } from '@/lib/error'
import { useCurrentClass } from '@/lib/store'

export default function Checkpoints() {
  const currentClass = useCurrentClass()
  const classId = currentClass?.id ?? null
  const [claims, setClaims] = useState<CheckpointClaim[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!classId) return
    let cancelled = false
    const run = async () => {
      setLoading(true)
      try {
        const data = await fetchCheckpointClaims(classId)
        if (!cancelled) setClaims(data.claims)
      } catch (error) {
        if (!cancelled) toast.error(getErrorMessage(error, '加载失败'))
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void run()
    return () => {
      cancelled = true
    }
  }, [classId])

  return (
    <div className="mx-auto max-w-4xl">
      <Link
        to="/console/courses/settings"
        className="mb-3 inline-flex items-center gap-1 text-xs font-semibold text-fg-subtle transition-colors hover:text-fg-muted"
      >
        <ArrowLeft width={14} height={14} className="shrink-0" />
        返回课程设置
      </Link>

      <PageHeader title="管理 Checkpoints" />

      {!classId ? (
        <EmptyState icon={ListChecks} title="未选择课程" hint="请先在右上角选择课程" />
      ) : loading ? (
        <Skeleton className="h-64 rounded-2xl" />
      ) : claims.length === 0 ? (
        <EmptyState
          icon={ListChecks}
          title="暂无 Checkpoint 记录"
          hint="学生认领 Checkpoint 后会出现在这里"
        />
      ) : (
        <div className="overflow-hidden rounded-2xl border border-line">
          <table className="w-full text-sm">
            <thead>
              <tr>
                <th className="border-b border-line bg-elevated px-4 py-2 text-left font-semibold">
                  学生
                </th>
                <th className="border-b border-line bg-elevated px-4 py-2 text-center font-semibold">
                  已应用规则
                </th>
                <th className="border-b border-line bg-elevated px-4 py-2 text-center font-semibold">
                  记录时间
                </th>
              </tr>
            </thead>
            <tbody>
              {claims.map((claim) => (
                <tr key={claim.id} className="transition-colors hover:bg-sunken/40">
                  <td className="border-b border-line px-4 py-2">
                    <div className="font-bold">{claim.student?.name ?? '—'}</div>
                    <div className="tabular text-xs text-fg-muted">
                      {claim.student?.studentNo ?? claim.stuId}
                    </div>
                  </td>
                  <td className="tabular border-b border-line px-4 py-2 text-center">
                    {claim.appliedRules}
                  </td>
                  <td className="border-b border-line px-4 py-2 text-center text-xs text-fg-muted">
                    {new Date(claim.createdAt).toLocaleString('zh-CN')}
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
