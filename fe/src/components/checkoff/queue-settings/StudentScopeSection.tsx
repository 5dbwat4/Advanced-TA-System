import { ListBox, Radio, RadioGroup, Select } from '@heroui/react'

import { AvatarImage } from '@/components/ui/AvatarImage'
import type { CheckoffStudent } from '@/lib/api'

import {
  keysToArray,
  sectionClass,
  sectionTitleClass,
  type StudentScope,
} from './types'

type StudentScopeSectionProps = {
  className: string
  students: CheckoffStudent[]
  studentScope: StudentScope
  studentIds: string[]
  onScopeChange: (scope: StudentScope) => void
  onStudentIdsChange: (ids: string[]) => void
}

export function StudentScopeSection({
  className,
  students,
  studentScope,
  studentIds,
  onScopeChange,
  onStudentIdsChange,
}: StudentScopeSectionProps) {
  const renderStudentSelect = (scope: 'whitelist' | 'blacklist') => (
    <Select
      fullWidth
      selectionMode="multiple"
      aria-label={scope === 'whitelist' ? '白名单学生' : '黑名单学生'}
      placeholder={scope === 'whitelist' ? '选择参与验收的学生' : '选择不参与验收的学生'}
      value={studentIds}
      onChange={(value) => onStudentIdsChange(keysToArray(value))}
    >
      <Select.Trigger>
        <Select.Value>
          {({ defaultChildren, isPlaceholder, state }) => {
            if (isPlaceholder || state.selectedItems.length === 0) return defaultChildren
            return (
              <span className="flex flex-wrap items-center gap-1">
                {state.selectedItems.map((item) => {
                  const student = students.find(
                    (candidate) => candidate.userId === String(item.key),
                  )
                  if (!student) return null
                  return (
                    <span
                      key={student.userId}
                      className="inline-flex items-center gap-1 rounded-full bg-sunken px-2 py-0.5"
                    >
                      <AvatarImage
                        id={student.avatar}
                        size={16}
                        fallback={student.name.slice(0, 1)}
                      />
                      <span className="text-xs font-medium">{student.name}</span>
                      <span className="tabular text-[11px] text-fg-subtle">
                        {student.studentId}
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
        <ListBox selectionMode="multiple">
          {students.map((student) => (
            <ListBox.Item
              key={student.userId}
              id={student.userId}
              textValue={`${student.name} ${student.studentId}`}
            >
              <span className="flex min-w-0 flex-1 items-center gap-2">
                <AvatarImage
                  id={student.avatar}
                  size={24}
                  fallback={student.name.slice(0, 1)}
                />
                <span className="truncate">{student.name}</span>
                <span className="tabular truncate text-xs text-fg-subtle">
                  {student.studentId}
                </span>
              </span>
              <ListBox.ItemIndicator />
            </ListBox.Item>
          ))}
        </ListBox>
      </Select.Popover>
    </Select>
  )

  return (
    <section className={sectionClass}>
      <h2 className={sectionTitleClass}>哪些学生将参与验收？</h2>
      <div className="mt-3 rounded-xl bg-sunken/50 px-4 py-3 text-sm text-fg-muted">
        当前班级 <span className="font-semibold text-fg">{className}</span>
        <span className="mx-3 text-fg-subtle">|</span>
        共有 <span className="tabular font-semibold text-fg">{students.length}</span> 名学生
      </div>

      <RadioGroup
        className="mt-4"
        value={studentScope}
        onChange={(value) => onScopeChange(value as StudentScope)}
      >
        <div>
          <Radio value="all">
            <Radio.Content>
              <Radio.Control>
                <Radio.Indicator />
              </Radio.Control>
              所有
            </Radio.Content>
          </Radio>
        </div>
        <div>
          <Radio value="whitelist">
            <Radio.Content>
              <Radio.Control>
                <Radio.Indicator />
              </Radio.Control>
              白名单
            </Radio.Content>
          </Radio>
          {studentScope === 'whitelist' && (
            <div className="ms-7 mt-2">{renderStudentSelect('whitelist')}</div>
          )}
        </div>
        <div>
          <Radio value="blacklist">
            <Radio.Content>
              <Radio.Control>
                <Radio.Indicator />
              </Radio.Control>
              黑名单
            </Radio.Content>
          </Radio>
          {studentScope === 'blacklist' && (
            <div className="ms-7 mt-2">{renderStudentSelect('blacklist')}</div>
          )}
        </div>
      </RadioGroup>
    </section>
  )
}
