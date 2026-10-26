import { Button } from '@heroui/react'
import { useNavigate } from 'react-router-dom'

import Eye from '~icons/lucide/eye'
import { Logo } from '@/components/ui/Logo'
import { ThemeToggle } from '@/components/ui/ThemeToggle'
import { useAuth } from '@/lib/auth'

/** 观察者独立面板占位页：后续在此实现只读查看能力 */
export default function ViewerHome() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()

  const handleLogout = () => {
    logout()
    navigate('/login', { replace: true })
  }

  return (
    <div className="diagonal-bg relative flex min-h-screen items-center justify-center px-5 py-10">
      <div className="absolute right-4 top-4">
        <ThemeToggle />
      </div>

      <div className="w-full max-w-md rounded-3xl border border-line bg-elevated/80 p-8 text-center backdrop-blur-xl">
        <div className="mb-4 flex justify-center">
          <Logo size={40} />
        </div>
        <div className="mb-3 flex justify-center">
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-brand-500/10 text-brand-600 dark:text-brand-300">
            <Eye width={22} height={22} className="shrink-0" />
          </span>
        </div>
        <h1 className="text-lg font-bold tracking-tight">观察者面板</h1>
        <p className="mt-2 text-sm text-fg-muted">
          {user?.name ? `你好，${user.name}。` : ''}
          观察者的独立面板正在建设中。
        </p>
        <p className="mt-1 text-xs text-fg-subtle">
          当前账号暂不能进入助教 / 教师后台，仅可使用账号基础功能。
        </p>

        <div className="mt-6 flex gap-2">
          <Button variant="secondary" fullWidth onPress={() => navigate('/settings')}>
            账号设置
          </Button>
          <Button variant="ghost" fullWidth onPress={handleLogout}>
            退出登录
          </Button>
        </div>
      </div>
    </div>
  )
}
