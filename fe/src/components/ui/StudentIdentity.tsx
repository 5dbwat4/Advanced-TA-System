import { AvatarImage } from '@/components/ui/AvatarImage'

export function StudentIdentity({
  avatar,
  name,
  studentId,
  size = 'sm',
}: {
  avatar: number | null
  name: string
  studentId: string
  size?: 'sm' | 'lg'
}) {
  return (
    <div className={size === 'lg' ? 'flex items-center gap-4' : 'flex items-center gap-3'}>
      <AvatarImage id={avatar} size={size === 'lg' ? 44 : 36} fallback={name.slice(0, 1)} />
      <div className="min-w-0 flex-1">
        <div className="truncate font-semibold text-fg">{name}</div>
        <div className="tabular mt-0.5 text-xs text-fg-muted">{studentId}</div>
      </div>
    </div>
  )
}
