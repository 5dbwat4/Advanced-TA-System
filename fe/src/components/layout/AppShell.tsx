import { Button, Dropdown, Label, Tooltip } from '@heroui/react'
import { motion } from 'motion/react'
import { useEffect, useState } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { toast } from 'sonner'

import ChevronDown from '~icons/lucide/chevron-down'
import Ellipsis from '~icons/lucide/ellipsis'
import LogOut from '~icons/lucide/log-out'
import PanelLeftClose from '~icons/lucide/panel-left-close'
import PanelLeftOpen from '~icons/lucide/panel-left-open'
import School from '~icons/lucide/school'
import { AvatarImage } from '@/components/ui/AvatarImage'
import { IconAction } from '@/components/ui/IconAction'
import { Logo } from '@/components/ui/Logo'
import { ThemeToggle } from '@/components/ui/ThemeToggle'
import { fetchMyAccounts, switchMyAccount, type LoginCandidate } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import { getErrorMessage } from '@/lib/error'
import { MOBILE_NAV_ITEMS, MORE_PATH, NAV_ITEMS, isMoreSection } from '@/lib/nav'
import { useAppStore, useCurrentClass, useHasXzzdPermission } from '@/lib/store'
import { cn } from '@/lib/utils'
import { getZjuamCredential } from '@/lib/zjuam'

const ROLE_LABELS: Record<LoginCandidate['role'], string> = {
  TA: '助教',
  TEACHER: '教师',
  STUDENT: '学生',
}

