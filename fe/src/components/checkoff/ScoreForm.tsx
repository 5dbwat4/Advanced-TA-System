import { Button, Input, Slider, Spinner } from '@heroui/react'
import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'

import { Icon } from '@/components/ui/Icon'
import type { QuestionMark } from '@/components/checkoff/QuestionDrawer'
import { submitCheckoff, type CheckoffStudent, type Score } from '@/lib/api'
import { SCORE_MAX } from '@/lib/scores'

/** 计入总分的两类，权重 功能测试 : 验收问答 = 2 : 5（报告不计入） */
const SCORED_TYPES = [
  { value: 0, label: '功能测试', icon: 'lucide:clipboard-check', weight: 2 },
  { value: 1, label: '验收问答', icon: 'lucide:message-circle-question', weight: 5 },
] as const

const DEFAULT_SCORE = 100

export function ScoreForm({
  experimentId,
  student,
  marks,
  existingScores,
  onSaved,
}: {
  experimentId: string
  student: CheckoffStudent
  marks: Record<string, QuestionMark | undefined>
  existingScores: Score[]
  onSaved: () => void
}) {
  const [values, setValues] = useState<Record<number, number>>({ 0: DEFAULT_SCORE, 1: DEFAULT_SCORE })
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    const next: Record<number, number> = { 0: DEFAULT_SCORE, 1: DEFAULT_SCORE }
    for (const type of SCORED_TYPES) {
      const found = existingScores.find((score) => score.type === type.value)
      if (found) next[type.value] = found.score
    }
    setValues(next)
  }, [student.stuId, existingScores])

  const weighted = SCORED_TYPES.reduce((sum, type) => sum + values[type.value] * type.weight, 0)
  const weightSum = SCORED_TYPES.reduce((sum, type) => sum + type.weight, 0)
  const total = Math.round((weighted / weightSum) * 10) / 10

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
      await submitCheckoff({ experimentId, stuId: student.stuId, scores })
      toast.success(`已保存 · ${student.name}`)
      onSaved()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '保存失败')
    } finally {
      setSaving(false)
    }
  }, [values, experimentId, student, onSaved])

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
        event.preventDefault()
        void save()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [save])

  return (
    <div>
      <div className="mb-4 flex items-center gap-3 rounded-2xl border border-line bg-elevated px-4 py-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-500/10 text-sm font-bold text-brand-600 dark:text-brand-300">
          {student.name.slice(0, 1)}
        </div>
        <div className="min-w-0 flex-1">
          <span className="font-semibold text-fg">{student.name}</span>
          <span className="tabular ml-2 text-xs text-fg-muted">{student.studentNo}</span>
        </div>
        <span className="text-xs text-fg-subtle">默认 100，可按需下调</span>
      </div>

      <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
        <div className="space-y-4">
          {SCORED_TYPES.map((type) => (
            <div key={type.value} className="rounded-2xl border border-line bg-elevated p-5">
              <div className="mb-3 flex items-center justify-between gap-2">
                <label className="flex items-center gap-2 text-sm font-semibold text-fg-muted">
                  <Icon icon={type.icon} width={15} />
                  {type.label}
                  <span className="tabular rounded-md bg-sunken px-1.5 py-0.5 text-[11px] font-semibold text-fg-subtle">
                    ×{type.weight}
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
                  value={values[type.value]}
                  onChange={(value) =>
                    setValue(type.value, Array.isArray(value) ? value[0] : value)
                  }
                >
                  <Slider.Track>
                    <Slider.Fill />
                    <Slider.Thumb />
                  </Slider.Track>
                </Slider>

                <Input
                  type="number"
                  min={0}
                  max={SCORE_MAX}
                  step={1}
                  inputMode="numeric"
                  aria-label={type.label}
                  value={values[type.value]}
                  onChange={(event) => setValue(type.value, Number(event.target.value))}
                  className="tabular w-24 shrink-0 rounded-xl border border-line bg-elevated px-3 py-2 text-center text-lg font-bold text-fg outline-none transition-all focus:border-brand-500 focus:ring-4 focus:ring-brand-500/15"
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
            <Icon icon="lucide:info" width={13} />
            功能测试 ×2 · 验收问答 ×5（占比 2 : 5）
          </div>
        </div>
      </div>

      <div className="mt-5 flex items-center justify-between gap-3">
        <span className="hidden items-center gap-1.5 text-xs text-fg-subtle sm:flex">
          <kbd className="rounded-md border border-line bg-sunken px-1.5 py-0.5 font-mono text-[10px]">Ctrl</kbd>
          <kbd className="rounded-md border border-line bg-sunken px-1.5 py-0.5 font-mono text-[10px]">↵</kbd>
          保存并继续
        </span>
        <Button
          size="lg"
          isPending={saving}
          onPress={save}
          className="w-full bg-gradient-to-r from-emerald-600 to-emerald-700 shadow-lg shadow-emerald-600/25 sm:w-auto sm:min-w-64"
        >
          {({ isPending }) => (
            <>
              {isPending ? (
                <Spinner color="current" size="sm" />
              ) : (
                <Icon icon="lucide:check" width={16} />
              )}
              保存并下一位
            </>
          )}
        </Button>
      </div>
    </div>
  )
}
