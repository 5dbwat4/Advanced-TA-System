import { Switch } from '@heroui/react'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'

import Bell from '~icons/lucide/bell'
import { Card } from '@/components/ui/Card'
import { useAuth } from '@/lib/auth'
import {
  browserNotificationsSupported,
  disableBackgroundGradeNotifications,
  enableBackgroundGradeNotifications,
  gradeNotificationsPermission,
  setGradeNotifyEnabled,
  useBackgroundGradeNotifyEnabled,
  useGradeNotifyEnabled,
} from '@/lib/grade-notifications'

export function NotificationSection({ index = 0 }: { index?: number }) {
  const { user } = useAuth()
  const userId = user?.id ?? null
  const enabled = useGradeNotifyEnabled(userId)
  const backgroundEnabled = useBackgroundGradeNotifyEnabled(userId)
  const supported = browserNotificationsSupported()
  const [permission, setPermission] = useState(() => gradeNotificationsPermission())
  const [backgroundBusy, setBackgroundBusy] = useState(false)

  useEffect(() => {
    const sync = () => setPermission(gradeNotificationsPermission())
    sync()
    window.addEventListener('focus', sync)
    document.addEventListener('visibilitychange', sync)
    return () => {
      window.removeEventListener('focus', sync)
      document.removeEventListener('visibilitychange', sync)
    }
  }, [])

  const ensurePermission = async (): Promise<boolean> => {
    if (!supported) {
      toast.error('当前浏览器不支持系统通知')
      return false
    }

    let result = Notification.permission
    if (result === 'default') {
      try {
        result = await Notification.requestPermission()
      } catch {
        result = 'denied'
      }
      setPermission(result)
    }
    if (result !== 'granted') {
      toast.error(
        result === 'denied'
          ? '浏览器已禁止通知，请在站点设置中允许后重试'
          : '未获得浏览器通知权限',
      )
      return false
    }

    setPermission('granted')
    return true
  }

  const toggle = async (next: boolean) => {
    if (!userId) return

    if (!next) {
      setGradeNotifyEnabled(userId, false)
      toast.success('已关闭成绩更新提醒')
      return
    }

    if (!(await ensurePermission())) return

    setGradeNotifyEnabled(userId, true)
    toast.success('已开启成绩更新提醒')
  }

  const toggleBackground = async (next: boolean) => {
    if (!userId) return

    setBackgroundBusy(true)
    try {
      if (!next) {
        await disableBackgroundGradeNotifications(userId)
        toast.success('已关闭后台成绩推送')
        return
      }

      if (!(await ensurePermission())) return

      const result = await enableBackgroundGradeNotifications(userId)
      if (!result.ok) {
        toast.error(result.message)
        return
      }
      toast.success('已开启后台成绩推送')
    } finally {
      setBackgroundBusy(false)
    }
  }

  return (
    <Card index={index} className="flex flex-col gap-5">
      <div className="flex items-center gap-2 text-sm font-bold">
        <Bell
          width={16}
          height={16}
          className="shrink-0 text-brand-600 dark:text-brand-300"
        />
        Notifications
      </div>

      <div className="flex items-center justify-between gap-4 rounded-xl border border-line px-4 py-3">
        <div className="min-w-0">
          <div className="text-xs font-semibold text-fg-muted">在成绩更新时提醒我</div>
          <div className="text-[11px] text-fg-subtle">打开本站时检测成绩变化</div>
        </div>
        <Switch
          aria-label="在成绩更新时提醒我"
          isSelected={enabled}
          isDisabled={!userId || !supported}
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
          <div className="text-xs font-semibold text-fg-muted">
            即使关闭页面也推送成绩更新
          </div>
          <div className="text-[11px] text-fg-subtle">
            使用 Web Push；需要浏览器通知权限，部分浏览器要求安装为应用
          </div>
        </div>
        <Switch
          aria-label="即使关闭页面也推送成绩更新"
          isSelected={backgroundEnabled}
          isDisabled={!userId || !supported || backgroundBusy}
          onChange={(selected) => void toggleBackground(selected)}
        >
          <Switch.Content>
            <Switch.Control>
              <Switch.Thumb />
            </Switch.Control>
          </Switch.Content>
        </Switch>
      </div>

      {!supported ? (
        <p className="text-[11px] text-warning">当前浏览器不支持系统通知。</p>
      ) : permission === 'denied' ? (
        <p className="text-[11px] text-warning">
          浏览器已禁止本站通知，请在地址栏的站点设置中允许后重试。
        </p>
      ) : null}
    </Card>
  )
}
