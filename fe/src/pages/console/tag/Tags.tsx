import { Button, Input, useOverlayState } from '@heroui/react'
import { useEffect, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'

import Library from '~icons/lucide/library'
import NotebookText from '~icons/lucide/notebook-text'
import Pen from '~icons/lucide/pen'
import Plus from '~icons/lucide/plus'
import TagsIcon from '~icons/lucide/tags'
import Trash2 from '~icons/lucide/trash-2'
import { BackLink } from '@/components/ui/BackLink'
import { EmptyState } from '@/components/ui/Card'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { IconAction } from '@/components/ui/IconAction'
import { PageHeader } from '@/components/ui/PageHeader'
import { PendingButton } from '@/components/ui/PendingButton'
import { SkeletonList } from '@/components/ui/SkeletonList'
import { createTag, deleteTag, listTags, renameTag, type Tag } from '@/lib/api'
import { getErrorMessage } from '@/lib/error'
import { formatDateTime } from '@/lib/format'
import { useAsyncData } from '@/lib/request'

export default function Tags() {
  const navigate = useNavigate()
  const { data, error, loading, reload } = useAsyncData(() => listTags(), [])
  const tags = data?.tags ?? []

  const [name, setName] = useState('')
  const [creating, setCreating] = useState(false)
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const [busyId, setBusyId] = useState<string | null>(null)
  const [confirmTarget, setConfirmTarget] = useState<Tag | null>(null)
  const confirmState = useOverlayState({
    onOpenChange: (open) => {
      if (!open) setConfirmTarget(null)
    },
  })

  useEffect(() => {
    if (error) toast.error(error)
  }, [error])

  const create = async (event: FormEvent) => {
    event.preventDefault()
    const next = name.trim()
    if (!next) return
    setCreating(true)
    try {
      await createTag(next)
      toast.success('已创建标签')
      setName('')
      reload()
    } catch (err) {
      toast.error(getErrorMessage(err, '创建失败'))
    } finally {
      setCreating(false)
    }
  }

  const startRename = (tag: Tag) => {
    setRenamingId(tag.id)
    setRenameValue(tag.name)
  }

  const submitRename = async (tag: Tag) => {
    const next = renameValue.trim()
    if (!next || next === tag.name) {
      setRenamingId(null)
      return
    }
    setBusyId(tag.id)
    try {
      await renameTag(tag.id, next)
      toast.success('已重命名')
      setRenamingId(null)
      reload()
    } catch (err) {
      toast.error(getErrorMessage(err, '重命名失败'))
    } finally {
      setBusyId(null)
    }
  }

  const remove = async () => {
    if (!confirmTarget) return
    setBusyId(confirmTarget.id)
    try {
      await deleteTag(confirmTarget.id)
      toast.success('已删除标签')
      confirmState.close()
      reload()
    } catch (err) {
      toast.error(getErrorMessage(err, '删除失败'))
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="mx-auto max-w-4xl">
      <BackLink to="/console/questions">返回题库</BackLink>

      <PageHeader title="标签管理" />

      <form
        onSubmit={create}
        className="mb-5 flex flex-wrap items-end gap-2 rounded-2xl border border-line bg-elevated p-5"
      >
        <div className="min-w-[12rem] flex-1">
          <label className="mb-1.5 block text-xs font-semibold text-fg-muted">新建标签</label>
          <Input
            fullWidth
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="如：流水线"
            maxLength={32}
            aria-label="标签名称"
          />
        </div>
        <PendingButton
          type="submit"
          isPending={creating}
          isDisabled={!name.trim()}
          icon={Plus}
          pendingLabel="创建中"
        >
          添加
        </PendingButton>
      </form>

      {loading ? (
        <SkeletonList rows={3} className="h-20 rounded-2xl" />
      ) : tags.length === 0 ? (
        <EmptyState icon={TagsIcon} title="暂无标签" hint="在上方输入名称创建第一个标签" />
      ) : (
        <div className="space-y-2">
          {tags.map((tag) => (
            <div
              key={tag.id}
              className="flex flex-wrap items-center gap-2 rounded-2xl border border-line bg-elevated px-5 py-4"
            >
              {renamingId === tag.id ? (
                <Input
                  className="max-w-[14rem]"
                  value={renameValue}
                  onChange={(event) => setRenameValue(event.target.value)}
                  maxLength={32}
                  autoFocus
                  aria-label="重命名标签"
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') void submitRename(tag)
                    if (event.key === 'Escape') setRenamingId(null)
                  }}
                  onBlur={() => void submitRename(tag)}
                />
              ) : (
                <span className="inline-flex min-w-0 items-center gap-1.5 text-sm font-bold">
                  <TagsIcon width={15} height={15} className="shrink-0 text-fg-muted" />
                  <span className="truncate">{tag.name}</span>
                </span>
              )}

              <span className="tabular rounded-lg bg-brand-500/10 px-2 py-0.5 text-[11px] font-semibold text-brand-600 dark:text-brand-300">
                题目 {tag.questionCount}
              </span>
              <span className="tabular rounded-lg border border-line bg-sunken px-2 py-0.5 text-[11px] text-fg-muted">
                题目集 {tag.bankCount}
              </span>
              <span className="tabular text-[11px] text-fg-subtle">
                创建于 {formatDateTime(tag.createdAt)}
              </span>

              <div className="ml-auto flex items-center gap-1">
                <Button
                  size="sm"
                  variant="secondary"
                  onPress={() => navigate(`/console/tag/${tag.id}/questions`)}
                >
                  <NotebookText width={14} height={14} className="shrink-0" />
                  题目
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  onPress={() => navigate(`/console/tag/${tag.id}/banks`)}
                >
                  <Library width={14} height={14} className="shrink-0" />
                  题目集
                </Button>
                <IconAction label="重命名" onPress={() => startRename(tag)}>
                  <Pen width={14} height={14} className="shrink-0" />
                </IconAction>
                <IconAction
                  label="删除"
                  variant="danger-soft"
                  isPending={busyId === tag.id}
                  onPress={() => {
                    setConfirmTarget(tag)
                    confirmState.open()
                  }}
                >
                  <Trash2 width={14} height={14} className="shrink-0" />
                </IconAction>
              </div>
            </div>
          ))}
        </div>
      )}

      <ConfirmDialog
        state={confirmState}
        title="删除标签"
        description={`确定删除「${confirmTarget?.name ?? ''}」吗？该标签会从所有题目和题目集上移除。`}
        isPending={busyId !== null && busyId === confirmTarget?.id}
        onConfirm={() => void remove()}
      />
    </div>
  )
}
