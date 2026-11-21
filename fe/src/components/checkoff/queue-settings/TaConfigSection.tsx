import {
  ListBox,
  Radio,
  RadioGroup,
  Select,
} from '@heroui/react'

import { AvatarImage } from '@/components/ui/AvatarImage'
import type { CheckoffExperiment, StaffMember } from '@/lib/api'

import { keysToArray, sectionClass, sectionTitleClass } from './types'

type TaConfigSectionProps = {
  tas: StaffMember[]
  taIds: string[]
  selectedTas: StaffMember[]
  allowStudentChooseTa: boolean
  taPreferences: Record<string, string[]>
  taPreferenceExperiments: CheckoffExperiment[]
  onTaIdsChange: (ids: string[]) => void
  onAllowStudentChooseTaChange: (value: boolean) => void
  onTaPreferenceChange: (taId: string, ids: string[]) => void
}

export function TaConfigSection({
  tas,
  taIds,
  selectedTas,
  allowStudentChooseTa,
  taPreferences,
  taPreferenceExperiments,
  onTaIdsChange,
  onAllowStudentChooseTaChange,
  onTaPreferenceChange,
}: TaConfigSectionProps) {
  return (
    <section className={sectionClass}>
      <h2 className={sectionTitleClass}>哪些助教将参与验收？</h2>
      <div className="mt-3">
        <Select
          fullWidth
          selectionMode="multiple"
          aria-label="参与验收的助教"
          placeholder="选择一个或多个助教"
          value={taIds}
          onChange={(value) => onTaIdsChange(keysToArray(value))}
        >
          <Select.Trigger>
            <Select.Value>
              {({ defaultChildren, isPlaceholder, state }) => {
                if (isPlaceholder || state.selectedItems.length === 0) return defaultChildren
                return (
                  <span className="flex flex-wrap items-center gap-1">
                    {state.selectedItems.map((item) => {
                      const ta = tas.find((candidate) => candidate.id === String(item.key))
                      if (!ta) return null
                      return (
                        <span
                          key={ta.id}
                          className="inline-flex items-center gap-1 rounded-full bg-sunken px-2 py-0.5"
                        >
                          <AvatarImage
                            id={ta.avatar}
                            size={16}
                            fallback={ta.name.slice(0, 1)}
                          />
                          <span className="text-xs font-medium">{ta.name}</span>
                          <span className="tabular text-[11px] text-fg-subtle">
                            {ta.studentId}
                          </span>
                        </span>
                      )
                    })}
                  </span>
                )
              }}
            </Select.Value>
            <Select.Indicator />
          </Select.Trigger>
          <Select.Popover>
            <ListBox
              selectionMode="multiple"
              renderEmptyState={() => (
                <div className="px-3 py-6 text-sm text-fg-subtle">本班暂无助教</div>
              )}
            >
              {tas.map((ta) => (
                <ListBox.Item
                  key={ta.id}
                  id={ta.id}
                  textValue={`${ta.name} ${ta.studentId}`}
                >
                  <span className="flex min-w-0 flex-1 items-center gap-2">
                    <AvatarImage id={ta.avatar} size={24} fallback={ta.name.slice(0, 1)} />
                    <span className="truncate">{ta.name}</span>
                    <span className="tabular truncate text-xs text-fg-subtle">
                      {ta.studentId}
                    </span>
                  </span>
                  <ListBox.ItemIndicator />
                </ListBox.Item>
              ))}
            </ListBox>
          </Select.Popover>
        </Select>
      </div>

      <div className="mt-4">
        <div className="text-xs font-semibold text-fg-muted">是否允许学生选择助教</div>
        <RadioGroup
          className="mt-2"
          orientation="horizontal"
          value={allowStudentChooseTa ? 'yes' : 'no'}
          onChange={(value) => onAllowStudentChooseTaChange(value === 'yes')}
        >
          <Radio value="yes">
            <Radio.Content>
              <Radio.Control>
                <Radio.Indicator />
              </Radio.Control>
              允许
            </Radio.Content>
          </Radio>
          <Radio value="no">
            <Radio.Content>
              <Radio.Control>
                <Radio.Indicator />
              </Radio.Control>
              不允许
            </Radio.Content>
          </Radio>
        </RadioGroup>
      </div>

      <h3 className="mt-5 text-xs font-semibold text-fg-muted">助教验收偏好</h3>
      <p className="mt-1 text-xs text-fg-subtle">不会影响实际分配。</p>
      <div className="mt-3 flex flex-col gap-2">
        {selectedTas.length === 0 ? (
          <div className="rounded-xl border border-dashed border-line px-4 py-5 text-center text-xs text-fg-subtle">
            请先选择参与验收的助教
          </div>
        ) : (
          selectedTas.map((ta) => (
            <div
              key={ta.id}
              className="flex flex-col gap-2 rounded-xl border border-line px-3 py-2.5 sm:flex-row sm:items-center"
            >
              <div className="flex min-w-0 items-center gap-2 sm:w-44 sm:shrink-0">
                <AvatarImage id={ta.avatar} size={28} fallback={ta.name.slice(0, 1)} />
                <span className="truncate text-sm font-semibold">{ta.name}</span>
              </div>
              <Select
                fullWidth
                selectionMode="multiple"
                className="sm:flex-1"
                aria-label={`${ta.name}的验收偏好`}
                placeholder="无偏好"
                value={taPreferences[ta.id] ?? []}
                onChange={(value) => onTaPreferenceChange(ta.id, keysToArray(value))}
              >
                <Select.Trigger>
                  <Select.Value />
                  <Select.Indicator />
                </Select.Trigger>
                <Select.Popover>
                  <ListBox
                    selectionMode="multiple"
                    renderEmptyState={() => (
                      <div className="px-3 py-6 text-sm text-fg-subtle">暂无可选实验</div>
                    )}
                  >
                    {taPreferenceExperiments.map((experiment) => (
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
          ))
        )}
      </div>
    </section>
  )
}
