import { Radio, RadioGroup } from '@heroui/react'

import { DateTimePicker } from '@/components/ui/DateTimePicker'

import { sectionClass, sectionTitleClass, type StartModeChoice } from './types'

type StartTimeSectionProps = {
  isEditing: boolean
  startMode: StartModeChoice
  startAt: string | null
  onStartModeChange: (mode: StartModeChoice) => void
  onStartAtChange: (value: string | null) => void
}

export function StartTimeSection({
  isEditing,
  startMode,
  startAt,
  onStartModeChange,
  onStartAtChange,
}: StartTimeSectionProps) {
  return (
    <section className={sectionClass}>
      <h2 className={sectionTitleClass}>定时开始？</h2>
      <RadioGroup
        className="mt-3"
        orientation="horizontal"
        value={startMode}
        onChange={(value) => {
          onStartModeChange(value as StartModeChoice)
          if (value === 'now') onStartAtChange(null)
        }}
      >
        {isEditing && (
          <Radio value="unchanged">
            <Radio.Content>
              <Radio.Control>
                <Radio.Indicator />
              </Radio.Control>
              不修改
            </Radio.Content>
          </Radio>
        )}
        <Radio value="now">
          <Radio.Content>
            <Radio.Control>
              <Radio.Indicator />
            </Radio.Control>
            立刻
          </Radio.Content>
        </Radio>
        <Radio value="scheduled">
          <Radio.Content>
            <Radio.Control>
              <Radio.Indicator />
            </Radio.Control>
            定时
          </Radio.Content>
        </Radio>
      </RadioGroup>

      {startMode === 'scheduled' && (
        <div className="mt-4">
          <DateTimePicker label="开始时间" value={startAt} onChange={onStartAtChange} />
        </div>
      )}
    </section>
  )
}
