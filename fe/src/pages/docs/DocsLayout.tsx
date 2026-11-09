import { useEffect, useState } from 'react'
import { Link, Outlet, useLocation } from 'react-router-dom'

import ArrowLeft from '~icons/lucide/arrow-left'
import Menu from '~icons/lucide/menu'
import X from '~icons/lucide/x'
import { Logo } from '@/components/ui/Logo'
import { ThemeToggle } from '@/components/ui/ThemeToggle'
import { DOCS } from '@/content/docs'
import { cn } from '@/lib/utils'

import './docs.css'

export default function DocsLayout() {
  const { pathname } = useLocation()
  const [menuOpen, setMenuOpen] = useState(false)
  const activeSlug = pathname.replace(/^\/docs\/?/, '')

  useEffect(() => {
    window.scrollTo(0, 0)
  }, [pathname])

  useEffect(() => {
    if (!menuOpen) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMenuOpen(false)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [menuOpen])

  return (
    <div className="vp-docs">
      <header className="vp-nav">
        <div className="vp-nav-inner">
          <Link to="/docs" className="vp-brand">
            <Logo size={26} />
            <span>
              ATASAAS
              <span className="vp-brand-sub">文档</span>
            </span>
          </Link>

          <nav className="vp-nav-links" aria-label="文档导航">
            <ThemeToggle />
            <button
              type="button"
              aria-label={menuOpen ? '关闭文档目录' : '打开文档目录'}
              className="vp-menu-button"
              onClick={() => setMenuOpen((open) => !open)}
            >
              {menuOpen ? (
                <X width={18} height={18} className="shrink-0" />
              ) : (
                <Menu width={18} height={18} className="shrink-0" />
              )}
            </button>
          </nav>
        </div>
      </header>

      <div className="vp-body">
        {menuOpen && (
          <button
            type="button"
            aria-label="关闭文档目录"
            className="vp-backdrop"
            onClick={() => setMenuOpen(false)}
          />
        )}

        <aside className={cn('vp-sidebar', menuOpen && 'is-open')}>
          <nav className="vp-sidebar-nav" aria-label="使用文档">
            <p className="vp-sidebar-title">使用文档</p>
            <ul>
              {DOCS.map((doc) => (
                <li key={doc.slug}>
                  <Link
                    to={`/docs/${doc.slug}`}
                    className={cn('vp-sidebar-link', activeSlug === doc.slug && 'is-active')}
                    onClick={() => setMenuOpen(false)}
                  >
                    {doc.title}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          <Link to="/" className="vp-sidebar-back">
            <ArrowLeft width={14} height={14} className="shrink-0" />
            返回首页
          </Link>
        </aside>

        <div className="vp-content-wrap">
          <Outlet />
        </div>
      </div>
    </div>
  )
}
