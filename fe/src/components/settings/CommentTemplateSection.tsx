import { Alert, TextArea } from '@heroui/react'
import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'

import MessageSquareText from '~icons/lucide/message-square-text'
import { Card } from '@/components/ui/Card'
import { SectionHeader } from '@/components/ui/SectionHeader'
import { fetchClassSettings, updateClassSettings } from '@/lib/api'
import { getErrorMessage } from '@/lib/error'
import { useCurrentClass } from '@/lib/store'
import { useDebouncedSave } from '@/lib/use-class-settings'

export function CommentTemplateSection({ index }: { index: number }) {
  const currentClass = useCurrentClass()
  const classId = currentClass?.id ?? null

  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [checkoutTemplate, setCheckoutTemplate] = useState('')
  const [reportTemplate, setReportTemplate] = useState('')

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
        if (!cancelled) toast.error(getErrorMessage(error, '加载课程设置失败'))
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
      if (!classId) throw new Error('no class')
      setSaving(true)
      try {
        await updateClassSettings(classId, body)
      } catch (error) {
        toast.error(getErrorMessage(error, '保存失败'))
        throw error
      } finally {
        setSaving(false)
      }
    },
    [classId],
  )

  const templateSave = useDebouncedSave(() =>
    patch({
      checkoutCommentTemplate: checkoutTemplate,
      reportCommentTemplate: reportTemplate,
    }),
  700)

  const busy = loading || saving

  return (
    <Card index={index}>
      <SectionHeader icon={MessageSquareText} busy={busy}>
        评语模板
      </SectionHeader>

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
              templateSave.schedule()
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
              templateSave.schedule()
              setReportTemplate(value)
            }}
          />

          {templateSave.saveFailed && (
            <Alert status="warning">
              <Alert.Indicator />
              <Alert.Content>
                <Alert.Description>自动保存失败，修改尚未保存</Alert.Description>
              </Alert.Content>
            </Alert>
          )}
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
