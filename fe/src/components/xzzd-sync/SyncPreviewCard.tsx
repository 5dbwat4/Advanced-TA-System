import { Alert, ToggleButton, ToggleButtonGroup } from '@heroui/react'
import ArrowRight from '~icons/lucide/arrow-right'
import ListChecks from '~icons/lucide/list-checks'
import RefreshCw from '~icons/lucide/refresh-cw'

import { SummaryStat } from '@/components/xzzd-sync/parts'
import { Card, EmptyState } from '@/components/ui/Card'
import { PendingButton } from '@/components/ui/PendingButton'
import { SectionHeader } from '@/components/ui/SectionHeader'
import type {
  XzzdSyncApplyResult,
  XzzdSyncMode,
  XzzdSyncPreview,
} from '@/lib/api'
import { formatDateTime } from '@/lib/format'
import { cn } from '@/lib/utils'
import {
  summarizeXzzdSync,
  xzzdSyncAction,
  type XzzdSyncAction,
} from '@/lib/xzzd-sync'

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

type SyncPreviewCardProps = {
  experimentId: string
  activityId: string
  preview: XzzdSyncPreview | null
  result: XzzdSyncApplyResult | null
  summary: ReturnType<typeof summarizeXzzdSync> | null
  importable: number
  mode: XzzdSyncMode
  previewing: boolean
  applying: boolean
  mappingError: string | null
  onPreview: () => void
  onModeChange: (mode: XzzdSyncMode) => void
  onApply: () => void
}

export function SyncPreviewCard({
  experimentId,
  activityId,
  preview,
  result,
  summary,
  importable,
  mode,
  previewing,
  applying,
  mappingError,
  onPreview,
  onModeChange,
  onApply,
}: SyncPreviewCardProps) {
  return (
    <Card index={2}>
      <SectionHeader icon={ListChecks}>3. 预览并导入</SectionHeader>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <PendingButton
          variant="secondary"
          icon={RefreshCw}
          isPending={previewing}
          pendingLabel="获取中"
          isDisabled={!activityId || !experimentId || applying || Boolean(mappingError)}
          onPress={onPreview}
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
            <SummaryStat
              label="跳过 / 未匹配"
              value={(summary?.skip ?? 0) + (summary?.unmatched ?? 0)}
            />
          </div>

          <div className="flex flex-col gap-2">
            <div className="text-xs font-semibold text-fg-muted">冲突处理</div>
            <ToggleButtonGroup
              selectionMode="single"
              disallowEmptySelection
              selectedKeys={new Set([mode])}
              onSelectionChange={(keys) => {
                const first = keys.values().next().value
                if (first != null) onModeChange(String(first) as XzzdSyncMode)
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
              isDisabled={importable === 0 || previewing || Boolean(mappingError)}
              onPress={onApply}
            >
              导入成绩
            </PendingButton>
          </div>
        </div>
      )}
    </Card>
  )
}
