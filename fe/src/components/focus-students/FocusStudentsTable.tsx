import { Button, Checkbox, Chip, Tooltip } from '@heroui/react'
import { Link } from 'react-router-dom'

import {
  focusStatus,
  type FocusStudentsViewTab,
} from '@/components/focus-students/types'
import { SkeletonList } from '@/components/ui/SkeletonList'
import type { Experiment, FocusStudent } from '@/lib/api'
import { SCORE_TYPES, scoreKey } from '@/lib/scores'
import { cn } from '@/lib/utils'

const TH = 'border-b border-r border-line bg-elevated px-4 py-2'
const TH_LEFT = `${TH} text-left font-semibold`
const TH_CENTER = `${TH} text-center font-semibold`
const TH_SUB =
  'border-b border-r border-line bg-elevated px-2 py-2 text-center text-xs font-medium text-fg-muted'

type FocusStudentsTableProps = {
  loading: boolean
  tableLoading: boolean
  focusStudentsCount: number
  rows: FocusStudent[]
  editing: boolean
  selected: Set<string>
  tab: FocusStudentsViewTab
  experiments: Experiment[]
  scores: Map<string, number>
  onToggleRow: (id: string, checked: boolean) => void
  onToggleAll: (checked: boolean) => void
  onEditReason: (target: FocusStudent) => void
  onDelete: (target: FocusStudent) => void
}

