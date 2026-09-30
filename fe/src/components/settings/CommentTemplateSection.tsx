import { Spinner, TextArea } from '@heroui/react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useDebounce } from 'react-use'
import { toast } from 'sonner'

import MessageSquareText from '~icons/lucide/message-square-text'
import { Card } from '@/components/ui/Card'
import { fetchClassSettings, updateClassSettings } from '@/lib/api'
import { useCurrentClass } from '@/lib/store'

export function CommentTemplateSection({ index }: { index: number }) {
  const currentClass = useCurrentClass()
  const classId = currentClass?.id ?? null

  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [checkoutTemplate, setCheckoutTemplate] = useState('')
  const [reportTemplate, setReportTemplate] = useState('')
  const dirty = useRef(false)

  useEffect(() => {
    if (!classId) return
    let cancelled = false
    const run = async () => {
      setLoading(true)
      try {
        const { settings } = await fetchClassSettings(classId)
        if (cancelled) return
        setCheckoutTemplate(settings.checkoutCommentTemplate ?? '')
        setReportTemplate(settings.reportCommentTemplate ?? '')
      } catch (error) {
        if (!cancelled) toast.error(error instanceof Error ? error.message : '加载课程设置失败')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void run()
    return () => {
      cancelled = true
    }
  }, [classId])

  const patch = useCallback(
    async (body: Parameters<typeof updateClassSettings>[1]) => {
      if (!classId) return
      setSaving(true)
      try {
        await updateClassSettings(classId, body)
      } catch (error) {
        toast.error(error instanceof Error ? error.message : '保存失败')
      } finally {
        setSaving(false)
      }
    },
    [classId],
  )

  useDebounce(
    () => {
      if (!dirty.current) return
      dirty.current = false
      void patch({
        checkoutCommentTemplate: checkoutTemplate,
        reportCommentTemplate: reportTemplate,
      })
    },
    700,
    [checkoutTemplate, reportTemplate],
  )

  const busy = loading || saving

  return (
    <Card index={index}>
      <div className="flex items-center gap-2">
        <MessageSquareText
          width={16}
          height={16}
          className="shrink-0 text-brand-600 dark:text-brand-300"
        />
        <h2 className="text-sm font-bold">评语模板</h2>
        {busy && <Spinner size="sm" />}
      </div>

      {!classId ? (
        <p className="mt-3 text-xs text-fg-subtle">请先在右上角选择或绑定一个课程。</p>
      ) : (
        <div className="mt-4 flex flex-col gap-4">
          <CommentTemplateField
            id="checkout-comment-template"
            label="验收评语模板"
            placeholder="输入验收评语模板…"
            value={checkoutTemplate}
            disabled={loading}
            onChange={(value) => {
              dirty.current = true
              setCheckoutTemplate(value)
            }}
          />
          <CommentTemplateField
            id="report-comment-template"
            label="报告评语模板"
            placeholder="输入报告评语模板…"
            value={reportTemplate}
            disabled={loading}
            onChange={(value) => {
              dirty.current = true
              setReportTemplate(value)
            }}
          />
        </div>
      )}
    </Card>
  )
}

function CommentTemplateField({
  id,
  label,
  placeholder,
  value,
  disabled,
  onChange,
}: {
  id: string
  label: string
  placeholder: string
  value: string
  disabled: boolean
  onChange: (value: string) => void
}) {
  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={id} className="text-xs font-semibold text-fg-muted">
        {label}
      </label>
      <TextArea
        id={id}
        aria-label={label}
        className="w-full"
        rows={5}
        placeholder={placeholder}
        value={value}
        disabled={disabled}
        style={{ resize: 'vertical' }}
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  )
}
