export function StudentIdentity({
  name,
  studentNo,
  size = 'sm',
}: {
  name: string
  studentNo: string
  size?: 'sm' | 'lg'
}) {
  return (
    <div className={size === 'lg' ? 'flex items-center gap-4' : 'flex items-center gap-3'}>
      <div
        className={
          size === 'lg'
            ? 'flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-brand-500/15 to-amber-500/10 text-sm font-bold text-brand-600 dark:text-brand-300'
            : 'flex h-9 w-9 items-center justify-center rounded-lg bg-brand-500/10 text-sm font-bold text-brand-600 dark:text-brand-300'
        }
      >
        {name.slice(0, 1)}
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate font-semibold text-fg">{name}</div>
        <div className="tabular mt-0.5 text-xs text-fg-muted">{studentNo}</div>
      </div>
    </div>
  )
}
