import { Button, Dropdown, Input, Label, useOverlayState } from '@heroui/react'
import { motion } from 'motion/react'
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import Bot from '~icons/lucide/bot'
import Copy from '~icons/lucide/copy'
import Ellipsis from '~icons/lucide/ellipsis'
import FileDown from '~icons/lucide/file-down'
import Library from '~icons/lucide/library'
import Pen from '~icons/lucide/pen'
import Plus from '~icons/lucide/plus'
import Settings2 from '~icons/lucide/settings-2'
import Trash2 from '~icons/lucide/trash-2'

import { TagFilter } from '@/components/questions/TagFilter'
import { TagLink } from '@/components/questions/TagLink'
import { EmptyState } from '@/components/ui/Card'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { IconAction } from '@/components/ui/IconAction'
import { SkeletonList } from '@/components/ui/SkeletonList'
import {
  deleteBank,
  duplicateBank,
  fetchBankQuestions,
  listBanks,
  renameBank,
  type QuestionBank,
  type Tag,
} from '@/lib/api'
import { useAuth } from '@/lib/auth'
import { bankFilename, bankQuestionsToMarkdown, downloadMarkdown } from '@/lib/download'
import { getErrorMessage } from '@/lib/error'
import { useAsyncData } from '@/lib/request'

import { QuestionSetRenameModal } from './QuestionSetRenameModal'

