import { useEffect, useState } from 'react'
import { toast } from 'sonner'

import Database from '~icons/lucide/database'
import Trash2 from '~icons/lucide/trash-2'
import { clearCache, getCacheBytes } from '@/components/reportgrade/cache'
import { Card } from '@/components/ui/Card'
import { PendingButton } from '@/components/ui/PendingButton'
import { SectionHeader } from '@/components/ui/SectionHeader'
import { getErrorMessage } from '@/lib/error'
import { formatBytes } from '@/lib/format'
import { clearPageCache, getPageCacheBytes } from '@/lib/page-cache'

type CacheKind = 'reports' | 'pages'

function CacheRow({
  title,
  description,
  bytes,
  clearing,
  disabled,
  onClear,
}: {
  title: string
  description: string
  bytes: number | null
  clearing: boolean
  disabled: boolean
  onClear: () => void
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-line bg-sunken px-4 py-3">
      <div className="min-w-0 flex-1">
        <div className="text-xs font-semibold text-fg-muted">{title}</div>
        <div className="text-[11px] text-fg-subtle">{description}</div>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <span className="tabular text-sm font-semibold text-fg">
          {bytes == null ? '—' : formatBytes(bytes)}
        </span>
        <PendingButton
          size="sm"
          variant="secondary"
          isDisabled={disabled}
          isPending={clearing}
          onPress={onClear}
          icon={Trash2}
        >
          清空
        </PendingButton>
      </div>
    </div>
  )
}

export function CacheSection({ index = 0 }: { index?: number }) {
  const [reportBytes, setReportBytes] = useState<number | null>(null)
  const [pageBytes, setPageBytes] = useState<number | null>(null)
  const [clearing, setClearing] = useState<CacheKind | null>(null)

  useEffect(() => {
    let cancelled = false
    getCacheBytes()
      .then((value) => {
        if (!cancelled) setReportBytes(value)
      })
      .catch(() => {})
    getPageCacheBytes()
      .then((value) => {
        if (!cancelled) setPageBytes(value)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [])

  const clearReports = async () => {
    setClearing('reports')
    try {
      await clearCache()
      setReportBytes(0)
      toast.success('实验报告缓存已清空')
    } catch (error) {
      toast.error(getErrorMessage(error, '清空失败'))
    } finally {
      setClearing(null)
    }
  }

  const clearPages = async () => {
    setClearing('pages')
    try {
      await clearPageCache()
      setPageBytes(0)
      toast.success('页面资源缓存已清空')
    } catch (error) {
      toast.error(getErrorMessage(error, '清空失败'))
    } finally {
      setClearing(null)
    }
  }

  return (
    <Card index={index} className="flex flex-col gap-4">
      <SectionHeader icon={Database}>缓存</SectionHeader>

      <CacheRow
        title="实验报告缓存"
        description="报告批改时下载的附件会缓存在浏览器中，以加快再次打开的速度。"
        bytes={reportBytes}
        clearing={clearing === 'reports'}
        disabled={clearing !== null || reportBytes === 0}
        onClear={clearReports}
      />

      <CacheRow
        title="页面资源缓存"
        description="应用页面、脚本和样式会缓存在浏览器中，以加快再次访问和弱网加载的速度。"
        bytes={pageBytes}
        clearing={clearing === 'pages'}
        disabled={clearing !== null || pageBytes === 0}
        onClear={clearPages}
      />
    </Card>
  )
}
