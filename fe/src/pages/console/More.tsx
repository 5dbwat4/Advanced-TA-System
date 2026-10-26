import { ListBox } from '@heroui/react'
import { useLocation, useNavigate } from 'react-router-dom'

import ChevronRight from '~icons/lucide/chevron-right'
import { Card } from '@/components/ui/Card'
import { PageHeader } from '@/components/ui/PageHeader'
import { NAV_ITEMS, isNavItemActive } from '@/lib/nav'
import { cn } from '@/lib/utils'

export default function More() {
  const navigate = useNavigate()
  const { pathname } = useLocation()

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title="更多" />

      <Card index={0} className="p-2 sm:p-3">
        <ListBox
          aria-label="全部功能"
          selectionMode="none"
          className="w-full"
          onAction={(key) => navigate(String(key))}
        >
          {NAV_ITEMS.map((item) => {
            const active = isNavItemActive(item, pathname)
            return (
              <ListBox.Item
                key={item.to}
                id={item.to}
                textValue={item.label}
                className={cn(
                  'flex cursor-pointer items-center gap-3 rounded-xl px-3 py-3 transition-colors',
                  active ? 'bg-brand-500/10 ring-1 ring-brand-500/25' : 'hover:bg-sunken/60',
                )}
              >
                <span
                  className={cn(
                    'flex h-10 w-10 shrink-0 items-center justify-center rounded-xl',
                    active
                      ? 'bg-gradient-to-br from-brand-500 to-brand-700 text-white shadow-lg shadow-brand-500/25'
                      : 'bg-gradient-to-br from-brand-500/15 to-amber-500/10 text-brand-600 dark:text-brand-300',
                  )}
                >
                  <item.icon width={18} height={18} className="shrink-0" />
                </span>
                <span className="flex min-w-0 flex-1 flex-col">
                  <span
                    className={cn(
                      'text-sm font-semibold',
                      active ? 'text-brand-600 dark:text-brand-300' : 'text-fg',
                    )}
                  >
                    {item.label}
                  </span>
                  <span className="truncate text-xs text-fg-subtle">{item.description}</span>
                </span>
                <ChevronRight width={16} height={16} className="ms-auto shrink-0 text-fg-subtle" />
              </ListBox.Item>
            )
          })}
        </ListBox>
      </Card>
    </div>
  )
}
