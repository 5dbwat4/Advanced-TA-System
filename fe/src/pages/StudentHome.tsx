import { Button } from '@heroui/react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'

import GraduationCap from '~icons/lucide/graduation-cap'
import LogOut from '~icons/lucide/log-out'
import SettingsIcon from '~icons/lucide/settings'
import { CreditsSection } from '@/components/settings/CreditsSection'
import { AvatarImage } from '@/components/ui/AvatarImage'
import { Logo } from '@/components/ui/Logo'
import { ThemeToggle } from '@/components/ui/ThemeToggle'
import { useAuth } from '@/lib/auth'

export default function StudentHome() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  if (!user) return null

  const klass = user.classes[0]

  const handleLogout = () => {
    logout()
    toast.success('已退出登录')
    navigate('/login', { replace: true })
  }

  return (
    <div className="diagonal-bg min-h-screen">
      <header className="glass sticky top-0 z-30 flex h-16 items-center justify-between border-b border-line px-5 md:px-8">
        <div className="flex items-center gap-3">
          <Logo size={32} />
          <div className="leading-tight">
            <div className="text-sm font-bold tracking-tight">Advanced TA System</div>
            <div className="text-[10px] font-medium tracking-widest text-fg-subtle">学生主页</div>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <ThemeToggle />
          <Button size="sm" variant="ghost" onPress={() => navigate('/settings')}>
            <SettingsIcon width={15} height={15} className="shrink-0" />
            设置
          </Button>
          <Button size="sm" variant="ghost" onPress={handleLogout}>
            <LogOut width={15} height={15} className="shrink-0" />
            退出
          </Button>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-2xl flex-col gap-4 px-5 py-8">
        <section className="rounded-3xl border border-line bg-elevated/80 p-6 shadow-2xl backdrop-blur-xl">
          <div className="flex items-center gap-4">
            <AvatarImage id={user.avatar} size={64} fallback={user.name.slice(0, 1)} />
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="truncate text-xl font-bold tracking-tight">{user.name}</span>
                <span className="inline-flex items-center gap-1 rounded-full bg-brand-500/10 px-2 py-0.5 text-[10px] font-semibold text-brand-600 dark:text-brand-300">
                  <GraduationCap width={12} height={12} className="shrink-0" />
                  学生
                </span>
              </div>
              <div className="tabular mt-1 text-sm text-fg-muted">{user.studentId ?? '—'}</div>
              <div className="mt-1 text-xs text-fg-subtle">{klass?.name ?? '未绑定班级'}</div>
            </div>
          </div>
        </section>

        <CreditsSection />
      </main>
    </div>
  )
}
