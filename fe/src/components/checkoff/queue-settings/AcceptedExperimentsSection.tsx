import { ListBox, Select } from '@heroui/react'

import type { CheckoffExperiment } from '@/lib/api'

import { keysToArray, sectionClass, sectionTitleClass } from './types'

type AcceptedExperimentsSectionProps = {
  experiments: CheckoffExperiment[]
  acceptedIds: string[]
  priorityIds: string[]
  acceptedExperiments: CheckoffExperiment[]
  onAcceptedChange: (ids: string[]) => void
  onPriorityChange: (ids: string[]) => void
}

export function AcceptedExperimentsSection({
  experiments,
  acceptedIds,
  priorityIds,
  acceptedExperiments,
  onAcceptedChange,
  onPriorityChange,
}: AcceptedExperimentsSectionProps) {
  return (
    <section className={sectionClass}>
      <h2 className={sectionTitleClass}>接受验收哪些实验？</h2>
      <div className="mt-3">
        <Select
          fullWidth
          selectionMode="multiple"
          aria-label="接受验收的实验"
          placeholder="选择一个或多个实验"
          value={acceptedIds}
          onChange={(value) => onAcceptedChange(keysToArray(value))}
        >
          <Select.Trigger>
            <Select.Value />
            <Select.Indicator />
          </Select.Trigger>
          <Select.Popover>
            <ListBox
              selectionMode="multiple"
              renderEmptyState={() => (
                <div className="px-3 py-6 text-sm text-fg-subtle">暂无可验收实验</div>
              )}
            >
              {experiments.map((experiment) => (
                <ListBox.Item
                  key={experiment.id}
                  id={experiment.id}
                  textValue={`${experiment.mark} ${experiment.title}`}
                >
                  {experiment.mark} · {experiment.title}
                  <ListBox.ItemIndicator />
                </ListBox.Item>
              ))}
            </ListBox>
          </Select.Popover>
        </Select>
      </div>

      <h2 className={`${sectionTitleClass} mt-5`}>优先验收哪些实验？</h2>
      <div className="mt-3">
        <Select
          fullWidth
          selectionMode="multiple"
          isDisabled={acceptedExperiments.length === 0}
          aria-label="优先验收的实验"
          placeholder={
            acceptedExperiments.length === 0 ? '请先选择接受验收的实验' : '无优先级'
          }
          value={priorityIds}
          onChange={(value) => onPriorityChange(keysToArray(value))}
        >
          <Select.Trigger>
            <Select.Value />
            <Select.Indicator />
          </Select.Trigger>
          <Select.Popover>
            <ListBox selectionMode="multiple">
              {acceptedExperiments.map((experiment) => (
                <ListBox.Item
                  key={experiment.id}
                  id={experiment.id}
                  textValue={`${experiment.mark} ${experiment.title}`}
                >
                  {experiment.mark} · {experiment.title}
                  <ListBox.ItemIndicator />
                </ListBox.Item>
              ))}
            </ListBox>
          </Select.Popover>
        </Select>
      </div>
    </section>
  )
}
