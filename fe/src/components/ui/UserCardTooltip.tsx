import { Tooltip } from '@heroui/react'
import type { ReactNode } from 'react'

import { AvatarImage } from '@/components/ui/AvatarImage'

export type UserCardInfo = {
  name: string
  username: string | null
  avatar: number | null
}

/** 悬停显示用户名片：顶部居中 label，下方为头像 + 姓名 + @用户名 */
export function UserCardTooltip({
  user,
  label,
  placement = 'bottom',
  children,
}: {
  user: UserCardInfo
  label?: string
  placement?: 'top' | 'bottom' | 'left' | 'right'
  children: ReactNode
}) {
  return (
    <Tooltip delay={0}>
      <Tooltip.Trigger className="inline-flex">{children}</Tooltip.Trigger>
      <Tooltip.Content placement={placement} showArrow>
        <div className="flex flex-col items-center gap-2 py-1">
          {label && (
            <div className="text-center text-xs font-semibold text-fg-subtle">{label}</div>
          )}
          <div className="flex items-center gap-3 rounded-xl bg-sunken/60 px-2 py-2">
            <AvatarImage id={user.avatar} size={36} fallback={user.name.slice(0, 1)} />
            <div className="min-w-0 flex-1 leading-tight">
              <div className="truncate text-sm font-semibold text-fg">{user.name}</div>
              {user.username && (
                <div className="truncate text-xs text-fg-subtle">@{user.username}</div>
              )}
            </div>
          </div>
        </div>
      </Tooltip.Content>
    </Tooltip>
  )
}
