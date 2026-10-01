import { Button, Tooltip } from '@heroui/react'
import type { ComponentProps, ReactNode } from 'react'

export function IconAction({
  label,
  placement = 'top',
  size = 'sm',
  variant = 'ghost',
  onPress,
  children,
}: {
  label: string
  placement?: 'top' | 'bottom' | 'left' | 'right'
  size?: 'sm' | 'md'
  variant?: ComponentProps<typeof Button>['variant']
  onPress: () => void
  children: ReactNode
}) {
  return (
    <Tooltip delay={0}>
      <Tooltip.Trigger className="inline-flex">
        <Button isIconOnly size={size} variant={variant} aria-label={label} onPress={onPress}>
          {children}
        </Button>
      </Tooltip.Trigger>
      <Tooltip.Content placement={placement} showArrow>
        {label}
      </Tooltip.Content>
    </Tooltip>
  )
}
