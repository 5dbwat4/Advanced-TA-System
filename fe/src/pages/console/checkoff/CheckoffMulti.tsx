import {
  Alert,
  Button,
  Dropdown,
  Label,
  Modal,
  Spinner,
  toast as herouiToast,
  useOverlayState,
} from '@heroui/react'
import copyToClipboard from 'copy-to-clipboard'
import { useTheme } from 'next-themes'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'

import ClipboardCheck from '~icons/lucide/clipboard-check'
import Link2 from '~icons/lucide/link-2'
import ListOrdered from '~icons/lucide/list-ordered'
import MoreHorizontal from '~icons/lucide/more-horizontal'
import Plus from '~icons/lucide/plus'
import School from '~icons/lucide/school'
import Settings2 from '~icons/lucide/settings-2'
import X from '~icons/lucide/x'
import { CheckoffLayout } from '@/components/checkoff/CheckoffLayout'
import { CheckoffQueuePanel } from '@/components/checkoff/CheckoffQueuePanel'
import { PreferenceOnboarding } from '@/components/checkoff/PreferenceOnboarding'
import { EmptyState } from '@/components/ui/Card'
import { IconAction } from '@/components/ui/IconAction'
import {
  fetchCheckoff,
  fetchClassSettings,
  type CheckoffExperiment,
  type CheckoffQueueEntry,
  type ClassSettings,
  type UserPreferences,
} from '@/lib/api'
import { useAuth } from '@/lib/auth'
import {
  destroyCheckoffSession,
  useCheckoffQueue,
  useCheckoffWatch,
  type CheckoffStartedEvent,
} from '@/lib/checkoff-socket'
import {
  CHECKOFF_MULTI_MAX_TABS,
  clearInstanceStorage,
  createTabId,
  loadMultiTabs,
  saveMultiTabs,
  type CheckoffPendingPick,
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
  const navigate = useNavigate()
  const prefsState = useOverlayState()

  const [experiments, setExperiments] = useState<CheckoffExperiment[]>([])
  const [classSettings, setClassSettings] = useState<ClassSettings | null>(null)
  const [loading, setLoading] = useState(true)
  const [ratioError, setRatioError] = useState(false)
  const [tabsState, setTabsState] = useState<MultiTabsState>(loadMultiTabs)
  const [meta, setMeta] = useState<Record<string, CheckoffTabMeta>>({})
  const queueState = useOverlayState()
  // 排队面板点击后要下发给目标 tab 的定位指令（只发给 tabId 对应的那个 tab）
  const [pendingPick, setPendingPick] = useState<CheckoffPendingPick | null>(null)
  const pickSeqRef = useRef(0)

  const handleCheckoffStarted = useCallback((event: CheckoffStartedEvent) => {
    herouiToast(`${event.userName}正在验收${event.studentName}。`, { timeout: 10000 })
  }, [])
  useCheckoffWatch(classId, handleCheckoffStarted)

  // 排队快照：REST 初始 + checkoff:queue 实时替换（队列按实验、全班共享）
  const {
    entries: queueEntries,
    loading: queueLoading,
    reload: reloadQueue,
  } = useCheckoffQueue(classId)

  // 当前激活 tab 的实验：徽标人数与面板分组都优先按它
  const activeExperimentId = meta[tabsState.activeId]?.experimentId ?? null
  const queueCount = useMemo(
    () =>
      activeExperimentId
        ? queueEntries.filter((entry) => entry.experimentId === activeExperimentId).length
        : queueEntries.length,
    [queueEntries, activeExperimentId],
  )

  const openQueue = useCallback(() => {
    queueState.open()
    reloadQueue()
  }, [queueState, reloadQueue])

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
      setPendingPick((prev) => (prev?.tabId === id ? null : prev))
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

  /**
   * 排队面板点击某条 → 定位到对应 tab：
   * 1) 已有 tab 正在验收这个学生 → 只激活（绝不重置进行中的录入）；
   * 2) 同实验且空闲的 tab → 激活并下发定位指令；
   * 3) 还没选实验的空白 tab → 复用它，避免每次定位都多开一个 tab；
   * 4) 未到 tab 上限 → 新建 tab 并下发定位指令；
   * 5) 已满且没有可用 tab → 报错，不做破坏性重置。
   * 真正的「切实验 + 预填学号」由目标 tab 自己消费 pendingPick 完成。
   */
  const handlePickQueueEntry = useCallback(
    (entry: CheckoffQueueEntry) => {
      queueState.close()
      const tabs = tabsState.tabs

      // 队列快照可能比实验列表旧（实验刚被删除 / 改期）：先确认目标实验仍在
      if (experiments.length > 0 && !experiments.some((item) => item.id === entry.experimentId)) {
        toast.error('该实验已不存在，请刷新后重试')
        return
      }

      const sameStudent = tabs.find((tab) => {
        const info = meta[tab.id]
        return info?.experimentId === entry.experimentId && info?.studentUserId === entry.userId
      })
      if (sameStudent) {
        activateTab(sameStudent.id)
        toast.success(`已定位到 ${entry.name}`)
        return
      }

      const idleSameExperiment = tabs.find((tab) => {
        const info = meta[tab.id]
        return info?.experimentId === entry.experimentId && !info.studentUserId
      })
      // 没有任何实验的空白 tab：直接复用（定位会把它切到目标实验）
      const emptyTab = tabs.find((tab) => {
        const info = meta[tab.id]
        // 必须已经回报过 meta（info 存在）且确实没有实验/学生，避免误选尚未汇报状态的 tab
        return info != null && !info.experimentId && !info.studentUserId
      })

      let targetId = idleSameExperiment?.id ?? emptyTab?.id
      if (!targetId) {
        if (tabs.length >= CHECKOFF_MULTI_MAX_TABS) {
          toast.error(`最多同时开启 ${CHECKOFF_MULTI_MAX_TABS} 个验收 tab，请先关闭一个`)
          return
        }
        const newId = createTabId()
        setTabsState((prev) => ({ tabs: [...prev.tabs, { id: newId }], activeId: newId }))
        targetId = newId
      } else {
        activateTab(targetId)
      }

      pickSeqRef.current += 1
      setPendingPick({
        tabId: targetId,
        experimentId: entry.experimentId,
        studentId: entry.studentId,
        seq: pickSeqRef.current,
      })
      toast.success(`已定位到 ${entry.name}`)
    },
    [tabsState.tabs, meta, experiments, queueState, activateTab],
  )

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
        <>
          <div className="relative">
            <IconAction label="排队情况" onPress={openQueue}>
              <ListOrdered width={15} height={15} className="shrink-0" />
            </IconAction>
            {queueCount > 0 && (
              <span className="tabular pointer-events-none absolute -right-1 -top-1 z-10 flex h-4 min-w-4 items-center justify-center rounded-full bg-brand-600 px-1 text-[10px] font-bold leading-none text-white">
                {queueCount > 99 ? '99+' : queueCount}
              </span>
            )}
          </div>
          <IconAction label="偏好" onPress={prefsState.open}>
            <Settings2 width={15} height={15} className="shrink-0" />
          </IconAction>
          <Dropdown>
            <Dropdown.Trigger
              className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-fg-muted transition-colors hover:bg-sunken hover:text-fg"
              aria-label="更多"
            >
              <MoreHorizontal width={16} height={16} className="shrink-0" />
            </Dropdown.Trigger>
            <Dropdown.Popover className="min-w-[180px]">
              <Dropdown.Menu
                onAction={(key) => {
                  if (key === 'checkoff') navigate('/console/checkoff')
                }}
              >
                <Dropdown.Item id="checkoff" textValue="返回验收">
                  <ClipboardCheck width={15} height={15} className="shrink-0 text-fg-muted" />
                  <Label>返回验收</Label>
                </Dropdown.Item>
              </Dropdown.Menu>
            </Dropdown.Popover>
          </Dropdown>
        </>
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
            pendingPick={pendingPick?.tabId === tab.id ? pendingPick : null}
            onMetaChange={handleMetaChange}
            onSaved={handleSaved}
          />
        ))}
      </div>

      <Modal state={queueState}>
        <Modal.Backdrop>
          <Modal.Container>
            <Modal.Dialog className="sm:max-w-xl">
              <Modal.CloseTrigger />
              <Modal.Header>
                <Modal.Icon className="bg-brand-500/10 text-brand-600 dark:text-brand-300">
                  <ListOrdered width={18} height={18} className="shrink-0" />
                </Modal.Icon>
                <Modal.Heading>排队情况</Modal.Heading>
              </Modal.Header>
              <Modal.Body>
                <CheckoffQueuePanel
                  entries={queueEntries}
                  loading={queueLoading}
                  currentExperimentId={activeExperimentId}
                  onPick={handlePickQueueEntry}
                  onRefresh={reloadQueue}
                  classId={currentClass.id}
                  currentUserId={user.id}
                  experiments={experiments}
                />
              </Modal.Body>
            </Modal.Dialog>
          </Modal.Container>
        </Modal.Backdrop>
      </Modal>

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
