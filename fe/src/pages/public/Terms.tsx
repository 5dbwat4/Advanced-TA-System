import { Link } from 'react-router-dom'

import ArrowLeft from '~icons/lucide/arrow-left'
import { Markdown } from '@/components/ui/Markdown'
import { ThemeToggle } from '@/components/ui/ThemeToggle'
import { TERMS_MARKDOWN } from '@/content/terms'

export default function Terms() {
  return (
    <div className="mx-auto max-w-3xl px-6 py-12">
      <div className="flex items-center justify-between gap-4">
        <Link
          to="/login"
          className="inline-flex items-center gap-2 text-sm font-medium text-fg-muted transition-colors hover:text-fg"
        >
          <ArrowLeft width={16} height={16} className="shrink-0" />
          返回
        </Link>
        <ThemeToggle />
      </div>

      <header className="mt-8">
        <h1 className="text-2xl font-bold tracking-tight md:text-3xl">隐私政策与使用条款</h1>
        <p className="mt-1 text-sm text-fg-muted">Privacy &amp; Terms</p>
      </header>

      <div className="mt-6 rounded-2xl border border-line bg-elevated p-6 md:p-8">
        <Markdown source={TERMS_MARKDOWN} />
      </div>

      <p className="mt-6 text-center text-xs text-fg-subtle">生效日期：2026-09-23</p>
    </div>
  )
}
