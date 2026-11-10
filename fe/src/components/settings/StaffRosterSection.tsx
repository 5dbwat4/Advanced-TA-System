import { Spinner } from '@heroui/react'
import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'

import Users from '~icons/lucide/users'
import { AvatarImage } from '@/components/ui/AvatarImage'
import { Card } from '@/components/ui/Card'
import { SectionHeader } from '@/components/ui/SectionHeader'
import { listClassStaff, type InvitableRole, type StaffMember } from '@/lib/api'
import { getErrorMessage } from '@/lib/error'
import { useCurrentClass } from '@/lib/store'

const ROLE_LABELS: Record<InvitableRole, string> = {
  TA: '助教',
  TEACHER: '教师',
  VIEWER: '观察者',
}

const ROLE_CLASSNAMES: Record<InvitableRole, string> = {
  TEACHER: 'bg-brand-500/10 text-brand-600 dark:text-brand-300',
  TA: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-300',
  VIEWER: 'bg-sunken text-fg-muted',
}

export function StaffRosterSection({ index = 0 }: { index?: number }) {
  const currentClass = useCurrentClass()
  const classId = currentClass?.id ?? null

  const [members, setMembers] = useState<StaffMember[]>([])
  const [loading, setLoading] = useState(false)

  const reload = useCallback(async () => {
    if (!classId) {
      setMembers([])
      return
    }
    setLoading(true)
    try {
      setMembers(await listClassStaff(classId))
    } catch (error) {
      toast.error(getErrorMessage(error, '加载 Staff 名单失败'))
    } finally {
      setLoading(false)
    }
  }, [classId])

  useEffect(() => {
    void reload()
  }, [reload])

  return (
    <Card index={index}>
      <SectionHeader icon={Users} busy={loading}>
        Staff 名单
      </SectionHeader>

      {!classId ? (
        <p className="mt-3 text-xs text-fg-subtle">请先在右上角选择或绑定一个课程。</p>
      ) : loading && members.length === 0 ? (
        <div className="mt-4 flex flex-col items-center gap-2 rounded-xl border border-dashed border-line py-8 text-center">
          <Spinner color="current" size="sm" />
          <div className="text-xs text-fg-subtle">正在加载 Staff 名单…</div>
        </div>
      ) : members.length === 0 ? (
        <div className="mt-4 rounded-xl border border-dashed border-line py-8 text-center text-xs text-fg-subtle">
          暂无 Staff 成员
        </div>
      ) : (
        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          {members.map((member) => (
            <div
              key={member.id}
              className="flex items-center gap-3 rounded-xl border border-line px-4 py-3"
            >
              <AvatarImage
                id={member.avatar}
                size={36}
                fallback={member.name.slice(0, 1)}
              />
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-semibold text-fg">{member.name}</div>
                <div className="truncate text-xs text-fg-subtle">
                  {member.username ? `@${member.username}` : '未设置用户名'}
                </div>
              </div>
              <span
                className={`shrink-0 rounded-lg px-2 py-0.5 text-[11px] font-semibold ${ROLE_CLASSNAMES[member.role]}`}
              >
                {ROLE_LABELS[member.role]}
              </span>
            </div>
          ))}
        </div>
      )}
    </Card>
  )
}
