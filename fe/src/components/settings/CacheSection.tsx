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

export function CacheSection({ index = 0 }: { index?: number }) {
  const [bytes, setBytes] = useState<number | null>(null)
  const [clearing, setClearing] = useState(false)

  useEffect(() => {
    let cancelled = false
    getCacheBytes()
      .then((value) => {
        if (!cancelled) setBytes(value)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [])

  const clear = async () => {
    setClearing(true)
    try {
      await clearCache()
      setBytes(0)
      toast.success('缓存已清空')
    } catch (error) {
      toast.error(getErrorMessage(error, '清空失败'))
    } finally {
      setClearing(false)
    }
  }

  return (
    <Card index={index} className="flex flex-col gap-4">
      <SectionHeader icon={Database}>缓存</SectionHeader>

      <div className="flex items-center justify-between gap-3 rounded-xl border border-line bg-sunken px-4 py-3">
        <div className="min-w-0 flex-1">
          <div className="text-xs font-semibold text-fg-muted">本地文件缓存</div>
          <div className="text-[11px] text-fg-subtle">
            报告批改时下载的附件会缓存在浏览器中，以加快再次打开的速度。
          </div>
        </div>
        <span className="tabular shrink-0 text-sm font-semibold text-fg">
          {bytes == null ? '—' : formatBytes(bytes)}
        </span>
      </div>

      <div className="flex justify-end">
        <PendingButton
          size="sm"
          variant="secondary"
          isDisabled={bytes === 0}
          isPending={clearing}
          onPress={clear}
          icon={Trash2}
        >
          清空缓存
        </PendingButton>
      </div>
    </Card>
  )
}
