import { Button, Modal, useOverlayState } from '@heroui/react'
import copyToClipboard from 'copy-to-clipboard'
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'

import ClipboardList from '~icons/lucide/clipboard-list'
import Copy from '~icons/lucide/copy'
import Eye from '~icons/lucide/eye'
import Pencil from '~icons/lucide/pencil'
import Trash2 from '~icons/lucide/trash-2'
import { CriteriaPreview } from '@/components/criteria/CriteriaPreview'
import type { CriterionItem } from '@/components/criteria/types'
import { AvatarImage } from '@/components/ui/AvatarImage'
import { Card, EmptyState } from '@/components/ui/Card'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { IconAction } from '@/components/ui/IconAction'
import { PageHeader } from '@/components/ui/PageHeader'
import { SkeletonList } from '@/components/ui/SkeletonList'
import { UserCardTooltip } from '@/components/ui/UserCardTooltip'
import { deleteCriteria, fetchCriteria, fetchCriteriaList, type CriteriaSummary } from '@/lib/api'
import { getErrorMessage } from '@/lib/error'
import { formatDateTime } from '@/lib/format'
import { useCurrentClass } from '@/lib/store'
import { cn } from '@/lib/utils'

export default function CriteriaManage() {
  const previewState = useOverlayState()
  const confirmState = useOverlayState()
  const navigate = useNavigate()
  const currentClass = useCurrentClass()
  const classId = currentClass?.id ?? null
  const [list, setList] = useState<CriteriaSummary[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [preview, setPreview] = useState<CriterionItem[]>([])
  const [deleteTarget, setDeleteTarget] = useState<CriteriaSummary | null>(null)
  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    let cancelled = false
    setList(null)
    setLoading(true)
    fetchCriteriaList()
      .then((res) => {
        if (!cancelled) setList(res.criteria)
      })
      .catch((error) => {
        if (!cancelled) {
          setList([])
          toast.error(getErrorMessage(error, '加载失败'))
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [classId])

  const copy = async (key: string) => {
    if (await copyToClipboard(key)) toast.success('分享码已复制')
    else toast.error('复制失败，请手动复制')
  }

  const openPreview = async (key: string) => {
    try {
      const res = await fetchCriteria(key)
      const payload = res.payload as { items?: CriterionItem[] } | null
      setPreview(payload?.items ?? [])
      previewState.open()
    } catch (error) {
      toast.error(getErrorMessage(error, '加载失败'))
    }
  }

  const confirmDelete = async () => {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      await deleteCriteria(deleteTarget.key)
      setList((prev) => prev?.filter((item) => item.key !== deleteTarget.key) ?? prev)
      toast.success('已删除评分标准')
      confirmState.close()
      setDeleteTarget(null)
    } catch (error) {
      toast.error(getErrorMessage(error, '删除失败'))
    } finally {
      setDeleting(false)
    }
  }

  const privateList = list?.filter((item) => item.visibility === 'private') ?? []
  const publicList = list?.filter((item) => item.visibility === 'public') ?? []

  const renderCard = (item: CriteriaSummary, index: number) => {
    const inUse = item.usageCount > 0
    return (
      <Card key={item.key} index={index}>
        <div className="flex flex-wrap items-start gap-3">
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
              {item.canManage && (
                <span className="text-[10px] font-medium text-fg-subtle">我创建的</span>
              )}
            </div>
            <div className="mt-1 text-[11px] text-fg-subtle">
              更新于 {formatDateTime(item.updatedAt)} ·{' '}
              <span className={cn(inUse && 'text-amber-600 dark:text-amber-400')}>
                {inUse ? `使用中 ${item.usageCount} 处` : '未被使用'}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <UserCardTooltip user={item.creator} label="创建者">
              <AvatarImage
                id={item.creator.avatar}
                size={22}
                fallback={item.creator.name.slice(0, 1)}
              />
            </UserCardTooltip>
            {item.canManage && (
              <IconAction
                label="编辑"
                variant="secondary"
                onPress={() => navigate(`/console/criteria/${item.key}/edit`)}
              >
                <Pencil width={15} height={15} className="shrink-0" />
              </IconAction>
            )}
            <IconAction
              label="预览"
              variant="secondary"
              onPress={() => void openPreview(item.key)}
            >
              <Eye width={15} height={15} className="shrink-0" />
            </IconAction>
            <IconAction
              label="复制分享码"
              variant="secondary"
              onPress={() => void copy(item.key)}
            >
              <Copy width={15} height={15} className="shrink-0" />
            </IconAction>
            {item.canManage && (
              <IconAction
                label="删除"
                variant="secondary"
                isDisabled={inUse}
                tooltip={inUse ? '正被批阅使用，无法删除' : '删除'}
                onPress={() => {
                  setDeleteTarget(item)
                  confirmState.open()
                }}
              >
                <Trash2 width={15} height={15} className="shrink-0" />
              </IconAction>
            )}
          </div>
        </div>
      </Card>
    )
  }

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        title="评分标准管理"
        actions={<Button onPress={() => navigate('/console/criteria/new')}>新建评分标准</Button>}
      />

      {loading ? (
        <SkeletonList rows={3} className="h-20 rounded-2xl" />
      ) : !list || list.length === 0 ? (
        <EmptyState
          icon={ClipboardList}
          title="暂无可见的评分标准"
          hint="点击右上角新建，或在报告批改页保存评分标准"
        />
      ) : (
        <div className="flex flex-col gap-3">
          {privateList.map((item, index) => renderCard(item, index))}
          {publicList.length > 0 && (
            <>
              {privateList.length > 0 && (
                <hr className="my-2 w-1/2 self-center border-t border-line/60" />
              )}
              {publicList.map((item, index) =>
                renderCard(item, privateList.length + index),
              )}
            </>
          )}
        </div>
      )}

      <Modal state={previewState}>
        <Modal.Backdrop>
          <Modal.Container>
            <Modal.Dialog className="sm:max-w-3xl">
              <Modal.CloseTrigger />
              <Modal.Header>
                <Modal.Icon className="bg-brand-500/10 text-brand-600 dark:text-brand-300">
                  <ClipboardList width={18} height={18} className="shrink-0" />
                </Modal.Icon>
                <Modal.Heading>评分标准预览</Modal.Heading>
              </Modal.Header>
              <Modal.Body className="flex min-h-[30vh] flex-col gap-4">
                <CriteriaPreview items={preview} />
              </Modal.Body>
            </Modal.Dialog>
          </Modal.Container>
        </Modal.Backdrop>
      </Modal>

      <ConfirmDialog
        state={confirmState}
        title="删除评分标准"
        description={
          deleteTarget
            ? `确定删除该评分标准吗？分享码 ${deleteTarget.key} 将失效。`
            : '确定删除该评分标准吗？'
        }
        confirmLabel="删除"
        isPending={deleting}
        onConfirm={confirmDelete}
      />
    </div>
  )
}
