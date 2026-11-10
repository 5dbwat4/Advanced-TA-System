import { useNavigate } from 'react-router-dom'

import type { TagSummary } from '@/lib/api'

export function TagLink({
  tag,
  kind = 'questions',
}: {
  tag: TagSummary
  kind?: 'questions' | 'banks'
}) {
  const navigate = useNavigate()

  return (
    <button
      type="button"
      onClick={() => navigate(`/console/tag/${tag.id}/${kind}`)}
      className="rounded-lg bg-brand-500/10 px-2 py-0.5 text-[11px] text-brand-600 transition-colors hover:bg-brand-500/20 dark:text-brand-300"
    >
      {tag.name}
    </button>
  )
}
