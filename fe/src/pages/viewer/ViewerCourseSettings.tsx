import { Button, Switch } from '@heroui/react'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'

import ListChecks from '~icons/lucide/list-checks'
import UserSearch from '~icons/lucide/user-search'
import { StaffRosterSection } from '@/components/settings/StaffRosterSection'
import { Card } from '@/components/ui/Card'
import { PageHeader } from '@/components/ui/PageHeader'
import { SectionHeader } from '@/components/ui/SectionHeader'
import { updateViewerPreferences } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import { getErrorMessage } from '@/lib/error'

export default function ViewerCourseSettings() {
  const { user, refresh } = useAuth()
  const navigate = useNavigate()
  const [saving, setSaving] = useState(false)

  const toggle = async (selected: boolean) => {
    setSaving(true)
    try {
      await updateViewerPreferences({ focusNavVisible: selected })
      await refresh()
      toast.success('已保存')
    } catch (error) {
      toast.error(getErrorMessage(error, '保存失败'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader title="课程设置" />

      <Card>
        <SectionHeader icon={UserSearch} busy={saving}>
          重点关注对象
        </SectionHeader>

        <div className="mt-4 flex flex-col gap-3">
          <div className="flex items-center justify-between gap-4 rounded-xl border border-line px-4 py-3">
            <div className="min-w-0">
              <div className="text-xs font-semibold text-fg-muted">
                在 nav 中显示「重点关注对象」
              </div>
              <div className="text-[11px] text-fg-subtle">
                开启后可在导航中直接进入重点关注对象，仅对你的账号生效
              </div>
            </div>
            <Switch
              aria-label="在 nav 中显示重点关注对象"
              isSelected={user?.viewerFocusNavVisible ?? false}
              isDisabled={saving}
              onChange={(selected) => void toggle(selected)}
            >
              <Switch.Content>
                <Switch.Control>
                  <Switch.Thumb />
                </Switch.Control>
              </Switch.Content>
            </Switch>
          </div>

          <div className="flex items-center justify-between gap-4 rounded-xl border border-line px-4 py-3">
            <div className="min-w-0">
              <div className="text-xs font-semibold text-fg-muted">重点关注对象</div>
              <div className="text-[11px] text-fg-subtle">
                查看本课程需要重点关注的学生及原因
              </div>
            </div>
            <Button
              size="sm"
              variant="secondary"
              onPress={() => navigate('/viewer/focus-students')}
            >
              <ListChecks width={15} height={15} className="shrink-0" />
              查看列表
            </Button>
          </div>
        </div>
      </Card>

      <div className="mt-4">
        <StaffRosterSection index={1} />
      </div>
    </div>
  )
}
