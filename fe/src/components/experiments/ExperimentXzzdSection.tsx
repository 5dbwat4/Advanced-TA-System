import { Button } from '@heroui/react'
import ArrowUp from '~icons/lucide/arrow-up'
import GraduationCap from '~icons/lucide/graduation-cap'
import SlidersHorizontal from '~icons/lucide/sliders-horizontal'

import { HomeworkTag, SyncStat } from '@/components/experiments/ExperimentDetailParts'
import { IconAction } from '@/components/ui/IconAction'
import type { Experiment } from '@/lib/api'
import { formatLocaleDateTime } from '@/lib/format'

type ExperimentXzzdSectionProps = {
  readonly: boolean
  experiment: Experiment
  boundCount: number
  onBind: () => void
  onPush: () => void
  onOpenPreferences: () => void
}

export function ExperimentXzzdSection({
  readonly,
  experiment,
  boundCount,
  onBind,
  onPush,
  onOpenPreferences,
}: ExperimentXzzdSectionProps) {
  if (readonly) return null

  return (
    <div className="mb-4 rounded-2xl border border-line bg-elevated">
      <div className="flex w-full items-center gap-3 rounded-2xl p-5 text-left">
        <GraduationCap
          width={16}
          height={16}
          className="shrink-0 text-brand-600 dark:text-brand-300"
        />
        <span className="text-sm font-bold">学在浙大作业</span>
        <span className="ml-auto text-xs text-fg-subtle">
          {boundCount === 0 ? '未绑定' : `已绑定 ${boundCount}/2`}
        </span>
      </div>
      <div className="flex flex-col gap-4 border-t border-line p-5">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-3 rounded-2xl border border-line p-4">
          <div className="flex items-center gap-3">
            <span className="text-sm text-fg-muted">验收</span>
            <HomeworkTag
              id={experiment.xzzdBindIdCheckout}
              courseId={experiment.klass?.xzzdClassId ?? null}
            />
          </div>
          <div className="flex items-center gap-3">
            <span className="text-sm text-fg-muted">报告</span>
            <HomeworkTag
              id={experiment.xzzdBindIdReport}
              courseId={experiment.klass?.xzzdClassId ?? null}
            />
          </div>
          <Button className="sm:ml-auto" size="sm" variant="secondary" onPress={onBind}>
            {boundCount > 0 ? '重新绑定' : '绑定'}
          </Button>
        </div>

        <div className="flex flex-wrap items-center gap-4 rounded-2xl border border-line p-4">
          <div className="flex flex-col gap-1">
            <p className="text-xs font-semibold text-fg-muted">上次同步时间</p>
            <SyncStat
              icon={<ArrowUp width={14} height={14} className="shrink-0" />}
              tooltip="向上游推送成绩时间"
              time={formatLocaleDateTime(experiment.lastXzzdUpSyncAt, '—')}
            />
          </div>
          <div className="ml-auto flex items-center gap-2">
            <Button variant="secondary" onPress={onPush}>
              向上游推送成绩
            </Button>
            <IconAction
              label="偏好设置"
              variant="secondary"
              size="md"
              onPress={onOpenPreferences}
            >
              <SlidersHorizontal width={16} height={16} className="shrink-0" />
            </IconAction>
          </div>
        </div>
      </div>
    </div>
  )
}
