import { useEffect } from 'react'
import { Outlet, useLocation, useNavigate } from 'react-router-dom'

import ArrowLeft from '~icons/lucide/arrow-left'
import { ThemeToggle } from '@/components/ui/ThemeToggle'

/** 无需登录的独立页 layout：居中容器 + 返回 + 主题切换 */
export function PublicLayout() {
  const navigate = useNavigate()
  const { pathname } = useLocation()

  useEffect(() => {
    window.scrollTo(0, 0)
  }, [pathname])

  const goBack = () => {
    if (window.history.length > 1) navigate(-1)
    else navigate('/')
  }

  return (
    <div className="mx-auto max-w-4xl px-6 py-12">
      <div className="flex items-center justify-between gap-4">
        <button
          type="button"
          onClick={goBack}
          className="inline-flex cursor-pointer items-center gap-2 text-sm font-medium text-fg-muted transition-colors hover:text-fg"
        >
          <ArrowLeft width={16} height={16} className="shrink-0" />
          返回
        </button>
        <ThemeToggle />
      </div>

      <div className="mt-8">
        <Outlet />
      </div>
    </div>
  )
}
