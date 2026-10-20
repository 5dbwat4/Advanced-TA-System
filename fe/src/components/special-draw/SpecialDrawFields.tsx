import { ListBox, Select } from '@heroui/react'
import type { ReactNode } from 'react'

import {
  END_VALUE,
  FLAG_OPTIONS,
  NODE_TYPE_LABEL,
} from '@/components/special-draw/special-draw-ui'
import type { SpecialDrawNode } from '@/lib/special-draw'

export function Field({
  label,
  children,
  className,
}: {
  label: string
  children: ReactNode
  className?: string
}) {
  return (
    <div className={className}>
      <div className="mb-1 text-[11px] font-semibold text-fg-muted">{label}</div>
      {children}
    </div>
  )
}

export function NodeSelect({
  label,
  value,
  onChange,
  nodes,
  nodeIndex,
  excludeId,
}: {
  label: string
  value: string | null
  onChange: (next: string | null) => void
  nodes: SpecialDrawNode[]
  nodeIndex: Map<string, number>
  excludeId: string
}) {
  return (
    <Select
      aria-label={label}
      value={value ?? END_VALUE}
      onChange={(key) => onChange(key == null || key === END_VALUE ? null : String(key))}
    >
      <Select.Trigger>
        <Select.Value />
        <Select.Indicator />
      </Select.Trigger>
      <Select.Popover>
        <ListBox>
          <ListBox.Item id={END_VALUE} textValue="结束">
            结束
            <ListBox.ItemIndicator />
          </ListBox.Item>
          {nodes
            .filter((node) => node.id !== excludeId)
            .map((node) => {
              const labelText = `#${(nodeIndex.get(node.id) ?? 0) + 1} ${NODE_TYPE_LABEL[node.type]}`
              return (
                <ListBox.Item key={node.id} id={node.id} textValue={labelText}>
                  {labelText}
                  <ListBox.ItemIndicator />
                </ListBox.Item>
              )
            })}
        </ListBox>
      </Select.Popover>
    </Select>
  )
}

export function FlagSelect({
  label,
  value,
  onChange,
}: {
  label: string
  value: number
  onChange: (next: number) => void
}) {
  return (
    <Select
      aria-label={label}
      value={String(value)}
      onChange={(key) => {
        if (key != null) onChange(Number(key))
      }}
    >
      <Select.Trigger>
        <Select.Value />
        <Select.Indicator />
      </Select.Trigger>
      <Select.Popover>
        <ListBox>
          {FLAG_OPTIONS.map((flag) => (
            <ListBox.Item key={flag} id={String(flag)} textValue={`flag ${flag}`}>
              flag {flag}
              <ListBox.ItemIndicator />
            </ListBox.Item>
          ))}
        </ListBox>
      </Select.Popover>
    </Select>
  )
}

export function BooleanSelect({
  label,
  value,
  onChange,
  trueLabel = '真',
  falseLabel = '假',
}: {
  label: string
  value: boolean
  onChange: (next: boolean) => void
  trueLabel?: string
  falseLabel?: string
}) {
  return (
    <Select
      aria-label={label}
      value={value ? 'true' : 'false'}
      onChange={(key) => onChange(key === 'true')}
    >
      <Select.Trigger>
        <Select.Value />
        <Select.Indicator />
      </Select.Trigger>
      <Select.Popover>
        <ListBox>
          <ListBox.Item id="true" textValue={trueLabel}>
            {trueLabel}
            <ListBox.ItemIndicator />
          </ListBox.Item>
          <ListBox.Item id="false" textValue={falseLabel}>
            {falseLabel}
            <ListBox.ItemIndicator />
          </ListBox.Item>
        </ListBox>
      </Select.Popover>
    </Select>
  )
}
