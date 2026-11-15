import { Input, Slider } from '@heroui/react'
import { useCallback, useEffect, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react'
import { toast } from 'sonner'

import Check from '~icons/lucide/check'
import ClipboardCheck from '~icons/lucide/clipboard-check'
import Info from '~icons/lucide/info'
import MessageCircleQuestion from '~icons/lucide/message-circle-question'
import type { QuestionMark } from '@/components/checkoff/QuestionDrawer'
import { RemarkField } from '@/components/remarks/RemarkField'
import { AvatarImage } from '@/components/ui/AvatarImage'
import { PendingButton } from '@/components/ui/PendingButton'
import {
  REMARK_TYPE_CHECKOFF,
  submitCheckoff,
  type CheckoffStudent,
  type Score,
} from '@/lib/api'
import { getErrorMessage } from '@/lib/error'
import { SCORE_LIMIT, SCORE_MAX } from '@/lib/scores'
import { weightedTotal } from '@/lib/scoring'

/** 验收计分的两类，具体权重来自课程 / 实验的评分占比配置 */
const SCORED_TYPES = [
  { value: 0, label: '功能测试', icon: ClipboardCheck },
  { value: 1, label: '验收问答', icon: MessageCircleQuestion },
] as const

const DEFAULT_SCORE = 100

/** 分数输入框：允许手动输入 0~100 以外的分数，滑块仍限制在 0~100 */
function ScoreInput({
  value,
  ariaLabel,
  onChange,
}: {
  value: number
  ariaLabel: string
  onChange: (next: number) => void
}) {
  const [draft, setDraft] = useState(String(value))

  useEffect(() => {
    setDraft((prev) => (Number(prev) === value && prev.trim() !== '' ? prev : String(value)))
  }, [value])

  const commit = () => {
    const trimmed = draft.trim()
    if (trimmed === String(value)) return
    if (trimmed === '') {
      setDraft(String(value))
      return
    }
    const parsed = Number(trimmed)
    if (!Number.isFinite(parsed) || parsed < -SCORE_LIMIT || parsed > SCORE_LIMIT) {
      toast.error(`请输入 ${-SCORE_LIMIT}~${SCORE_LIMIT} 的分数`)
      setDraft(String(value))
      return
    }
    const next = Math.round(parsed)
    setDraft(String(next))
    if (next !== value) onChange(next)
  }

  const handleChange = (raw: string) => {
    setDraft(raw)
    const trimmed = raw.trim()
    if (trimmed === '') return
    const parsed = Number(trimmed)
    if (!Number.isFinite(parsed) || parsed < -SCORE_LIMIT || parsed > SCORE_LIMIT) return
    if (parsed !== value) onChange(parsed)
  }

  return (
    <Input
      type="text"
      inputMode="decimal"
      aria-label={ariaLabel}
      value={draft}
      onChange={(event) => handleChange(event.target.value)}
      onBlur={commit}
      onKeyDown={(event: ReactKeyboardEvent<HTMLInputElement>) => {
        if (event.key === 'Enter' && !event.metaKey && !event.ctrlKey) {
          event.preventDefault()
          event.currentTarget.blur()
        } else if (event.key === 'Escape') {
          setDraft(String(value))
          event.currentTarget.blur()
        }
      }}
      className="tabular w-24 shrink-0 rounded-xl border border-line bg-elevated px-3 py-2 text-center text-lg font-bold text-fg outline-none transition-all focus:border-brand-500 focus:ring-4 focus:ring-brand-500/15"
    />
  )
}

export function ScoreForm({
  experimentId,
  student,
  aiOral,
  marks,
  existingScores,
  ratio,
  onSaved,
  active = true,
  saveLabel = '保存并下一位',
}: {
  experimentId: string
  student: CheckoffStudent
  aiOral: { nonce: number; score: number; comment: string } | null
  marks: Record<string, QuestionMark | undefined>
  existingScores: Score[]
  ratio: number[]
  onSaved: () => void
  /** 群面中只有当前激活的 tab 响应全局快捷键 */
  active?: boolean
  /** 保存按钮 / 快捷键提示文案（群面保存后关闭 tab） */
  saveLabel?: string
}) {
  const [values, setValues] = useState<Record<number, number>>({ 0: DEFAULT_SCORE, 1: DEFAULT_SCORE })
  const [saving, setSaving] = useState(false)
  const [remarkSync, setRemarkSync] = useState<{ nonce: number; text: string } | null>(null)

  useEffect(() => {
    const next: Record<number, number> = { 0: DEFAULT_SCORE, 1: DEFAULT_SCORE }
    for (const type of SCORED_TYPES) {
      const found = existingScores.find((score) => score.type === type.value)
      if (found) next[type.value] = found.score
    }
    if (aiOral) next[1] = aiOral.score
    setValues(next)
  }, [student.userId, existingScores, aiOral])

  useEffect(() => {
    if (!aiOral) return
    setRemarkSync({ nonce: aiOral.nonce, text: aiOral.comment })
  }, [aiOral])

  // 仅取功能测试 / 验收问答的权重；两者都为 0 时退化为等权，避免总分为空
  const rawWeights = SCORED_TYPES.map((type) => ratio[type.value] ?? 0)
  const weights = rawWeights[0] <= 0 && rawWeights[1] <= 0 ? [1, 1] : rawWeights
  const total = weightedTotal([values[0], values[1]], weights) ?? 0

  const correctCount = Object.values(marks).filter((mark) => mark === 'correct').length
  const partialCount = Object.values(marks).filter((mark) => mark === 'partial').length
  const tallyLabel =
    correctCount + partialCount > 0 ? `参考：${correctCount} 对 · ${partialCount} 半对` : null

  const setValue = (type: number, next: number) => {
    setValues((prev) => ({ ...prev, [type]: Math.min(SCORE_MAX, Math.max(0, Math.round(next))) }))
  }

  const save = useCallback(async () => {
    const scores = SCORED_TYPES.map((type) => ({ type: type.value, score: values[type.value] }))
    setSaving(true)
    try {
      await submitCheckoff({ experimentId, userId: student.userId, scores })
      toast.success(`已保存 · ${student.name}`)
      onSaved()
    } catch (error) {
      toast.error(getErrorMessage(error, '保存失败'))
    } finally {
      setSaving(false)
    }
  }, [values, experimentId, student, onSaved])

  useEffect(() => {
    if (!active) return
    const handler = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
        event.preventDefault()
        void save()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [save, active])

  return (
    <div>
      <div className="mb-4 flex items-center gap-3 rounded-2xl border border-line bg-elevated px-4 py-3">
        <AvatarImage
          id={student.avatar}
          size={36}
          fallback={student.name.slice(0, 1)}
        />
        <div className="min-w-0 flex-1">
          <span className="font-semibold text-fg">{student.name}</span>
          <span className="tabular ml-2 text-xs text-fg-muted">{student.studentId}</span>
        </div>
        <span className="text-xs text-fg-subtle">默认 100，可输入 0~100 以外的分数</span>
      </div>

      <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
        <div className="space-y-4">
          {SCORED_TYPES.map((type, index) => (
            <div key={type.value} className="rounded-2xl border border-line bg-elevated p-5">
              <div className="mb-3 flex items-center justify-between gap-2">
                <label className="flex items-center gap-2 text-sm font-semibold text-fg-muted">
                  <type.icon width={15} height={15} className="shrink-0" />
                  {type.label}
                  <span className="tabular rounded-md bg-sunken px-1.5 py-0.5 text-[11px] font-semibold text-fg-subtle">
                    ×{weights[index]}
                  </span>
                </label>
                {type.value === 1 && tallyLabel && (
                  <span className="tabular text-[11px] font-semibold text-brand-600 dark:text-brand-300">
                    {tallyLabel}
                  </span>
                )}
              </div>

              <div className="flex items-center gap-4">
                <Slider
                  aria-label={type.label}
                  className="flex-1"
                  minValue={0}
                  maxValue={SCORE_MAX}
                  step={1}
                  value={Math.min(SCORE_MAX, Math.max(0, values[type.value]))}
                  onChange={(value) =>
                    setValue(type.value, Array.isArray(value) ? value[0] : value)
                  }
                >
                  <Slider.Track>
                    <Slider.Fill />
                    <Slider.Thumb />
                  </Slider.Track>
                </Slider>

                <ScoreInput
                  ariaLabel={type.label}
                  value={values[type.value]}
                  onChange={(next) => setValues((prev) => ({ ...prev, [type.value]: next }))}
                />
              </div>
            </div>
          ))}
        </div>

        <div className="relative flex flex-col justify-between overflow-hidden rounded-2xl border border-line bg-gradient-to-br from-brand-950 to-brand-900 p-6 text-white">
          <div className="pointer-events-none absolute -right-12 -top-12 h-40 w-40 rounded-full bg-amber-500/20 blur-[50px]" />
          <div className="relative">
            <div className="text-xs font-semibold uppercase tracking-widest text-white/50">总分</div>
            <div className="tabular mt-2 text-5xl font-bold tracking-tight">{total}</div>
            <div className="tabular mt-1 text-sm text-white/60">/ {SCORE_MAX}</div>
          </div>
          <div className="relative mt-6 flex items-center gap-2 border-t border-white/10 pt-4 text-xs text-white/50">
            <Info width={13} height={13} className="shrink-0" />
            {SCORED_TYPES.map((type, index) => `${type.label} ×${weights[index]}`).join(' · ')}
            {' （占比 '}
            {weights.join(' : ')}
            {'）'}
          </div>
        </div>
      </div>

      <div className="mt-4 rounded-2xl border border-line bg-elevated p-5">
        <RemarkField
          userId={student.userId}
          experimentId={experimentId}
          type={REMARK_TYPE_CHECKOFF}
          sync={remarkSync ?? undefined}
        />
      </div>

      <div className="mt-5 flex items-center justify-between gap-3">
        <span className="hidden items-center gap-1.5 text-xs text-fg-subtle sm:flex">
          <kbd className="rounded-md border border-line bg-sunken px-1.5 py-0.5 font-mono text-[10px]">Ctrl</kbd>
          <kbd className="rounded-md border border-line bg-sunken px-1.5 py-0.5 font-mono text-[10px]">↵</kbd>
          {saveLabel}
        </span>
        <PendingButton
          size="lg"
          isPending={saving}
          onPress={save}
          className="w-full bg-gradient-to-r from-emerald-600 to-emerald-700 shadow-lg shadow-emerald-600/25 sm:w-auto sm:min-w-64"
          icon={Check}
        >
          {saveLabel}
        </PendingButton>
      </div>
    </div>
  )
}
