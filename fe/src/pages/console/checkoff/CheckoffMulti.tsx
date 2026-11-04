import {
  Alert,
  Button,
  Modal,
  Spinner,
  toast as herouiToast,
  useOverlayState,
} from '@heroui/react'
import copyToClipboard from 'copy-to-clipboard'
import { useTheme } from 'next-themes'
import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'

import Link2 from '~icons/lucide/link-2'
import Plus from '~icons/lucide/plus'
import School from '~icons/lucide/school'
import Settings2 from '~icons/lucide/settings-2'
import X from '~icons/lucide/x'
import { CheckoffLayout } from '@/components/checkoff/CheckoffLayout'
import { PreferenceOnboarding } from '@/components/checkoff/PreferenceOnboarding'
import { EmptyState } from '@/components/ui/Card'
import { IconAction } from '@/components/ui/IconAction'
import {
  fetchCheckoff,
  fetchClassSettings,
  type CheckoffExperiment,
  type ClassSettings,
  type UserPreferences,
} from '@/lib/api'
import { useAuth } from '@/lib/auth'
import {
  destroyCheckoffSession,
  useCheckoffWatch,
  type CheckoffStartedEvent,
} from '@/lib/checkoff-socket'
import {
  CHECKOFF_MULTI_MAX_TABS,
  clearInstanceStorage,
  createTabId,
  loadMultiTabs,
  saveMultiTabs,
  type MultiTabsState,
} from '@/lib/checkoff-multi'
import { getErrorMessage } from '@/lib/error'
import { useCurrentClass } from '@/lib/store'
import { cn } from '@/lib/utils'
import { CheckoffInstance, type CheckoffTabMeta } from './CheckoffInstance'