export function FocusStudentsTable({
  loading,
  tableLoading,
  focusStudentsCount,
  rows,
  editing,
  selected,
  tab,
  experiments,
  scores,
  onToggleRow,
  onToggleAll,
  onEditReason,
  onDelete,
}: FocusStudentsTableProps) {
  const hasScoreCols = tab === 'scores' || tab === 'all'
  const hasActions = tab === 'actions' || tab === 'all'
  const constantRowSpan = hasScoreCols ? 2 : 1
  const allSelected = rows.length > 0 && rows.every((row) => selected.has(row.id))
  const someSelected = rows.some((row) => selected.has(row.id))

  return (
    <div className="max-h-[65vh] overflow-auto rounded-2xl border border-line bg-elevated">
      {loading || tableLoading ? (
        <div className="p-4">
          <SkeletonList rows={4} className="h-10 rounded-xl" />
        </div>
      ) : rows.length === 0 ? (
        <div className="py-10 text-center text-sm text-fg-subtle">
          {focusStudentsCount === 0 ? '暂无重点关注学生' : '未找到匹配的学生'}
        </div>
      ) : (
        <table className="w-full table-fixed border-separate border-spacing-0 text-sm">
          <colgroup>
            {editing && <col className="w-12" />}
            <col className="w-40" />
            <col className="w-36" />
            <col className="w-72" />
            <col className="w-32" />
            {hasScoreCols &&
              experiments.flatMap((experiment) =>
                SCORE_TYPES.map((type) => (
                  <col key={`${experiment.id}:${type.value}`} className="w-20" />
                )),
              )}
            {hasActions && <col className="w-40" />}
            <col />
          </colgroup>
          <thead className="sticky top-0 z-20">
            <tr>
              {editing && (
                <th className={`sticky left-0 z-30 ${TH_LEFT}`}>
                  <Checkbox
                    aria-label="全选"
                    isSelected={allSelected}
                    isIndeterminate={someSelected && !allSelected}
                    onChange={onToggleAll}
                  >
                    <Checkbox.Content>
                      <Checkbox.Control>
                        <Checkbox.Indicator />
                      </Checkbox.Control>
                    </Checkbox.Content>
                  </Checkbox>
                </th>
              )}
              <th
                rowSpan={constantRowSpan}
                className={`sticky ${editing ? 'left-12' : 'left-0'} z-30 ${TH_LEFT}`}
              >
                姓名
              </th>
              <th rowSpan={constantRowSpan} className={TH_LEFT}>
                学号
              </th>
              <th rowSpan={constantRowSpan} className={TH_LEFT}>
                重点关注原因
              </th>
              <th rowSpan={constantRowSpan} className={TH_LEFT}>
                当前状态
              </th>
              {hasScoreCols &&
                experiments.map((experiment) => (
                  <th
                    key={experiment.id}
                    colSpan={SCORE_TYPES.length}
                    className={TH_CENTER}
                  >
                    {experiment.mark} · {experiment.title}
                  </th>
                ))}
              {hasActions && (
                <th rowSpan={constantRowSpan} className={TH_LEFT}>
                  操作
                </th>
              )}
              <th rowSpan={constantRowSpan} aria-hidden className={TH} />
            </tr>
            {hasScoreCols && (
              <tr>
                {editing && <th className={`sticky left-0 z-30 ${TH}`} />}
                {experiments.flatMap((experiment) =>
                  SCORE_TYPES.map((type) => (
                    <th key={`${experiment.id}:${type.value}`} className={TH_SUB}>
                      {type.label}
                    </th>
                  )),
                )}
              </tr>
            )}
          </thead>
          <tbody>
            {rows.map((item) => {
              const name = item.student?.name ?? '—'
              const studentId = item.student?.studentId ?? ''
              const status = focusStatus()
              return (
                <tr key={item.id} className="transition-colors hover:bg-sunken/40">
                  {editing && (
                    <td className="sticky left-0 z-10 border-b border-r border-line bg-elevated px-4 py-2">
                      <Checkbox
                        aria-label={`选择 ${name}`}
                        isSelected={selected.has(item.id)}
                        onChange={(checked) => onToggleRow(item.id, checked)}
                      >
                        <Checkbox.Content>
                          <Checkbox.Control>
                            <Checkbox.Indicator />
                          </Checkbox.Control>
                        </Checkbox.Content>
                      </Checkbox>
                    </td>
                  )}
                  <td
                    className={cn(
                      'sticky z-10 border-b border-r border-line bg-elevated px-4 py-2',
                      editing ? 'left-12' : 'left-0',
                    )}
                  >
                    <Link
                      to={`/console/scores/students/${item.userId}`}
                      className="block font-bold transition-colors hover:text-brand-600 dark:hover:text-brand-300"
                      title="查看学生详情"
                    >
                      {name}
                    </Link>
                  </td>
                  <td className="tabular border-b border-r border-line px-4 py-2 text-fg-muted">
                    {studentId || '—'}
                  </td>
                  <td className="border-b border-r border-line px-4 py-2">
                    {item.reason ? (
                      <div
                        className="max-w-[16rem] truncate text-fg-muted"
                        title={item.reason}
                      >
                        {item.reason}
                      </div>
                    ) : (
                      <span className="text-fg-subtle">—</span>
                    )}
                  </td>
                  <td className="border-b border-r border-line px-4 py-2">
                    <Tooltip delay={0}>
                      <Tooltip.Trigger className="inline-flex">
                        <Chip size="sm" variant="soft" color={status.color}>
                          {status.label}
                        </Chip>
                      </Tooltip.Trigger>
                      <Tooltip.Content showArrow>{status.tooltip}</Tooltip.Content>
                    </Tooltip>
                  </td>
                  {hasScoreCols &&
                    experiments.flatMap((experiment) =>
                      SCORE_TYPES.map((type) => {
                        const value = scores.get(
                          scoreKey(item.userId, type.value, experiment.id),
                        )
                        return (
                          <td
                            key={`${experiment.id}:${type.value}`}
                            className="border-b border-r border-line px-2 py-1.5 text-center"
                          >
                            <span
                              className={cn(
                                'tabular',
                                value == null && 'text-fg-subtle',
                              )}
                            >
                              {value ?? '—'}
                            </span>
                          </td>
                        )
                      }),
                    )}
                  {hasActions && (
                    <td className="border-b border-r border-line px-2 py-1.5">
                      <div className="flex items-center gap-1">
                        <Button
                          size="sm"
                          variant="ghost"
                          onPress={() => onEditReason(item)}
                        >
                          修改
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-danger"
                          onPress={() => onDelete(item)}
                        >
                          删除
                        </Button>
                      </div>
                    </td>
                  )}
                  <td aria-hidden className="border-b border-line" />
                </tr>
              )
            })}
          </tbody>
        </table>
      )}
    </div>
  )
}
