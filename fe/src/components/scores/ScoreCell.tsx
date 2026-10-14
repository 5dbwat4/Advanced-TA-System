import { Input, Tooltip } from '@heroui/react'
import { useEffect, useState, type KeyboardEvent } from 'react'
import { toast } from 'sonner'

import type { Score } from '@/lib/api'
import { formatLocaleDateTime } from '@/lib/format'
import { SCORE_LIMIT, SCORE_MAX } from '@/lib/scores'
import { cn } from '@/lib/utils'

/** 单个分数输入格：失焦提交，支持超出 0~100 时二次确认 */
export function ScoreCell({
  score,
  onCommit,
  onOutOfRange,
}: {
  score: Score | null
  onCommit: (next: number | null) => Promise<void>
  onOutOfRange: (next: number) => void
}) {
  const value = score?.score ?? null
  const [draft, setDraft] = useState(value === null ? '' : String(value))
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    setDraft(value === null ? '' : String(value))
  }, [value])

  const current = value === null ? '' : String(value)

  const commit = async () => {
    const trimmed = draft.trim()
    if (trimmed === current) return
    if (trimmed === '') {
      setSaving(true)
      try {
        await onCommit(null)
      } catch {
        setDraft(current)
      } finally {
        setSaving(false)
      }
      return
    }
    const parsed = Number(trimmed)
    if (Number.isNaN(parsed) || parsed < -SCORE_LIMIT || parsed > SCORE_LIMIT) {
      toast.error(`请输入 ${-SCORE_LIMIT}~${SCORE_LIMIT} 的分数`)
      setDraft(current)
      return
    }
    if (parsed < 0 || parsed > SCORE_MAX) {
      setDraft(current)
      onOutOfRange(parsed)
      return
    }
    setSaving(true)
    try {
      await onCommit(parsed)
    } catch {
      setDraft(current)
    } finally {
      setSaving(false)
    }
  }

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault()
      event.currentTarget.blur()
    } else if (event.key === 'Escape') {
      setDraft(current)
      event.currentTarget.blur()
    }
  }

  const input = (
    <Input
      type="number"
      min={-SCORE_LIMIT}
      max={SCORE_LIMIT}
      step="1"
      value={draft}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={commit}
      onKeyDown={onKeyDown}
      aria-label="分数"
      className={cn(
        'tabular w-16 rounded-lg border border-line bg-elevated px-2 py-1 text-center text-sm outline-none transition-all focus:border-brand-500 focus:ring-2 focus:ring-brand-500/15',
        saving && 'opacity-50',
      )}
    />
  )

  if (!score || !score.graderName) return input

  return (
    <Tooltip closeDelay={0} delay={200}>
      <Tooltip.Trigger className="inline-block">{input}</Tooltip.Trigger>
      <Tooltip.Content placement="top" showArrow>
        {`最后由 ${score.graderName} 于 ${formatLocaleDateTime(score.updatedAt)} 更新`}
      </Tooltip.Content>
    </Tooltip>
  )
}