export default function CheckoffMulti() {
  const currentClass = useCurrentClass()
  const { user, loading: authLoading, updatePreferences } = useAuth()
  const classId = currentClass?.id
  const { resolvedTheme } = useTheme()
  const prefsState = useOverlayState()

  const [experiments, setExperiments] = useState<CheckoffExperiment[]>([])
  const [classSettings, setClassSettings] = useState<ClassSettings | null>(null)
  const [loading, setLoading] = useState(true)
  const [ratioError, setRatioError] = useState(false)
  const [tabsState, setTabsState] = useState<MultiTabsState>(loadMultiTabs)
  const [meta, setMeta] = useState<Record<string, CheckoffTabMeta>>({})

  const handleCheckoffStarted = useCallback((event: CheckoffStartedEvent) => {
    herouiToast(`${event.userName}正在验收${event.studentName}。`, { timeout: 10000 })
  }, [])
  useCheckoffWatch(classId, handleCheckoffStarted)

  useEffect(() => {
    saveMultiTabs(tabsState)
  }, [tabsState])

  useEffect(() => {
    if (!classId) return
    let cancelled = false
    setLoading(true)
    fetchCheckoff({ classId })
      .then((res) => {
        if (!cancelled) setExperiments(res.experiments)
      })
      .catch((error) => {
        if (!cancelled) toast.error(getErrorMessage(error, '加载失败'))
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [classId])

  useEffect(() => {
    if (!classId) return
    let cancelled = false
    setRatioError(false)
    fetchClassSettings(classId)
      .then((res) => {
        if (!cancelled) setClassSettings(res.settings)
      })
      .catch(() => {
        if (!cancelled) setRatioError(true)
      })
    return () => {
      cancelled = true
    }
  }, [classId])

  const handleMetaChange = useCallback((id: string, next: CheckoffTabMeta) => {
    setMeta((prev) => ({ ...prev, [id]: next }))
  }, [])

  const addTab = useCallback(() => {
    if (tabsState.tabs.length >= CHECKOFF_MULTI_MAX_TABS) {
      toast.error(`最多同时开启 ${CHECKOFF_MULTI_MAX_TABS} 个验收 tab`)
      return
    }
    const id = createTabId()
    setTabsState((prev) => ({ tabs: [...prev.tabs, { id }], activeId: id }))
  }, [tabsState.tabs.length])

  const closeTab = useCallback(
    (id: string) => {
      destroyCheckoffSession(meta[id]?.token)
      clearInstanceStorage(id)
      setMeta((prev) => {
        if (!(id in prev)) return prev
        const next = { ...prev }
        delete next[id]
        return next
      })
      setTabsState((prev) => {
        const index = prev.tabs.findIndex((tab) => tab.id === id)
        const remaining = prev.tabs.filter((tab) => tab.id !== id)
        if (remaining.length === 0) {
          const nextId = createTabId()
          return { tabs: [{ id: nextId }], activeId: nextId }
        }
        const fallback = remaining[Math.min(Math.max(index, 0), remaining.length - 1)]
        return {
          tabs: remaining,
          activeId: prev.activeId === id ? fallback.id : prev.activeId,
        }
      })
    },
    [meta],
  )

  const handleSaved = useCallback(
    (id: string) => {
      closeTab(id)
    },
    [closeTab],
  )

  const activateTab = useCallback((id: string) => {
    setTabsState((prev) => (prev.activeId === id ? prev : { ...prev, activeId: id }))
  }, [])

  const copyTabLink = useCallback(
    async (id: string) => {
      const token = meta[id]?.token
      if (!token) {
        toast.error('会话尚未准备好')
        return
      }
      const url = `${window.location.origin}/checkin/${token}`
      const ok = await copyToClipboard(url)
      if (ok) toast.success('从机链接已复制')
      else toast.error(url)
    },
    [meta],
  )

  const savePreferences = useCallback(
    async (prefs: UserPreferences) => {
      try {
        await updatePreferences(prefs)
        toast.success('偏好已保存')
        prefsState.close()
      } catch (error) {
        toast.error(getErrorMessage(error, '保存失败'))
        throw error
      }
    },
    [updatePreferences, prefsState],
  )

  if (authLoading) {
    return (
      <CheckoffLayout title="群面">
        <div className="flex h-64 items-center justify-center">
          <Spinner size="lg" />
        </div>
      </CheckoffLayout>
    )
  }

  if (!currentClass) {
    return (
      <CheckoffLayout title="群面">
        <EmptyState icon={School} title="尚未绑定班级" hint="请先在设置中绑定班级" />
      </CheckoffLayout>
    )
  }

  if (!user) return null

  if (user.preferences == null) {
    return (
      <CheckoffLayout title="群面">
        <div className="flex min-h-[70vh] items-center justify-center">
          <div className="w-full max-w-xl">
            <PreferenceOnboarding initial={null} onSubmit={savePreferences} />
          </div>
        </div>
      </CheckoffLayout>
    )
  }

  const preferences = user.preferences
  const markdownStyle = preferences.markdownStyle
  const theme: 'light' | 'dark' = resolvedTheme === 'dark' ? 'dark' : 'light'

  return (
    <CheckoffLayout
      title="群面"
      actions={
        <IconAction label="偏好" onPress={prefsState.open}>
          <Settings2 width={15} height={15} className="shrink-0" />
        </IconAction>
      }
    >
      <div className="mb-4 flex items-center gap-2 overflow-x-auto pb-1" role="tablist">
        {tabsState.tabs.map((tab) => {
          const info = meta[tab.id]
          const selected = tabsState.activeId === tab.id
          const label =
            info?.studentName ||
            (info?.experimentMark ? `新验收 · ${info.experimentMark}` : '新验收')
          return (
            <div
              key={tab.id}
              className={cn(
                'flex shrink-0 items-center gap-1 rounded-xl border px-2 py-1.5 transition-colors',
                selected
                  ? 'border-brand-500/50 bg-brand-500/10'
                  : 'border-line bg-elevated hover:bg-sunken',
              )}
            >
              <button
                type="button"
                role="tab"
                aria-selected={selected}
                onClick={() => activateTab(tab.id)}
                className="flex min-w-0 items-center gap-2 px-1 text-left"
              >
                <span
                  className={cn(
                    'h-2 w-2 shrink-0 rounded-full',
                    info?.slaveConnected ? 'bg-emerald-500' : 'bg-fg-subtle/40',
                  )}
                />
                <span className="max-w-44 truncate text-sm font-semibold text-fg">{label}</span>
                {info && info.step > 0 && (
                  <span className="tabular shrink-0 text-[10px] text-fg-subtle">
                    {info.step + 1}/5
                  </span>
                )}
              </button>
              {info?.token && (
                <button
                  type="button"
                  aria-label="复制从机链接"
                  onClick={() => void copyTabLink(tab.id)}
                  className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-fg-subtle transition-colors hover:bg-sunken hover:text-fg"
                >
                  <Link2 width={13} height={13} className="shrink-0" />
                </button>
              )}
              <button
                type="button"
                aria-label="关闭验收 tab"
                onClick={() => closeTab(tab.id)}
                className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-fg-subtle transition-colors hover:bg-sunken hover:text-fg"
              >
                <X width={13} height={13} className="shrink-0" />
              </button>
            </div>
          )
        })}
        <Button
          isIconOnly
          size="sm"
          variant="ghost"
          aria-label="新增验收 tab"
          isDisabled={tabsState.tabs.length >= CHECKOFF_MULTI_MAX_TABS}
          onPress={addTab}
        >
          <Plus width={15} height={15} className="shrink-0" />
        </Button>
        <span className="tabular shrink-0 text-[11px] text-fg-subtle">
          {tabsState.tabs.length}/{CHECKOFF_MULTI_MAX_TABS}
        </span>
      </div>

      {ratioError && (
        <Alert className="mb-4" status="warning">
          <Alert.Indicator />
          <Alert.Content>
            <Alert.Description>
              评分占比加载失败，总评按默认占比 2:5:0 估算，仅供参考
            </Alert.Description>
          </Alert.Content>
        </Alert>
      )}

      <div>
        {tabsState.tabs.map((tab) => (
          <CheckoffInstance
            key={tab.id}
            id={tab.id}
            classId={currentClass.id}
            userId={user.id}
            grader={{ name: user.name, avatar: user.avatar }}
            experiments={experiments}
            experimentsLoading={loading}
            classSettings={classSettings}
            preferences={preferences}
            markdownStyle={markdownStyle}
            theme={theme}
            active={tabsState.activeId === tab.id}
            onMetaChange={handleMetaChange}
            onSaved={handleSaved}
          />
        ))}
      </div>

      <Modal state={prefsState}>
        <Modal.Backdrop>
          <Modal.Container>
            <Modal.Dialog className="sm:max-w-3xl">
              <Modal.CloseTrigger />
              <Modal.Body>
                <PreferenceOnboarding
                  initial={preferences}
                  onSubmit={savePreferences}
                  onCancel={prefsState.close}
                  layout="rows"
                />
              </Modal.Body>
            </Modal.Dialog>
          </Modal.Container>
        </Modal.Backdrop>
      </Modal>
    </CheckoffLayout>
  )
}
