import { AvatarImage } from '@/components/ui/AvatarImage'
import type { CheckoffPerson } from '@/lib/checkoff-socket'

function Person({
  label,
  person,
}: {
  label: string
  person: CheckoffPerson | null
}) {
  const name = person?.name.trim() || '未选择'
  return (
    <div className="flex min-w-0 flex-1 items-center gap-2">
      <AvatarImage id={person?.avatar ?? null} size={28} fallback={name.slice(0, 1)} />
      <div className="min-w-0">
        <div className="text-[10px] font-semibold uppercase tracking-widest text-fg-subtle">
          {label}
        </div>
        <div className="truncate text-sm font-semibold text-fg">{name}</div>
      </div>
    </div>
  )
}

export function CheckinHeader({
  grader,
  student,
}: {
  grader: CheckoffPerson
  student: CheckoffPerson | null
}) {
  return (
    <div className="mb-3 flex items-center gap-3 rounded-2xl border border-line bg-elevated/70 px-4 py-2.5 shadow-lg backdrop-blur-xl">
      <Person label="验收人" person={grader} />
      <div className="h-8 w-px shrink-0 bg-line" />
      <Person label="被验收人" person={student} />
    </div>
  )
}
