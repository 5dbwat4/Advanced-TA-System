import { Input, ListBox, Select } from '@heroui/react'

import type { CriteriaVisibility } from '@/lib/api'

export function CriteriaMetadataForm({
  name,
  classId,
  className,
  visibility,
  disabled = false,
  onNameChange,
  onVisibilityChange,
}: {
  name: string
  classId: string
  className: string | null
  visibility: CriteriaVisibility
  disabled?: boolean
  onNameChange: (name: string) => void
  onVisibilityChange: (visibility: CriteriaVisibility) => void
}) {
  return (
    <div className="mb-4 grid gap-4 rounded-2xl border border-line bg-elevated p-4 md:grid-cols-2">
      <div>
        <label className="mb-1.5 block text-xs font-semibold text-fg-muted">名称</label>
        <Input
          fullWidth
          maxLength={120}
          placeholder="例如：Lab 5 报告评分标准"
          value={name}
          isDisabled={disabled}
          onChange={(event) => onNameChange(event.target.value)}
          aria-label="评分标准名称"
        />
      </div>
      <div>
        <label className="mb-1.5 block text-xs font-semibold text-fg-muted">可见性</label>
        <Select
          className="w-full"
          aria-label="评分标准可见性"
          value={visibility}
          isDisabled={disabled}
          onChange={(key) => onVisibilityChange(key === 'public' ? 'public' : 'private')}
        >
          <Select.Trigger>
            <Select.Value />
            <Select.Indicator />
          </Select.Trigger>
          <Select.Popover>
            <ListBox>
              <ListBox.Item id="private" textValue="private（仅本课程 staff 可列出）">
                private（仅本课程 staff 可列出）
                <ListBox.ItemIndicator />
              </ListBox.Item>
              <ListBox.Item id="public" textValue="public（所有登录用户可列出）">
                public（所有登录用户可列出）
                <ListBox.ItemIndicator />
              </ListBox.Item>
            </ListBox>
          </Select.Popover>
        </Select>
      </div>
      <div className="md:col-span-2">
        <label className="mb-1.5 block text-xs font-semibold text-fg-muted">课程</label>
        <div className="rounded-lg border border-line bg-sunken px-3 py-2 text-sm">
          <div className="font-medium">{className ?? '未关联课程'}</div>
          <div className="tabular mt-0.5 break-all text-[11px] text-fg-subtle">
            {classId || '未关联课程'}
          </div>
        </div>
      </div>
    </div>
  )
}
