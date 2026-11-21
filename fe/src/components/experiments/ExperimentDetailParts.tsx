import { ListBox, Select, Tooltip } from '@heroui/react'
import type { ReactNode } from 'react'
import ExternalLink from '~icons/lucide/external-link'

import type { ZjuamHomework } from '@/lib/api'
import { formatDateTime } from '@/lib/format'

export function TimeStat({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <div className="text-xs font-semibold text-fg-muted">{label}</div>
      <div className={value ? 'tabular mt-1.5 text-sm' : 'tabular mt-1.5 text-sm text-fg-subtle'}>
        {formatDateTime(value, '未指定')}
      </div>
    </div>
  )
}

type SyncStatProps = {
  icon: ReactNode
  tooltip: string
  time: string
}

export function SyncStat({ icon, tooltip, time }: SyncStatProps) {
  return (
    <Tooltip delay={0}>
      <Tooltip.Trigger className="inline-flex w-fit items-center gap-2 text-fg-muted">
        {icon}
        <span className="tabular text-xs">{time}</span>
      </Tooltip.Trigger>
      <Tooltip.Content placement="top" showArrow>
        {tooltip}
      </Tooltip.Content>
    </Tooltip>
  )
}

export function HomeworkTag({ id, courseId }: { id: string | null; courseId: string | null }) {
  if (!id) return <span className="text-xs text-fg-subtle">未绑定</span>
  const className =
    'tabular inline-flex items-center gap-1 rounded-lg bg-brand-500/10 px-2 py-0.5 text-[11px] font-semibold text-brand-600 dark:text-brand-300'
  if (!courseId) {
    return <span className={className}>学在浙大 #{id}</span>
  }
  return (
    <a
      href={`https://courses.zju.edu.cn/course/${courseId}/learning-activity/full-screen#/${id}`}
      target="_blank"
      rel="noreferrer"
      className={`${className} transition-colors hover:bg-brand-500/20`}
    >
      学在浙大 #{id}
      <ExternalLink width={11} height={11} className="shrink-0" />
    </a>
  )
}

type HomeworkSelectProps = {
  label: string
  value: string | null
  homeworks: ZjuamHomework[]
  disabled: boolean
  onChange: (value: string | null) => void
}

export function HomeworkSelect({
  label,
  value,
  homeworks,
  disabled,
  onChange,
}: HomeworkSelectProps) {
  return (
    <div>
      <label className="mb-1.5 block text-xs font-semibold text-fg-muted">{label}</label>
      <Select
        className="w-full"
        aria-label={label}
        isDisabled={disabled}
        value={value}
        placeholder="未绑定"
        onChange={(key) => onChange(key == null ? null : String(key))}
        onClear={() => onChange(null)}
      >
        <Select.Trigger>
          <Select.Value />
          <Select.ClearButton />
          <Select.Indicator />
        </Select.Trigger>
        <Select.Popover>
          <ListBox>
            {homeworks.map((homework) => (
              <ListBox.Item key={homework.id} id={String(homework.id)} textValue={homework.title}>
                {homework.title}
                <ListBox.ItemIndicator />
              </ListBox.Item>
            ))}
          </ListBox>
        </Select.Popover>
      </Select>
    </div>
  )
}
