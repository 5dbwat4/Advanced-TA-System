import copyToClipboard from 'copy-to-clipboard'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'

import Copy from '~icons/lucide/copy'
import Eye from '~icons/lucide/eye'
import Pencil from '~icons/lucide/pencil'
import { AvatarImage } from '@/components/ui/AvatarImage'
import { IconAction } from '@/components/ui/IconAction'
import { UserCardTooltip } from '@/components/ui/UserCardTooltip'
import type { CriteriaSummary } from '@/lib/api'
import { formatRelativeTime } from '@/lib/format'
import { cn } from '@/lib/utils'

export function CriteriaRow({
  item,
  onSelect,
  onView,
}: {
  item: CriteriaSummary
  /** 提供后整行可点击 */
  onSelect?: (item: CriteriaSummary) => void
  onView?: (item: CriteriaSummary) => void
}) {
  const navigate = useNavigate()
  const clickable = Boolean(onSelect)

  const copyKey = async () => {
    if (await copyToClipboard(item.key)) toast.success('分享码已复制')
    else toast.error('复制失败，请手动复制')
  }

  return (
    <div
      role={clickable ? 'button' : undefined}
      tabIndex={clickable ? 0 : undefined}
      className={cn(
        'flex flex-wrap items-center gap-3 rounded-xl border border-line bg-sunken/40 px-3 py-2.5',
        clickable && 'cursor-pointer transition-colors hover:border-brand-500/40 hover:bg-sunken/70',
      )}
      onClick={clickable ? () => onSelect?.(item) : undefined}
      onKeyDown={
        clickable
          ? (event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault()
                onSelect?.(item)
              }
            }
          : undefined
      }
    >
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <span className="truncate text-sm font-semibold">{item.name}</span>
        <span className="shrink-0 text-[11px] text-fg-subtle">
          创建于 {formatRelativeTime(item.createdAt)}
        </span>
      </div>
      <div className="flex shrink-0 items-center gap-2" onClick={(event) => event.stopPropagation()}>
        <UserCardTooltip user={item.creator} label="创建者">
          <AvatarImage
            id={item.creator.avatar}
            size={22}
            fallback={item.creator.name.slice(0, 1)}
          />
        </UserCardTooltip>
        <IconAction label="查看详情" variant="secondary" onPress={() => onView?.(item)}>
          <Eye width={15} height={15} className="shrink-0" />
        </IconAction>
        <IconAction label="复制评分码" variant="secondary" onPress={() => void copyKey()}>
          <Copy width={15} height={15} className="shrink-0" />
        </IconAction>
        {item.canManage && (
          <IconAction
            label="编辑"
            variant="secondary"
            onPress={() => navigate(`/console/criteria/${item.key}/edit`)}
          >
            <Pencil width={15} height={15} className="shrink-0" />
          </IconAction>
        )}
      </div>
    </div>
  )
}
