import { Button, Spinner } from '@heroui/react'
import { useState } from 'react'
import { toast } from 'sonner'

import Check from '~icons/lucide/check'
import SlidersHorizontal from '~icons/lucide/sliders-horizontal'
import { PreferenceFields } from '@/components/checkoff/PreferenceOnboarding'
import { Card } from '@/components/ui/Card'
import { useAuth } from '@/lib/auth'

export function PreferenceSection({ index = 0 }: { index?: number }) {
  const { user, updatePreferences } = useAuth()
  const saved = user?.preferences
  const [device, setDevice] = useState<'single' | 'multi'>(saved?.device ?? 'single')
  const [draw, setDraw] = useState<'random' | 'fixed'>(saved?.draw ?? 'random')
  const [saving, setSaving] = useState(false)

  const dirty = saved == null || device !== saved.device || draw !== saved.draw

  const save = async () => {
    setSaving(true)
    try {
      await updatePreferences({ device, draw })
      toast.success('偏好已保存')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '保存失败')
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
        onDeviceChange={setDevice}
        onDrawChange={setDraw}
        showIcon={false}
      />

      <div className="flex justify-end">
        <Button size="sm" isDisabled={!dirty} isPending={saving} onPress={save}>
          {({ isPending }) => (
            <>
              {isPending ? (
                <Spinner color="current" size="sm" />
              ) : (
                <Check width={16} height={16} className="shrink-0" />
              )}
              保存偏好
            </>
          )}
        </Button>
      </div>
    </Card>
  )
}
