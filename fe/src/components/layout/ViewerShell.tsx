import { useMemo } from 'react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'

import BookOpenText from '~icons/lucide/book-open-text'
import FlaskConical from '~icons/lucide/flask-conical'
import LogOut from '~icons/lucide/log-out'
import Settings2 from '~icons/lucide/settings-2'
import Table from '~icons/lucide/table'
import UserRound from '~icons/lucide/user-round'
import UserSearch from '~icons/lucide/user-search'
import { ClassAccountMenu } from '@/components/layout/ClassAccountMenu'
import { AvatarImage } from '@/components/ui/AvatarImage'
import { IconAction } from '@/components/ui/IconAction'
import { Logo } from '@/components/ui/Logo'
import { ThemeToggle } from '@/components/ui/ThemeToggle'
import { useAuth } from '@/lib/auth'
import type { IconComponent } from '@/lib/icon'
import { cn } from '@/lib/utils'

type ViewerNavItem = { to: string; label: string; icon: IconComponent }

const VIEWER_NAV_ITEMS: ViewerNavItem[] = [
  { to: '/viewer/experiments', label: '实验列表', icon: FlaskConical },
  { to: '/viewer/scores', label: '分数列表', icon: Table },
  { to: '/viewer/courses/settings', label: '课程设置', icon: Settings2 },
  { to: '/viewer/settings', label: '个人设置', icon: UserRound },
  { to: '/docs', label: '使用文档', icon: BookOpenText },
]

const FOCUS_NAV_ITEM: ViewerNavItem = {
  to: '/viewer/focus-students',
  label: '重点关注对象',
  icon: UserSearch,
}

/** 观察者面板外壳：只读导航与账号信息，不提供任何编辑入口 */
export function ViewerShell() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()

  const navItems = useMemo(() => {
    const items = [VIEWER_NAV_ITEMS[0], VIEWER_NAV_ITEMS[1]]
    if (user?.viewerFocusNavVisible) items.push(FOCUS_NAV_ITEM)
    items.push(VIEWER_NAV_ITEMS[2], VIEWER_NAV_ITEMS[3])
    return items
  }, [user?.viewerFocusNavVisible])

  const handleLogout = () => {
    logout()
    navigate('/login', { replace: true })
  }

  return (
    <div className="flex min-h-screen">
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-60 flex-col border-r border-line bg-elevated/60 backdrop-blur-xl md:flex">
        <div className="flex h-16 items-center gap-3 px-5">
          <Logo size={36} />
          <div className="leading-tight">
            <div className="text-sm font-bold tracking-tight">ATASAAS</div>
            <div className="text-[10px] font-medium tracking-widest text-fg-subtle">
              YET ANOTHER TA SYSTEM
            </div>
          </div>
        </div>

        <nav className="mt-4 flex flex-1 flex-col gap-1 px-3">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                cn(
                  'group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors',
                  isActive
                    ? 'bg-brand-500/10 text-fg ring-1 ring-brand-500/25 dark:bg-brand-400/10'
                    : 'text-fg-muted hover:bg-sunken/60 hover:text-fg',
                )
              }
            >
              {({ isActive }) => (
                <>
                  <item.icon
                    width={18}
                    height={18}
                    className={cn(
                      'shrink-0 transition-colors',
                      isActive ? 'text-brand-600 dark:text-brand-300' : 'group-hover:text-fg',
                    )}
                  />
                  <span>{item.label}</span>
                </>
              )}
            </NavLink>
          ))}
        </nav>

        <div className="border-t border-line p-3">
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
        </div>
      </aside>

      <div className="flex min-h-screen min-w-0 flex-1 flex-col md:pl-60">
        <header className="glass sticky top-0 z-30 flex h-16 items-center justify-between border-b border-line px-4 md:px-8">
          <div className="flex items-center gap-3 md:hidden">
            <Logo size={32} />
            <span className="text-sm font-bold">ATASAAS</span>
          </div>
          <div className="ms-auto flex items-center gap-2">
            <ClassAccountMenu />
            <ThemeToggle />
            <div className="md:hidden">
              <IconAction label="退出登录" onPress={handleLogout}>
                <LogOut width={16} height={16} className="shrink-0" />
              </IconAction>
            </div>
          </div>
        </header>

        <main className="flex-1 px-4 pb-24 pt-6 md:px-8 md:pb-10">
          <Outlet />
        </main>
      </div>

      <nav className="glass fixed inset-x-0 bottom-0 z-40 flex items-stretch justify-around border-t border-line pb-[env(safe-area-inset-bottom)] md:hidden">
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              cn(
                'flex flex-1 flex-col items-center gap-1 py-2.5 text-[10px] font-medium transition-colors',
                isActive ? 'text-brand-600 dark:text-brand-300' : 'text-fg-subtle',
              )
            }
          >
            <item.icon width={20} height={20} className="shrink-0" />
            {item.label}
          </NavLink>
        ))}
      </nav>
    </div>
  )
}
