import { Button, Modal, useOverlayState } from '@heroui/react'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'

import ClipboardList from '~icons/lucide/clipboard-list'
import Eye from '~icons/lucide/eye'
import Plus from '~icons/lucide/plus'
import { CriteriaPreview } from '@/components/criteria/CriteriaPreview'
import type { CriterionItem } from '@/components/criteria/types'
import { Card } from '@/components/ui/Card'
import { IconAction } from '@/components/ui/IconAction'
import { SkeletonList } from '@/components/ui/SkeletonList'
import {
  fetchCriteria,
  fetchCriteriaList,
  type CriteriaSummary,
} from '@/lib/api'
import { getErrorMessage } from '@/lib/error'
import { useAsyncData } from '@/lib/request'
import { useCurrentClass } from '@/lib/store'
import { cn } from '@/lib/utils'

export function CriteriaSection({
  index = 0,
  createHref = '/console/criteria/new',
}: {
  index?: number
  createHref?: string
}) {
  const navigate = useNavigate()
  const currentClass = useCurrentClass()
  const classId = currentClass?.id ?? null
  const previewState = useOverlayState()
  const { data, loading, error } = useAsyncData(() => fetchCriteriaList(), [classId])
  const [preview, setPreview] = useState<CriterionItem[]>([])
  const [previewName, setPreviewName] = useState('评分标准预览')
  const list = data?.criteria ?? []

  const openPreview = async (item: CriteriaSummary) => {
    try {
      const res = await fetchCriteria(item.key)
      setPreview(res.payload?.items ?? [])
      setPreviewName(item.name)
      previewState.open()
    } catch (error) {
      toast.error(getErrorMessage(error, '加载评分标准失败'))
    }
  }

  return (
    <>
      <Card index={index}>
        <div className="flex flex-wrap items-center gap-2">
          <ClipboardList
            width={16}
            height={16}
            className="shrink-0 text-brand-600 dark:text-brand-300"
          />
          <h2 className="text-sm font-bold">评分标准</h2>
          {data && <span className="tabular text-[11px] text-fg-subtle">共 {list.length} 项</span>}
          <div className="ms-auto flex items-center gap-2">
            <Button size="sm" variant="secondary" onPress={() => navigate('/console/criteria')}>
              管理
            </Button>
            <Button size="sm" onPress={() => navigate(createHref)}>
              <Plus width={15} height={15} className="shrink-0" />
              新建
            </Button>
          </div>
        </div>

        <div className="mt-4">
          {loading ? (
            <SkeletonList rows={3} className="h-14 rounded-xl" />
          ) : error ? (
            <p className="text-xs text-danger">{error}</p>
          ) : list.length === 0 ? (
            <p className="rounded-xl border border-dashed border-line py-6 text-center text-xs text-fg-subtle">
              暂无可见的评分标准
            </p>
          ) : (
            <div className="flex max-h-80 flex-col gap-2 overflow-auto">
              {list.map((item) => (
                <div
                  key={item.key}
                  className="flex flex-wrap items-center gap-3 rounded-xl border border-line bg-sunken/40 px-3 py-2.5"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="truncate text-sm font-semibold">{item.name}</span>
                      <span
                        className={cn(
                          'shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold',
                          item.visibility === 'public'
                            ? 'bg-brand-500/10 text-brand-600 dark:text-brand-300'
                            : 'bg-sunken text-fg-muted',
                        )}
                      >
                        {item.visibility}
                      </span>
                    </div>
                    <div className="mt-1 truncate text-[11px] text-fg-subtle">
                      {item.className ?? '未关联课程'} · {item.classId ?? '历史记录'} ·{' '}
                      {item.cardCount} 张卡片
                    </div>
                  </div>
                  <IconAction
                    label="预览"
                    variant="secondary"
                    onPress={() => void openPreview(item)}
                  >
                    <Eye width={15} height={15} className="shrink-0" />
                  </IconAction>
                </div>
              ))}
            </div>
          )}
        </div>
      </Card>

      <Modal state={previewState}>
        <Modal.Backdrop>
          <Modal.Container>
            <Modal.Dialog className="sm:max-w-3xl">
              <Modal.CloseTrigger />
              <Modal.Header>
                <Modal.Icon className="bg-brand-500/10 text-brand-600 dark:text-brand-300">
                  <ClipboardList width={18} height={18} className="shrink-0" />
                </Modal.Icon>
                <Modal.Heading>{previewName}</Modal.Heading>
              </Modal.Header>
              <Modal.Body className="min-h-[30vh]">
                <CriteriaPreview items={preview} />
              </Modal.Body>
            </Modal.Dialog>
          </Modal.Container>
        </Modal.Backdrop>
      </Modal>
    </>
  )
}
