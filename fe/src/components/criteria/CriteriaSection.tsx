import { Button, Modal, useOverlayState } from '@heroui/react'
import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'

import ClipboardList from '~icons/lucide/clipboard-list'
import Plus from '~icons/lucide/plus'
import { CriteriaPreview } from '@/components/criteria/CriteriaPreview'
import { CriteriaRow } from '@/components/criteria/CriteriaRow'
import type { CriterionItem } from '@/components/criteria/types'
import { Card } from '@/components/ui/Card'
import { SkeletonList } from '@/components/ui/SkeletonList'
import {
  fetchCriteria,
  fetchCriteriaList,
  type CriteriaSummary,
} from '@/lib/api'
import { getErrorMessage } from '@/lib/error'
import { useAsyncData } from '@/lib/request'
import { useCurrentClass } from '@/lib/store'

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
  const [expanded, setExpanded] = useState(false)
  const list = useMemo(
    () =>
      (data?.criteria ?? []).filter(
        (item) => item.classId === classId && item.visibility === 'private',
      ),
    [data, classId],
  )
  const visibleList = expanded ? list : list.slice(0, 5)

  useEffect(() => {
    setExpanded(false)
  }, [classId])

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
              查看全部
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
            <div className="flex flex-col gap-2">
              {visibleList.map((item) => (
                <CriteriaRow key={item.key} item={item} onView={openPreview} />
              ))}
              {!expanded && list.length > 5 && (
                <Button
                  size="sm"
                  variant="secondary"
                  className="self-center"
                  onPress={() => setExpanded(true)}
                >
                  查看更多
                </Button>
              )}
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