export function SetsPanel({ tags }: { tags: Tag[] }) {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const [pendingRename, setPendingRename] = useState<{ bank: QuestionBank; next: string } | null>(
    null,
  )
  const renameState = useOverlayState({
    onOpenChange: (open) => {
      if (!open) setPendingRename(null)
    },
  })
  const [confirmTarget, setConfirmTarget] = useState<QuestionBank | null>(null)
  const confirmState = useOverlayState({
    onOpenChange: (open) => {
      if (!open) setConfirmTarget(null)
    },
  })
  const [busyId, setBusyId] = useState<string | null>(null)
  const [tagFilter, setTagFilter] = useState<string | null>(null)

  const { data, error, loading, reload } = useAsyncData(
    () => listBanks({ tagId: tagFilter ?? undefined }),
    [tagFilter],
  )
  const banks = data?.banks ?? []

  useEffect(() => {
    if (error) toast.error(error)
  }, [error])

  const performRename = async (bank: QuestionBank, next: string) => {
    try {
      await renameBank(bank.id, next)
      toast.success('已重命名')
      setRenamingId(null)
      reload()
    } catch (error) {
      toast.error(getErrorMessage(error, '重命名失败'))
    }
  }

  const submitRename = async (bank: QuestionBank) => {
    if (pendingRename) return
    const next = renameValue.trim()
    if (!next || next === bank.name) {
      setRenamingId(null)
      return
    }
    const isOwner = bank.owner.id === user?.id
    if (!isOwner) {
      setPendingRename({ bank, next })
      renameState.open()
      return
    }
    await performRename(bank, next)
  }

  const confirmRename = async () => {
    if (!pendingRename) return
    const { bank, next } = pendingRename
    renameState.close()
    await performRename(bank, next)
  }

  const duplicate = async (id: string) => {
    setBusyId(id)
    try {
      await duplicateBank(id)
      toast.success('已复制题目集')
      reload()
    } catch (error) {
      toast.error(getErrorMessage(error, '复制失败'))
    } finally {
      setBusyId(null)
    }
  }

  const remove = async (id: string) => {
    setBusyId(id)
    try {
      await deleteBank(id)
      toast.success('已删除题目集')
      confirmState.close()
      reload()
    } catch (error) {
      toast.error(getErrorMessage(error, '删除失败'))
    } finally {
      setBusyId(null)
    }
  }

  const exportMarkdown = async (bank: QuestionBank) => {
    try {
      const { questions } = await fetchBankQuestions(bank.id)
      downloadMarkdown(bankFilename(bank.name), bankQuestionsToMarkdown(bank.name, questions))
      toast.success('已导出为 Markdown')
    } catch (error) {
      toast.error(getErrorMessage(error, '导出失败'))
    }
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between gap-3">
        <span className="text-xs text-fg-subtle">共 {banks.length} 个题目集</span>
        <div className="flex items-center gap-2">
          <Button variant="primary" onPress={() => navigate('/console/questions/banks/new')}>
            <Plus width={16} height={16} className="shrink-0" />
            新建题目集
          </Button>
          <IconAction
            label="连接你的 Agent"
            variant="secondary"
            size="md"
            onPress={() => navigate('/console/llm-connect')}
          >
            <Bot width={16} height={16} className="shrink-0" />
          </IconAction>
        </div>
      </div>

      {tags.length > 0 && (
        <div className="mb-3">
          <TagFilter
            tags={tags}
            value={tagFilter}
            onChange={setTagFilter}
            onOpenTag={(id) => navigate(`/console/tag/${id}/banks`)}
          />
        </div>
      )}

      {loading ? (
        <SkeletonList rows={3} className="h-24 rounded-2xl" />
      ) : banks.length === 0 ? (
        <EmptyState icon={Library} title="暂无题目集" hint="点击右上角新建题目集" />
      ) : (
        <div className="space-y-3">
          {banks.map((bank, i) => {
            const isOwner = bank.owner.id === user?.id
            return (
              <motion.div
                key={bank.id}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.35, delay: i * 0.05, ease: [0.16, 1, 0.3, 1] }}
                className="rounded-2xl border border-line bg-elevated p-5"
              >
                <div className="flex flex-wrap items-center gap-2">
                  {renamingId === bank.id ? (
                    <Input
                      className="rounded-lg border border-line bg-sunken px-2.5 py-1 text-sm font-bold outline-none focus:border-brand-500"
                      value={renameValue}
                      onChange={(e) => setRenameValue(e.target.value)}
                      maxLength={64}
                      autoFocus
                      aria-label="重命名题目集"
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') void submitRename(bank)
                        if (e.key === 'Escape') setRenamingId(null)
                      }}
                      onBlur={() => void submitRename(bank)}
                    />
                  ) : (
                    <h3 className="min-w-0 truncate text-sm font-bold">{bank.name}</h3>
                  )}

                  <span className="rounded-lg border border-line bg-sunken px-2 py-0.5 text-[11px] text-fg-muted">
                    {bank.owner.username ?? bank.owner.name}
                    {isOwner && (
                      <span className="ml-1 text-brand-600 dark:text-brand-300">（我）</span>
                    )}
                  </span>
                  <span className="tabular rounded-lg bg-brand-500/10 px-2 py-0.5 text-[11px] font-semibold text-brand-600 dark:text-brand-300">
                    {bank.questions.length} 题
                  </span>
                  <span className="tabular rounded-lg border border-line bg-sunken px-2 py-0.5 text-[11px] text-fg-muted">
                    {bank.experimentCount} 个实验使用
                  </span>
                  {bank.tags.map((tag) => (
                    <TagLink key={tag.id} tag={tag} kind="banks" />
                  ))}

                  <div className="ml-auto flex items-center gap-1">
                    <Button
                      size="sm"
                      variant="secondary"
                      onPress={() => navigate(`/console/questions/banks/${bank.id}`)}
                    >
                      <Settings2 width={14} height={14} className="shrink-0" />
                      管理题目
                    </Button>
                    <IconAction
                      label="复制"
                      isPending={busyId === bank.id}
                      onPress={() => duplicate(bank.id)}
                    >
                      <Copy width={14} height={14} className="shrink-0" />
                    </IconAction>
                    <IconAction
                      label="删除"
                      onPress={() => {
                        setConfirmTarget(bank)
                        confirmState.open()
                      }}
                    >
                      <Trash2 width={14} height={14} className="shrink-0" />
                    </IconAction>
                    <Dropdown>
                      <Button isIconOnly size="sm" variant="ghost" aria-label="更多操作">
                        <Ellipsis width={16} height={16} className="shrink-0" />
                      </Button>
                      <Dropdown.Popover>
                        <Dropdown.Menu
                          onAction={(key) => {
                            if (key === 'rename') {
                              setRenamingId(bank.id)
                              setRenameValue(bank.name)
                            } else if (key === 'export-md') {
                              void exportMarkdown(bank)
                            }
                          }}
                        >
                          <Dropdown.Item id="rename" textValue="重命名">
                            <Pen width={15} height={15} className="shrink-0 text-fg-muted" />
                            <Label>重命名</Label>
                          </Dropdown.Item>
                          <Dropdown.Item id="export-md" textValue="导出为 Markdown">
                            <FileDown width={15} height={15} className="shrink-0 text-fg-muted" />
                            <Label>导出为 Markdown</Label>
                          </Dropdown.Item>
                        </Dropdown.Menu>
                      </Dropdown.Popover>
                    </Dropdown>
                  </div>
                </div>

                {!isOwner && (
                  <p className="mt-3 text-[11px] text-amber-600 dark:text-amber-400">
                    非管理者编辑会影响所有使用该题目集的实验
                  </p>
                )}
              </motion.div>
            )
          })}
        </div>
      )}

      <QuestionSetRenameModal
        state={renameState}
        onConfirm={() => void confirmRename()}
      />

      <ConfirmDialog
        state={confirmState}
        title="删除题目集"
        description={`确定删除「${confirmTarget?.name ?? ''}」吗？该操作不可撤销。`}
        isPending={busyId !== null && busyId === confirmTarget?.id}
        onConfirm={() => confirmTarget && remove(confirmTarget.id)}
      />
    </div>
  )
}
