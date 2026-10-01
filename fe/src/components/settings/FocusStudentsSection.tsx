import { Alert, Button, CloseButton, Switch } from '@heroui/react'
import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'

import ListChecks from '~icons/lucide/list-checks'
import UserSearch from '~icons/lucide/user-search'
import { Card } from '@/components/ui/Card'
import { SectionHeader } from '@/components/ui/SectionHeader'
import { listFocusStudents, type FocusStudent } from '@/lib/api'
import { getErrorMessage } from '@/lib/error'
import { useClassSettingsPatch } from '@/lib/use-class-settings'
import { useCurrentClass } from '@/lib/store'

export function FocusStudentsSection({ index = 0 }: { index?: number }) {
  const currentClass = useCurrentClass()
  const classId = currentClass?.id ?? null
  const navigate = useNavigate()

  const {
    settings,
    settingsLoading,
    patch,
    saving,
    rollbackFailed,
    dismissRollbackFailure,
  } = useClassSettingsPatch(classId)

  const [focusStudents, setFocusStudents] = useState<FocusStudent[]>([])
  const [loading, setLoading] = useState(false)

  const reload = useCallback(async () => {
    if (!classId) {
      setFocusStudents([])
      return
    }
    setLoading(true)
    try {
      const data = await listFocusStudents(classId)
      setFocusStudents(data.focusStudents)
    } catch (error) {
      toast.error(getErrorMessage(error, '加载重点关注学生失败'))
    } finally {
      setLoading(false)
    }
  }, [classId])

  useEffect(() => {
    void reload()
  }, [reload])

  const busy = settingsLoading || saving || loading

  return (
    <Card index={index}>
      <SectionHeader icon={UserSearch} busy={busy}>
        重点关注学生
      </SectionHeader>

      {!classId ? (
        <p className="mt-3 text-xs text-fg-subtle">请先在右上角选择或绑定一个课程。</p>
      ) : (
        <div className="mt-4 flex flex-col gap-3">
          <div className="flex items-center justify-between gap-4 rounded-xl border border-line px-4 py-3">
            <div className="min-w-0">
              <div className="text-xs font-semibold text-fg-muted">启用「重点关注学生」</div>
              <div className="text-[11px] text-fg-subtle">
                开启后可在验收等场景中提示重点关注学生
              </div>
            </div>
            <Switch
              aria-label="启用重点关注学生"
              isSelected={settings?.focusEnabled ?? false}
              isDisabled={busy}
              onChange={(selected) =>
                void patch({ focusEnabled: selected }, (prev) => ({
                  ...prev,
                  focusEnabled: selected,
                }))
              }
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
              <div className="text-xs font-semibold text-fg-muted">重点关注学生列表</div>
              <div className="text-[11px] text-fg-subtle">
                查看与维护本课程需要重点关注的学生及原因
              </div>
            </div>
            <Button
              size="sm"
              variant="secondary"
              onPress={() => navigate('/console/courses/focus-students')}
            >
              <ListChecks width={15} height={15} className="shrink-0" />
              重点关注学生列表（{focusStudents.length}人）
            </Button>
          </div>

          {rollbackFailed && (
            <Alert status="danger">
              <Alert.Indicator />
              <Alert.Content>
                <Alert.Description>设置保存失败且无法恢复，请刷新页面</Alert.Description>
              </Alert.Content>
              <CloseButton aria-label="关闭" onPress={dismissRollbackFailure} />
            </Alert>
          )}
        </div>
      )}
    </Card>
  )
}
