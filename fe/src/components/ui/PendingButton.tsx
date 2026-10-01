import { Button, Spinner } from '@heroui/react'
import type { ComponentProps } from 'react'

import type { IconComponent } from '@/lib/icon'

type PendingButtonProps = ComponentProps<typeof Button> & {
  icon?: IconComponent
  pendingLabel?: string
}

export function PendingButton({ icon: Icon, pendingLabel, children, ...rest }: PendingButtonProps) {
  return (
    <Button {...rest}>
      {({ isPending }) => (
        <>
          {isPending ? (
            <Spinner color="current" size="sm" />
          ) : Icon ? (
            <Icon width={16} height={16} className="shrink-0" />
          ) : null}
          {isPending && pendingLabel ? pendingLabel : children}
        </>
      )}
    </Button>
  )
}
