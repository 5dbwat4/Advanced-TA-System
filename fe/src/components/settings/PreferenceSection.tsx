import { useState } from 'react'
import { toast } from 'sonner'

import Check from '~icons/lucide/check'
import SlidersHorizontal from '~icons/lucide/sliders-horizontal'
import { PreferenceFields } from '@/components/checkoff/PreferenceOnboarding'
import { MarkdownEditorChoice } from '@/components/settings/MarkdownEditorChoice'
import { MarkdownStyleChoice } from '@/components/settings/MarkdownStyleChoice'
import { Card } from '@/components/ui/Card'
import { PendingButton } from '@/components/ui/PendingButton'
import { useAuth } from '@/lib/auth'
import { getErrorMessage } from '@/lib/error'
import type { MarkdownEditorId, MarkdownStyleId } from '@/lib/api'

export function PreferenceSection({ index = 0 }: { index?: number }) {
  const { user, updatePreferences } = useAuth()
  const saved = user?.preferences
  const [device, setDevice] = useState<'single' | 'multi'>(saved?.device ?? 'single')
  const [draw, setDraw] = useState<'random' | 'fixed'>(saved?.draw ?? 'random')
  const [markdownEditor, setMarkdownEditor] = useState<MarkdownEditorId>(
    saved?.markdownEditor ?? 'uiw',
  )
  const [markdownStyle, setMarkdownStyle] = useState<MarkdownStyleId>(
    saved?.markdownStyle ?? 'github',
  )
  const [drawCount, setDrawCount] = useState<number>(saved?.drawCount ?? 3)
  const [saving, setSaving] = useState(false)

  const dirty =
    saved == null ||
    device !== saved.device ||
    draw !== saved.draw ||
    markdownEditor !== saved.markdownEditor ||
    markdownStyle !== saved.markdownStyle ||
    drawCount !== saved.drawCount

  const save = async () => {
    setSaving(true)
    try {
      await updatePreferences({ device, draw, markdownEditor, markdownStyle, drawCount })
      toast.success('偏好已保存')
    } catch (error) {
      toast.error(getErrorMessage(error, '保存失败'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card index={index} className="flex flex-col gap-5">
      <div className="flex items-center gap-2 text-sm font-bold">
        <SlidersHorizontal
          width={16}
          height={16}
          className="shrink-0 text-brand-600 dark:text-brand-300"
        />
        偏好设置
      </div>

      <PreferenceFields
        device={device}
        draw={draw}
        drawCount={drawCount}
        onDeviceChange={setDevice}
        onDrawChange={setDraw}
        onDrawCountChange={setDrawCount}
        showIcon={false}
        layout="rows"
      />

      <MarkdownEditorChoice value={markdownEditor} onChange={setMarkdownEditor} />

      <MarkdownStyleChoice value={markdownStyle} onChange={setMarkdownStyle} />

      <div className="flex justify-end">
        <PendingButton size="sm" isDisabled={!dirty} isPending={saving} onPress={save} icon={Check}>
          保存偏好
        </PendingButton>
      </div>
    </Card>
  )
}
