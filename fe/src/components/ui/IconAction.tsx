import { Button, Spinner, Tooltip } from '@heroui/react'
import type { ComponentProps, ReactNode } from 'react'

export function IconAction({
  label,
  tooltip,
  placement = 'top',
  size = 'sm',
  variant = 'ghost',
  isDisabled,
  isPending,
  onPress,
  children,
}: {
  label: string
  tooltip?: ReactNode
  placement?: 'top' | 'bottom' | 'left' | 'right'
  size?: 'sm' | 'md'
  variant?: ComponentProps<typeof Button>['variant']
  isDisabled?: boolean
  isPending?: boolean
  onPress?: () => void
  children: ReactNode
}) {
  return (
    <Tooltip delay={0}>
      <Tooltip.Trigger className="inline-flex">
        <Button
          isIconOnly
          size={size}
          variant={variant}
          aria-label={label}
          isDisabled={isDisabled}
          isPending={isPending}
          onPress={onPress}
        >
          {isPending ? <Spinner color="current" size="sm" /> : children}
        </Button>
      </Tooltip.Trigger>
      <Tooltip.Content placement={placement} showArrow>
        {tooltip ?? label}
      </Tooltip.Content>
    </Tooltip>
  )
}
