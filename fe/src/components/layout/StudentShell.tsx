import { Button } from '@heroui/react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { toast } from 'sonner'

import BookOpen from '~icons/lucide/book-open'
import ClipboardList from '~icons/lucide/clipboard-list'
import LayoutDashboard from '~icons/lucide/layout-dashboard'
import LogOut from '~icons/lucide/log-out'
import SettingsIcon from '~icons/lucide/settings'
import { AvatarImage } from '@/components/ui/AvatarImage'
import { Logo } from '@/components/ui/Logo'
import { ThemeToggle } from '@/components/ui/ThemeToggle'
import { useAuth } from '@/lib/auth'
import { cn } from '@/lib/utils'

const NAV_ITEMS = [
  { to: '/student-console', label: '概览', icon: LayoutDashboard, end: true },
  { to: '/student-console/scores', label: '实验成绩', icon: ClipboardList, end: false },
  { to: '/student-console/settings', label: '设置', icon: SettingsIcon, end: false },
]

export function StudentShell() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const klass = user?.classes[0]

  const handleLogout = () => {
    logout()
    toast.success('已退出登录')
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
              Student Console
            </div>
          </div>
        </div>

        <nav className="mt-4 flex flex-1 flex-col gap-1 px-3">
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                cn(
                  'group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors',
                  isActive
                    ? 'bg-brand-500/10 text-fg ring-1 ring-brand-500/25'
                    : 'text-fg-muted hover:text-fg',
                )
              }
            >
              <item.icon
                width={18}
                height={18}
                className="shrink-0 text-brand-600 transition-colors dark:text-brand-300"
              />
              <span>{item.label}</span>
            </NavLink>
          ))}
        </nav>

        <div className="border-t border-line p-3">
          <div className="flex items-center gap-3 rounded-xl px-2 py-2">
            <AvatarImage
              id={user?.avatar ?? null}
              size={36}
              fallback={user?.name?.slice(0, 1) ?? '·'}
            />
            <div className="min-w-0 flex-1 leading-tight">
              <div className="truncate text-sm font-semibold">{user?.name ?? '未登录'}</div>
              <div className="truncate text-xs tabular text-fg-subtle">
                {user?.studentId ?? '—'}
              </div>
            </div>
            <Button
              aria-label="退出登录"
              size="sm"
              variant="ghost"
              isIconOnly
              onPress={handleLogout}
            >
              <LogOut width={16} height={16} className="shrink-0 text-fg-muted" />
            </Button>
          </div>
        </div>
      </aside>

      <div className="flex min-h-screen min-w-0 flex-1 flex-col md:pl-60">
        <header className="glass sticky top-0 z-30 flex h-16 items-center justify-between border-b border-line px-4 md:px-8">
          <div className="flex min-w-0 items-center gap-2">
            <BookOpen width={16} height={16} className="shrink-0 text-brand-600 dark:text-brand-300" />
            <span className="truncate text-sm font-semibold">{klass?.name ?? '未绑定班级'}</span>
          </div>
          <div className="flex items-center gap-1">
            <ThemeToggle />
            <Button
              aria-label="退出登录"
              size="sm"
              variant="ghost"
              isIconOnly
              onPress={handleLogout}
            >
              <LogOut width={16} height={16} className="shrink-0" />
            </Button>
          </div>
        </header>

        <main className="flex-1 px-4 pb-24 pt-6 md:px-8 md:pb-10">
          <Outlet />
        </main>
      </div>

      <nav className="glass fixed inset-x-0 bottom-0 z-40 flex items-stretch justify-around border-t border-line pb-[env(safe-area-inset-bottom)] md:hidden">
        {NAV_ITEMS.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={({ isActive }) =>
              cn(
                'relative flex flex-1 flex-col items-center gap-1 py-2.5 text-[10px] font-medium transition-colors',
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
