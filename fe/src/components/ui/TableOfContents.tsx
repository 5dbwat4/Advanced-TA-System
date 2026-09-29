import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { cn } from '@/lib/utils'

export type TocItem = { id: string; label: string }

/**
 * 页内目录（"On this page"）。HeroUI 没有现成组件，这里用 IntersectionObserver
 * 做滚动监听：段落 id 对应页面里 <section id>，滚到顶部即高亮。
 * 传入的 items 请保持引用稳定（模块级常量），否则 effect 会反复重建。
 */
export function TableOfContents({ items }: { items: TocItem[] }) {
  const [activeId, setActiveId] = useState<string | null>(items[0]?.id ?? null)
  const navigate = useNavigate()

  useEffect(() => {
    const sections = items
      .map((item) => document.getElementById(item.id))
      .filter((el): el is HTMLElement => el !== null)
    if (sections.length === 0) return

    // 与页面顶部 sticky header 对齐的偏移量
    const offset = 96
    const observer = new IntersectionObserver(
      () => {
        let current = sections[0].id
        for (const section of sections) {
          if (section.getBoundingClientRect().top <= offset) current = section.id
        }
        setActiveId(current)
      },
      { rootMargin: `-${offset}px 0px -55% 0px`, threshold: [0, 1] },
    )

    sections.forEach((section) => observer.observe(section))
    return () => observer.disconnect()
  }, [items])

  return (
    <nav className="sticky top-24 hidden w-44 shrink-0 lg:block" aria-label="本页目录">
      <p className="mb-3 pl-4 text-xs font-bold">本页目录</p>
      <ul>
        {items.map((item) => (
          <li key={item.id}>
            <a
              href={`#${item.id}`}
              onClick={(event) => {
                event.preventDefault()
                document.getElementById(item.id)?.scrollIntoView({ behavior: 'smooth' })
                // 让地址栏带上 hash（等价 pushState），便于分享 / 前进后退
                navigate({ hash: `#${item.id}` })
              }}
              className={cn(
                'block border-l-2 py-1.5 pl-4 text-sm transition-colors',
                activeId === item.id
                  ? 'border-brand-500 font-semibold text-brand-600 dark:text-brand-300'
                  : 'border-line text-fg-muted hover:text-fg',
              )}
            >
              {item.label}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  )
}
