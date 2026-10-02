import { Alert, Input } from '@heroui/react'
import { useEffect, useState } from 'react'

import Save from '~icons/lucide/save'
import { PendingButton } from '@/components/ui/PendingButton'
import { formatLocaleDateTime } from '@/lib/format'

import { formatScore, type GradeStudent } from './shared'

export function GradePanel({
  student,
  saving,
  onSave,
}: {
  student: GradeStudent | null
  saving: boolean
  onSave: (value: number) => void
}) {
  const [value, setValue] = useState('')

  useEffect(() => {
    setValue(student?.score != null ? String(student.score.score) : '')
  }, [student])

  if (!student) {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <p className="text-xs text-fg-subtle">请选择学生开始批改</p>
      </div>
    )
  }

  const parsed = Number(value)
  const valid = value.trim() !== '' && Number.isFinite(parsed) && parsed >= 0 && parsed <= 100
  const canSave = valid && student.stuId != null && !saving

  const submit = () => {
    if (!canSave) return
    onSave(Math.round(parsed * 10) / 10)
  }

  return (
    <div className="flex h-full flex-col overflow-auto">
      <div className="shrink-0 border-b border-line p-4">
        <div className="text-sm font-bold">{student.name}</div>
        <div className="tabular mt-0.5 text-xs text-fg-subtle">
          {student.studentNo || `person ${student.personId}`}
        </div>
      </div>

      <div className="flex flex-col gap-4 p-4">
        <div className="rounded-xl border border-line bg-sunken px-4 py-3">
          <div className="text-[11px] font-semibold text-fg-subtle">当前报告分</div>
          {student.score ? (
            <>
              <div className="tabular mt-1 text-3xl font-bold text-brand-600 dark:text-brand-300">
                {formatScore(student.score.score)}
              </div>
              <div className="mt-1 text-[11px] text-fg-subtle">
                {student.score.graderName ?? '—'} · {formatLocaleDateTime(student.score.updatedAt)}
              </div>
            </>
          ) : (
            <div className="mt-1 text-sm text-fg-subtle">未批改</div>
          )}
        </div>

        {student.stuId == null ? (
          <Alert status="warning">
            <Alert.Indicator />
            <Alert.Content>
              <Alert.Description>未在本地名单中匹配到该学号，无法录入分数。</Alert.Description>
            </Alert.Content>
          </Alert>
        ) : (
          <div className="flex flex-col gap-2">
            <label htmlFor="report-score" className="text-xs font-semibold text-fg-muted">
              报告得分（0–100）
            </label>
            <div className="flex items-center gap-2">
              <Input
                id="report-score"
                type="number"
                min={0}
                max={100}
                step="0.5"
                className="flex-1"
                value={value}
                onChange={(event) => setValue(event.target.value)}
                aria-label="报告得分"
              />
              <PendingButton
                isPending={saving}
                isDisabled={!canSave}
                icon={Save}
                onPress={submit}
              >
                保存
              </PendingButton>
            </div>
            {value.trim() !== '' && !valid && (
              <p className="text-[11px] text-danger">请输入 0–100 的分数</p>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
