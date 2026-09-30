import { Input } from '@heroui/react'
import { useEffect, useState, type CSSProperties } from 'react'

import { SCORE_TYPES } from '@/lib/scores'
import { ratioPercentages } from '@/lib/scoring'

const SEGMENT_STYLES: CSSProperties[] = [
  {
    backgroundImage: 'repeating-linear-gradient(135deg, currentColor 0 1px, transparent 1px 4px)',
  },
  {
    backgroundImage: 'radial-gradient(currentColor 0.8px, transparent 1px)',
    backgroundSize: '4px 4px',
  },
  {
    backgroundImage: 'repeating-linear-gradient(45deg, currentColor 0 1px, transparent 1px 4px)',
  },
]

function parseWeight(raw: unknown): number {
  const n = Math.floor(Number(raw))
  return Number.isFinite(n) && n > 0 ? n : 0
}

export function ScoreRatioEditor({
  value,
  onChange,
  disabled = false,
}: {
  value: number[]
  onChange: (value: number[]) => void
  disabled?: boolean
}) {
  const incoming = value.map(parseWeight).join(',')
  const [drafts, setDrafts] = useState<string[]>(() => value.map(String))

  // 外部值变化时同步本地草稿，但保留用户正在编辑的空输入
  useEffect(() => {
    setDrafts((prev) => {
      const parsed = prev.map((draft) => String(parseWeight(draft))).join(',')
      return parsed === incoming ? prev : incoming.split(',')
    })
  }, [incoming])

  const setAt = (index: number, raw: string) => {
    const next = drafts.map((draft, i) => (i === index ? raw : draft))
    setDrafts(next)
    onChange(next.map(parseWeight))
  }

  const percentages = ratioPercentages(value)
  const hasWeight = percentages.some((item) => item > 0)

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-3 gap-2">
        {SCORE_TYPES.map((item) => (
          <div key={item.value} className="text-center text-xs font-semibold text-fg-muted">
            {item.label}
          </div>
        ))}
        {SCORE_TYPES.map((item, index) => (
          <Input
            key={item.value}
            type="number"
            min={0}
            step={1}
            inputMode="numeric"
            disabled={disabled}
            aria-label={`${item.label}权重`}
            value={drafts[index] ?? '0'}
            onChange={(event) => setAt(index, event.target.value)}
            className="tabular w-full rounded-xl border border-line bg-elevated px-2 py-1.5 text-center text-sm outline-none transition-all focus:border-brand-500 focus:ring-2 focus:ring-brand-500/15"
          />
        ))}
      </div>

      <div className="flex h-3.5 w-full overflow-hidden rounded-full border border-fg-muted/60 bg-sunken">
        {hasWeight &&
          SCORE_TYPES.map((item, index) => (
            <div
              key={item.value}
              className={`h-full text-fg-muted opacity-60 transition-all ${
                index > 0 ? 'border-l border-current' : ''
              }`}
              style={{
                width: `${percentages[index]}%`,
                ...SEGMENT_STYLES[index % SEGMENT_STYLES.length],
              }}
            />
          ))}
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
        {SCORE_TYPES.map((item, index) => (
          <div key={item.value} className="flex items-center gap-1.5 text-[11px] text-fg-subtle">
            <span
              className="h-3 w-3 shrink-0 rounded-[3px] text-fg-muted opacity-60"
              style={SEGMENT_STYLES[index % SEGMENT_STYLES.length]}
            />
            <span>{item.label}</span>
            <span className="tabular font-semibold text-fg-muted">
              {percentages[index].toFixed(0)}%
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
