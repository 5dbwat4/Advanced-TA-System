import { Button, Calendar, DateField, DatePicker, Label } from '@heroui/react'
import { parseAbsoluteToLocal, type ZonedDateTime } from '@internationalized/date'

import X from '~icons/lucide/x'

function toZoned(value: string | null): ZonedDateTime | null {
  if (!value) return null
  try {
    return parseAbsoluteToLocal(value)
  } catch {
    return null
  }
}

export function DateTimePicker({
  label,
  value,
  onChange,
  isDisabled,
}: {
  label: string
  /** ISO 字符串或 null */
  value: string | null
  onChange: (value: string | null) => void
  isDisabled?: boolean
}) {
  return (
    <DatePicker<ZonedDateTime>
      className="w-full"
      granularity="minute"
      hourCycle={24}
      hideTimeZone
      value={toZoned(value)}
      onChange={(next) => onChange(next ? next.toDate().toISOString() : null)}
      isDisabled={isDisabled}
    >
      <Label className="mb-1.5 block text-xs font-semibold text-fg-muted">{label}</Label>
      <DateField.Group fullWidth>
        <DateField.Input>{(segment) => <DateField.Segment segment={segment} />}</DateField.Input>
        <DateField.Suffix>
          {value && !isDisabled && (
            <Button
              isIconOnly
              size="sm"
              variant="ghost"
              aria-label={`清除${label}`}
              onPress={() => onChange(null)}
            >
              <X width={14} height={14} className="shrink-0" />
            </Button>
          )}
          <DatePicker.Trigger>
            <DatePicker.TriggerIndicator />
          </DatePicker.Trigger>
        </DateField.Suffix>
      </DateField.Group>
      <DatePicker.Popover>
        <Calendar aria-label={label}>
          <Calendar.Header>
            <Calendar.YearPickerTrigger>
              <Calendar.YearPickerTriggerHeading />
              <Calendar.YearPickerTriggerIndicator />
            </Calendar.YearPickerTrigger>
            <Calendar.NavButton slot="previous" />
            <Calendar.NavButton slot="next" />
          </Calendar.Header>
          <Calendar.Grid>
            <Calendar.GridHeader>{(day) => <Calendar.HeaderCell>{day}</Calendar.HeaderCell>}</Calendar.GridHeader>
            <Calendar.GridBody>{(date) => <Calendar.Cell date={date} />}</Calendar.GridBody>
          </Calendar.Grid>
          <Calendar.YearPickerGrid>
            <Calendar.YearPickerGridBody>
              {({ year }) => <Calendar.YearPickerCell year={year} />}
            </Calendar.YearPickerGridBody>
          </Calendar.YearPickerGrid>
        </Calendar>
      </DatePicker.Popover>
    </DatePicker>
  )
}