export function AppShell() {
  const { user, logout, adoptSession } = useAuth()
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const moreActive = isMoreSection(pathname)
  const classes = user?.classes ?? []
  const currentClass = useCurrentClass()
  const setCurrentClassId = useAppStore((state) => state.setCurrentClassId)
  const sidebarCollapsed = useAppStore((state) => state.sidebarCollapsed)
  const toggleSidebar = useAppStore((state) => state.toggleSidebar)
  const hasXzzd = useHasXzzdPermission()
  const syncLocalCredential = useAppStore((state) => state.syncLocalCredential)
  const loadZjuamCourses = useAppStore((state) => state.loadZjuamCourses)
  const hasZjuamPassword = user?.hasZjuamPassword
  const [accounts, setAccounts] = useState<LoginCandidate[]>([])
  const [switching, setSwitching] = useState(false)

  useEffect(() => {
    let cancelled = false
    fetchMyAccounts()
      .then((res) => {
        if (!cancelled) setAccounts(res.accounts)
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [user?.id])

  const accountOptions: LoginCandidate[] =
    accounts.length > 0
      ? accounts
      : user
        ? [
            {
              userId: user.id,
              name: user.name,
              studentId: user.studentId,
              classId: user.classId,
              className: currentClass?.name ?? null,
              role: user.role,
            },
          ]
        : []

  const switchCourse = async (account: LoginCandidate) => {
    if (account.userId === user?.id) {
      if (account.classId) setCurrentClassId(account.classId)
      return
    }

    setSwitching(true)
    try {
      const result = await switchMyAccount(account.userId)
      adoptSession(result)
      if (result.user.classId) setCurrentClassId(result.user.classId)
      if (result.user.role === 'STUDENT') {
        navigate('/home', { replace: true })
      } else {
        toast.success(`已切换到 ${account.className ?? '新课程'}`)
      }
    } catch (error) {
      toast.error(getErrorMessage(error, '切换课程失败'))
    } finally {
      setSwitching(false)
    }
  }

  useEffect(() => {
    if (classes.length === 0) {
      setCurrentClassId(null)
    } else if (!classes.some((item) => item.id === currentClass?.id)) {
      setCurrentClassId(classes[0].id)
    }
  }, [classes, currentClass, setCurrentClassId])

  useEffect(() => {
    syncLocalCredential()
    if (Boolean(getZjuamCredential()) || hasZjuamPassword) {
      void loadZjuamCourses()
    }
  }, [syncLocalCredential, loadZjuamCourses, hasZjuamPassword])

  const handleLogout = () => {
    logout()
    toast.success('已退出登录')
    navigate('/login', { replace: true })
  }

  return (
    <div className="flex min-h-screen">
      {/* Sidebar */}
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-40 hidden flex-col border-r border-line bg-elevated/60 backdrop-blur-xl transition-[width] duration-300 md:flex',
          sidebarCollapsed ? 'w-16' : 'w-60',
        )}
      >
        <div
          className={cn(
            'flex h-16 items-center gap-3',
            sidebarCollapsed ? 'justify-center px-0' : 'px-5',
          )}
        >
          <Logo size={36} />
          {!sidebarCollapsed && (
            <div className="leading-tight">
              <div className="text-sm font-bold tracking-tight">ATASAAS</div>
              <div className="text-[10px] font-medium tracking-widest text-fg-subtle">
                Yet another TA System
              </div>
            </div>
          )}
        </div>

        <nav className={cn('mt-4 flex flex-1 flex-col gap-1', sidebarCollapsed ? 'px-2' : 'px-3')}>
          {NAV_ITEMS.map((item) => {
            const link = (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end ?? false}
                className={({ isActive }) =>
                  cn(
                    'group relative flex items-center gap-3 rounded-xl py-2.5 text-sm font-medium transition-colors',
                    sidebarCollapsed ? 'justify-center px-0' : 'px-3',
                    isActive ? 'text-fg' : 'text-fg-muted hover:text-fg',
                  )
                }
              >
                {({ isActive }) => (
                  <>
                    {isActive && (
                      <motion.span
                        layoutId="nav-active"
                        className="absolute inset-0 rounded-xl bg-brand-500/10 ring-1 ring-brand-500/25 dark:bg-brand-400/10"
                        transition={{ type: 'spring', stiffness: 400, damping: 32 }}
                      />
                    )}
                    <item.icon
                      width={18}
                      height={18}
                      className={cn(
                        'shrink-0 relative transition-colors',
                        isActive ? 'text-brand-600 dark:text-brand-300' : 'group-hover:text-fg',
                      )}
                    />
                    {!sidebarCollapsed && <span className="relative">{item.label}</span>}
                    {isActive && !sidebarCollapsed && (
                      <motion.span
                        layoutId="nav-dot"
                        className="absolute right-3 h-1.5 w-1.5 rounded-full bg-amber-500"
                      />
                    )}
                  </>
                )}
              </NavLink>
            )

            if (!sidebarCollapsed) return link

            return (
              <Tooltip key={item.to} delay={0}>
                <Tooltip.Trigger>{link}</Tooltip.Trigger>
                <Tooltip.Content showArrow placement="right">
                  {item.label}
                </Tooltip.Content>
              </Tooltip>
            )
          })}
        </nav>

        <div className={cn('border-t border-line', sidebarCollapsed ? 'p-2' : 'p-3')}>
          {sidebarCollapsed ? (
            <div className="flex flex-col items-center gap-1">
              <Tooltip delay={0}>
                <Tooltip.Trigger>
                  <AvatarImage
                    id={user?.avatar ?? null}
                    size={36}
                    fallback={user?.username?.slice(0, 1) ?? '·'}
                  />
                </Tooltip.Trigger>
                <Tooltip.Content showArrow placement="right">
                  <div className="text-xs font-semibold">{user?.name ?? '未登录'}</div>
                  {user?.username && <div className="text-[10px] opacity-70">@{user.username}</div>}
                </Tooltip.Content>
              </Tooltip>
              <IconAction label="退出登录" onPress={handleLogout}>
                <LogOut width={16} height={16} className="shrink-0 text-fg-muted" />
              </IconAction>
            </div>
          ) : (
            <div className="flex items-center gap-3 rounded-xl px-2 py-2">
              <AvatarImage
                id={user?.avatar ?? null}
                size={36}
                fallback={user?.username?.slice(0, 1) ?? '·'}
              />
              <div className="min-w-0 flex-1 leading-tight">
                <div className="truncate text-sm font-semibold">{user?.name ?? '未登录'}</div>
                <div className="truncate text-xs text-fg-subtle">
                  {user?.username ? `@${user.username}` : '—'}
                </div>
              </div>
              <IconAction label="退出登录" onPress={handleLogout}>
                <LogOut width={16} height={16} className="shrink-0 text-fg-muted" />
              </IconAction>
            </div>
          )}
        </div>
      </aside>

      {/* Main column */}
      <div
        className={cn(
          'flex min-h-screen min-w-0 flex-1 flex-col transition-[padding] duration-300',
          sidebarCollapsed ? 'md:pl-16' : 'md:pl-60',
        )}
      >
        <header className="glass sticky top-0 z-30 flex h-16 items-center justify-between border-b border-line px-4 md:px-8">
          <div className="flex items-center gap-3 md:hidden">
            <Logo size={32} />
            <span className="text-sm font-bold">ATASAAS</span>
          </div>
          <div className="hidden md:inline-flex">
            <IconAction
              label={sidebarCollapsed ? '展开侧边栏' : '折叠侧边栏'}
              placement="bottom"
              onPress={toggleSidebar}
            >
              {sidebarCollapsed ? (
                <PanelLeftOpen width={18} height={18} className="shrink-0 text-fg-muted" />
              ) : (
                <PanelLeftClose width={18} height={18} className="shrink-0 text-fg-muted" />
              )}
            </IconAction>
          </div>
          <div className="flex items-center gap-1">
            {hasXzzd && (
              <School
                width={14}
                height={14}
                className="shrink-0 text-brand-600 dark:text-brand-300"
              />
            )}
            {accountOptions.length === 0 ? (
              <Button aria-label="选择班级" size="sm" variant="secondary" isDisabled>
                未绑定班级
              </Button>
            ) : (
              <Dropdown>
                <Button
                  aria-label="选择班级"
                  size="sm"
                  variant="secondary"
                  isDisabled={switching}
                  className="max-w-[10rem] md:max-w-[14rem]"
                >
                  <span className="truncate">{currentClass?.name ?? '选择班级'}</span>
                  <ChevronDown width={14} height={14} className="shrink-0 text-fg-subtle" />
                </Button>
                <Dropdown.Popover>
                  <Dropdown.Menu
                    selectionMode="single"
                    selectedKeys={user ? [user.id] : []}
                    onSelectionChange={(keys) => {
                      const id = Array.from(keys)[0]
                      if (typeof id !== 'string') return
                      const account = accountOptions.find((item) => item.userId === id)
                      if (account) void switchCourse(account)
                    }}
                  >
                    {accountOptions.map((item) => (
                      <Dropdown.Item
                        key={item.userId}
                        id={item.userId}
                        textValue={`${item.className ?? '未绑定班级'} ${ROLE_LABELS[item.role]}`}
                      >
                        <Dropdown.ItemIndicator />
                        <Label className="flex w-full items-center justify-between gap-2">
                          <span className="truncate">{item.className ?? '未绑定班级'}</span>
                          <span className="shrink-0 rounded bg-sunken px-1.5 py-0.5 text-[10px] font-medium text-fg-subtle">
                            {ROLE_LABELS[item.role]}
                          </span>
                        </Label>
                      </Dropdown.Item>
                    ))}
                  </Dropdown.Menu>
                </Dropdown.Popover>
              </Dropdown>
            )}
            <ThemeToggle />
            <div className="md:hidden">
              <IconAction label="退出登录" onPress={handleLogout}>
                <LogOut width={16} height={16} className="shrink-0" />
              </IconAction>
            </div>
          </div>
        </header>

        {/* Mobile bottom nav */}
        <nav className="glass fixed inset-x-0 bottom-0 z-40 flex items-stretch justify-around border-t border-line pb-[env(safe-area-inset-bottom)] md:hidden">
          {MOBILE_NAV_ITEMS.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end ?? false}
              className={({ isActive }) =>
                cn(
                  'relative flex flex-1 flex-col items-center gap-1 py-2.5 text-[10px] font-medium transition-colors',
                  isActive ? 'text-brand-600 dark:text-brand-300' : 'text-fg-subtle',
                )
              }
            >
              {({ isActive }) => (
                <>
                  {isActive && (
                    <motion.span
                      layoutId="mobile-nav-pill"
                      className="absolute -top-px h-0.5 w-10 rounded-full bg-gradient-to-r from-brand-500 to-amber-500"
                    />
                  )}
                  <item.icon width={20} height={20} className="shrink-0" />
                  {item.label}
                </>
              )}
            </NavLink>
          ))}
          <NavLink
            to={MORE_PATH}
            aria-current={moreActive ? 'page' : undefined}
            className={cn(
              'relative flex flex-1 flex-col items-center gap-1 py-2.5 text-[10px] font-medium transition-colors',
              moreActive ? 'text-brand-600 dark:text-brand-300' : 'text-fg-subtle',
            )}
          >
            {moreActive && (
              <motion.span
                layoutId="mobile-nav-pill"
                className="absolute -top-px h-0.5 w-10 rounded-full bg-gradient-to-r from-brand-500 to-amber-500"
              />
            )}
            <Ellipsis width={20} height={20} className="shrink-0" />
            更多
          </NavLink>
        </nav>

        <main className="flex-1 px-4 pb-24 pt-6 md:px-8 md:pb-10">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
