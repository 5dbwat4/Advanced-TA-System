import { Button, Spinner, Switch } from '@heroui/react'
import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'

import ListChecks from '~icons/lucide/list-checks'
import UserSearch from '~icons/lucide/user-search'
import { Card } from '@/components/ui/Card'
import {
  fetchClassSettings,
  listFocusStudents,
  updateClassSettings,
  type ClassSettings,
  type FocusStudent,
} from '@/lib/api'
import { useCurrentClass } from '@/lib/store'

export function FocusStudentsSection({ index = 0 }: { index?: number }) {
  const currentClass = useCurrentClass()
  const classId = currentClass?.id ?? null
  const navigate = useNavigate()

  const [settings, setSettings] = useState<ClassSettings | null>(null)
  const [settingsLoading, setSettingsLoading] = useState(false)
  const [saving, setSaving] = useState(false)

  const [focusStudents, setFocusStudents] = useState<FocusStudent[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!classId) return
    let cancelled = false
    const run = async () => {
      setSettingsLoading(true)
      try {
        const data = await fetchClassSettings(classId)
        if (!cancelled) setSettings(data.settings)
      } catch (error) {
        if (!cancelled) toast.error(error instanceof Error ? error.message : '加载课程设置失败')
      } finally {
        if (!cancelled) setSettingsLoading(false)
      }
    }
    void run()
    return () => {
      cancelled = true
    }
  }, [classId])

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
      toast.error(error instanceof Error ? error.message : '加载重点关注学生失败')
    } finally {
      setLoading(false)
    }
  }, [classId])

  useEffect(() => {
    void reload()
  }, [reload])

  const patch = async (body: { focusEnabled?: boolean }) => {
    if (!classId) return
    setSaving(true)
    // 乐观更新
    setSettings((prev) => ({ ...prev, ...body }))
    try {
      const { settings: updated } = await updateClassSettings(classId, body)
      setSettings(updated)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '保存失败')
      try {
        const { settings: fresh } = await fetchClassSettings(classId)
        setSettings(fresh)
      } catch {
        // 回滚失败时忽略，保持乐观值
      }
    } finally {
      setSaving(false)
    }
  }

  const busy = settingsLoading || saving || loading

  return (
    <Card index={index}>
      <div className="flex items-center gap-2">
        <UserSearch
          width={16}
          height={16}
          className="shrink-0 text-brand-600 dark:text-brand-300"
        />
        <h2 className="text-sm font-bold">重点关注学生</h2>
        {busy && <Spinner size="sm" />}
      </div>

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
              onChange={(selected) => void patch({ focusEnabled: selected })}
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
        </div>
      )}
    </Card>
  )
}
