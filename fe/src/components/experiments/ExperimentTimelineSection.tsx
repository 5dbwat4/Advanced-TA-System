import { IconAction } from '@/components/ui/IconAction'
import { DateTimePicker } from '@/components/ui/DateTimePicker'
import type { Experiment } from '@/lib/api'
import CalendarClock from '~icons/lucide/calendar-clock'
import Check from '~icons/lucide/check'
import Pencil from '~icons/lucide/pencil'
import X from '~icons/lucide/x'

import { TimeStat } from '@/components/experiments/ExperimentDetailParts'

type ExperimentTimelineSectionProps = {
  readonly: boolean
  experiment: Experiment
  publishDraft: string | null
  checkoffDeadlineDraft: string | null
  reportDeadlineDraft: string | null
  onPublishChange: (value: string | null) => void
  onCheckoffDeadlineChange: (value: string | null) => void
  onReportDeadlineChange: (value: string | null) => void
  savingTimeline: boolean
  showTimelineEditor: boolean
  hasTimeline: boolean
  dirty: boolean
  onEdit: () => void
  onCancel: () => void
  onSave: () => void
}

export function ExperimentTimelineSection({
  readonly,
  experiment,
  publishDraft,
  checkoffDeadlineDraft,
  reportDeadlineDraft,
  onPublishChange,
  onCheckoffDeadlineChange,
  onReportDeadlineChange,
  savingTimeline,
  showTimelineEditor,
  hasTimeline,
  dirty,
  onEdit,
  onCancel,
  onSave,
}: ExperimentTimelineSectionProps) {
  return (
    <div className="mb-4 rounded-2xl border border-line bg-elevated p-5">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <CalendarClock
            width={16}
            height={16}
            className="shrink-0 text-brand-600 dark:text-brand-300"
          />
          <span className="text-sm font-bold">时间线</span>
        </div>
        {!readonly && (
          <div className="ml-auto flex items-center gap-2">
            {showTimelineEditor ? (
              <>
                {hasTimeline && (
                  <IconAction
                    label="取消编辑"
                    tooltip="取消"
                    placement="bottom"
                    variant="secondary"
                    isDisabled={savingTimeline}
                    onPress={onCancel}
                  >
                    <X width={15} height={15} className="shrink-0" />
                  </IconAction>
                )}
                <IconAction
                  label="保存时间线"
                  tooltip="保存"
                  placement="bottom"
                  isDisabled={!dirty}
                  isPending={savingTimeline}
                  onPress={onSave}
                >
                  <Check width={16} height={16} className="shrink-0" />
                </IconAction>
              </>
            ) : (
              <IconAction
                label="编辑时间线"
                tooltip="编辑"
                placement="bottom"
                variant="secondary"
                onPress={onEdit}
              >
                <Pencil width={15} height={15} className="shrink-0" />
              </IconAction>
            )}
          </div>
        )}
      </div>
      {showTimelineEditor ? (
        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <DateTimePicker
            label="公开时间"
            value={publishDraft}
            onChange={onPublishChange}
            isDisabled={savingTimeline}
          />
          <DateTimePicker
            label="验收截止时间"
            value={checkoffDeadlineDraft}
            onChange={onCheckoffDeadlineChange}
            isDisabled={savingTimeline}
          />
          <DateTimePicker
            label="报告提交截止时间"
            value={reportDeadlineDraft}
            onChange={onReportDeadlineChange}
            isDisabled={savingTimeline}
          />
        </div>
      ) : (
        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <TimeStat label="公开时间" value={experiment.publishTime} />
          <TimeStat label="验收截止时间" value={experiment.checkoffDeadline} />
          <TimeStat label="报告提交截止时间" value={experiment.reportDeadline} />
        </div>
      )}
    </div>
  )
}
