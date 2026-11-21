import { Button } from '@heroui/react'
import MessageSquareText from '~icons/lucide/message-square-text'
import Table from '~icons/lucide/table'
import Users from '~icons/lucide/users'

import { EmptyState } from '@/components/ui/Card'
import type { CheckoffStudent } from '@/lib/api'
import { SCORE_TYPES, scoreKey } from '@/lib/scores'
import { weightedTotal } from '@/lib/scoring'

type ExperimentScoreTableProps = {
  students: CheckoffStudent[]
  scores: Map<string, number>
  experimentId: string
  ratio: number[]
  onViewRemarks: () => void
}

export function ExperimentScoreTable({
  students,
  scores,
  experimentId,
  ratio,
  onViewRemarks,
}: ExperimentScoreTableProps) {
  const scoreOf = (userId: string, type: number) =>
    scores.get(scoreKey(userId, type, experimentId))

  const totalOf = (userId: string) =>
    weightedTotal(
      [scoreOf(userId, 0) ?? null, scoreOf(userId, 1) ?? null, scoreOf(userId, 2) ?? null],
      ratio,
    )

  return (
    <>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm font-bold">
          <Table width={16} height={16} className="shrink-0" />
          学生得分
          <span className="tabular text-xs font-normal text-fg-subtle">{students.length} 人</span>
        </div>
        <Button size="sm" variant="secondary" onPress={onViewRemarks}>
          <MessageSquareText width={15} height={15} className="shrink-0" />
          查看评语
        </Button>
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
                <tr key={student.userId} className="transition-colors hover:bg-sunken/40">
                  <td className="sticky left-0 z-10 border-b border-r border-line bg-elevated px-4 py-2">
                    <div className="font-bold">{student.name}</div>
                    <div className="tabular text-xs text-fg-muted">{student.studentId}</div>
                  </td>
                  {SCORE_TYPES.map((type) => {
                    const value = scoreOf(student.userId, type.value)
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
                    {totalOf(student.userId)?.toFixed(1) ?? (
                      <span className="font-normal text-fg-subtle">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  )
}
