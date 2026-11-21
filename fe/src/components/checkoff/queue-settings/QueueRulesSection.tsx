import { ListBox, Select, Switch } from '@heroui/react'

import { sectionClass, sectionTitleClass, type JumpMode } from './types'

type QueueRulesSectionProps = {
  allowSelfMoveDown: boolean
  jumpMode: JumpMode
  onAllowSelfMoveDownChange: (value: boolean) => void
  onJumpModeChange: (mode: JumpMode) => void
}

export function QueueRulesSection({
  allowSelfMoveDown,
  jumpMode,
  onAllowSelfMoveDownChange,
  onJumpModeChange,
}: QueueRulesSectionProps) {
  return (
    <section className={sectionClass}>
      <h2 className={sectionTitleClass}>插队和退出</h2>
      <div className="mt-4">
        <Switch isSelected={allowSelfMoveDown} onChange={onAllowSelfMoveDownChange}>
          <Switch.Content>
            <Switch.Control>
              <Switch.Thumb />
            </Switch.Control>
            允许学生自行将自己下移
          </Switch.Content>
        </Switch>
      </div>

      <div className="mt-4">
        <div className="text-xs font-semibold text-fg-muted">过号时，插队规则：</div>
        <Select
          fullWidth
          className="mt-2"
          aria-label="过号时插队规则"
          value={jumpMode}
          onChange={(value) => {
            if (typeof value === 'string') onJumpModeChange(value as JumpMode)
          }}
        >
          <Select.Trigger>
            <Select.Value />
            <Select.Indicator />
          </Select.Trigger>
          <Select.Popover>
            <ListBox>
              <ListBox.Item id="after3" textValue="允许学生在队列第 3 位后插队">
                允许学生在队列第 3 位后插队
                <ListBox.ItemIndicator />
              </ListBox.Item>
              <ListBox.Item id="anywhere" textValue="允许学生在任意位置插队">
                允许学生在任意位置插队
                <ListBox.ItemIndicator />
              </ListBox.Item>
              <ListBox.Item id="none" textValue="不允许插队">
                不允许插队
                <ListBox.ItemIndicator />
              </ListBox.Item>
            </ListBox>
          </Select.Popover>
        </Select>
      </div>
    </section>
  )
}
