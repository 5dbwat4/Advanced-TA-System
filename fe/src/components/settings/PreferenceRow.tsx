import type { ReactNode } from 'react'

/** 偏好设置统一行样式：左侧标题 + 说明，右侧控件 */
export function PreferenceRow({
  title,
  hint,
  children,
}: {
  title: string
  hint?: string
  children: ReactNode
}) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-2xl border border-line bg-elevated px-4 py-3">
      <div className="min-w-0">
        <div className="text-sm font-semibold text-fg">{title}</div>
        {hint && <div className="text-xs text-fg-subtle">{hint}</div>}
      </div>
      <div className="flex shrink-0 items-center gap-2">{children}</div>
    </div>
  )
}
