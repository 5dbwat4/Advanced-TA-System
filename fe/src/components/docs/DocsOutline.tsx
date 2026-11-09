import { useEffect, useState } from 'react'

import type { DocHeading } from '@/content/docs'
import { cn } from '@/lib/utils'

export function DocsOutline({ headings }: { headings: DocHeading[] }) {
  // Body headings are rendered one level lower, so level 1/2 map to the
  // visible h2/h3 hierarchy used by the outline.
  const items = headings.filter((heading) => heading.level <= 2)
  const [activeId, setActiveId] = useState(items[0]?.id ?? '')

  useEffect(() => {
    const list = headings.filter((heading) => heading.level <= 2)
    if (list.length === 0) return
    const offset = 112

    const update = () => {
      let current = list[0].id
      for (const item of list) {
        const element = document.getElementById(item.id)
        if (element && element.getBoundingClientRect().top <= offset) current = item.id
      }
      setActiveId(current)
    }

    update()
    window.addEventListener('scroll', update, { passive: true })
    return () => window.removeEventListener('scroll', update)
  }, [headings])

  if (items.length === 0) return null

  const jump = (id: string) => {
    const element = document.getElementById(id)
    if (!element) return
    window.scrollTo({
      top: element.getBoundingClientRect().top + window.scrollY - 96,
      behavior: 'smooth',
    })
    window.history.replaceState(null, '', `#${id}`)
  }

  return (
    <aside className="vp-outline" aria-label="本页目录">
      <p className="vp-outline-title">本页目录</p>
      <ul>
        {items.map((item) => (
          <li key={item.id} className={cn(item.level === 2 && 'vp-outline-level-2')}>
            <a
              href={`#${item.id}`}
              className={cn(activeId === item.id && 'is-active')}
              onClick={(event) => {
                event.preventDefault()
                jump(item.id)
              }}
            >
              {item.text}
            </a>
          </li>
        ))}
      </ul>
    </aside>
  )
}
