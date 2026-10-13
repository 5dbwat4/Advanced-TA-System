import { Button, Dropdown, Input, Label, Modal, Skeleton, useOverlayState } from '@heroui/react'
import copyToClipboard from 'copy-to-clipboard'
import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { toast } from 'sonner'

import AlertTriangle from '~icons/lucide/alert-triangle'
import Copy from '~icons/lucide/copy'
import Ellipsis from '~icons/lucide/ellipsis'
import Eye from '~icons/lucide/eye'
import EyeOff from '~icons/lucide/eye-off'
import FileDown from '~icons/lucide/file-down'
import NotebookText from '~icons/lucide/notebook-text'
import Pen from '~icons/lucide/pen'
import Settings2 from '~icons/lucide/settings-2'
import Trash2 from '~icons/lucide/trash-2'
import X from '~icons/lucide/x'
import { BackLink } from '@/components/ui/BackLink'
import { EmptyState } from '@/components/ui/Card'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { IconAction } from '@/components/ui/IconAction'
import { Markdown } from '@/components/ui/Markdown'
import { PageHeader } from '@/components/ui/PageHeader'
import {
  deleteBank,
  duplicateBank,
  fetchBankQuestions,
  listBanks,
  removeBankQuestions,
  renameBank,
  type Question,
  type QuestionBank,
} from '@/lib/api'
import { useAuth } from '@/lib/auth'
import { bankFilename, bankQuestionsToMarkdown, downloadMarkdown } from '@/lib/download'
import { getErrorMessage } from '@/lib/error'
import { useAsyncData } from '@/lib/request'

async function copyText(text: string, label: string) {
  const ok = await copyToClipboard(text)
  if (ok) toast.success(`已复制${label}`)
  else toast.error('复制失败')
}

export default function BankDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { user } = useAuth()

  const [renaming, setRenaming] = useState(false)
  const [renameValue, setRenameValue] = useState('')
  const [busy, setBusy] = useState(false)
  const [pendingRename, setPendingRename] = useState<string | null>(null)
  const renameState = useOverlayState({
    onOpenChange: (open) => {
      if (!open) setPendingRename(null)
    },
  })
  const confirmState = useOverlayState()
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})
  const [removingId, setRemovingId] = useState<string | null>(null)

  const { data, error, loading, reload } = useAsyncData(
    async () => {
      if (!id) return { bank: null as QuestionBank | null, questions: [] as Question[] }
      const [bankRes, questionRes] = await Promise.all([listBanks(), fetchBankQuestions(id)])
      return {
        bank: bankRes.banks.find((item) => item.id === id) ?? null,
        questions: questionRes.questions,
      }
    },
    [id],
  )

  useEffect(() => {
    if (error) toast.error(error)
  }, [error])

  const bank = data?.bank ?? null
  const questions = data?.questions ?? []
  const isOwner = bank != null && bank.owner.id === user?.id

  const performRename = async (next: string) => {
    if (!bank) return
    try {
      await renameBank(bank.id, next)
      toast.success('已重命名')
      setRenaming(false)
      setPendingRename(null)
      renameState.close()
      reload()
    } catch (err) {
      toast.error(getErrorMessage(err, '重命名失败'))
    }
  }

  const submitRename = async () => {
    if (!bank || pendingRename) return
    const next = renameValue.trim()
    if (!next || next === bank.name) {
      setRenaming(false)
      return
    }
    if (!isOwner) {
      setPendingRename(next)
      renameState.open()
      return
    }
    await performRename(next)
  }

  const confirmRename = async () => {
    if (!pendingRename) return
    renameState.close()
    await performRename(pendingRename)
  }

  const exportMarkdown = async () => {
    if (!bank) return
    try {
      const res = await fetchBankQuestions(bank.id)
      downloadMarkdown(bankFilename(bank.name), bankQuestionsToMarkdown(bank.name, res.questions))
      toast.success('已导出为 Markdown')
    } catch (err) {
      toast.error(getErrorMessage(err, '导出失败'))
    }
  }

  const duplicate = async () => {
    if (!bank) return
    setBusy(true)
    try {
      const { bank: copy } = await duplicateBank(bank.id)
      toast.success('已复制题目集')
      navigate(`/console/questions/banks/${copy.id}`)
    } catch (err) {
      toast.error(getErrorMessage(err, '复制失败'))
    } finally {
      setBusy(false)
    }
  }

  const remove = async () => {
    if (!bank) return
    setBusy(true)
    try {
      await deleteBank(bank.id)
      toast.success('已删除题目集')
      confirmState.close()
      navigate('/console/questions?tab=sets')
    } catch (err) {
      toast.error(getErrorMessage(err, '删除失败'))
    } finally {
      setBusy(false)
    }
  }

  const removeQuestion = async (questionId: string) => {
    if (!bank) return
    setRemovingId(questionId)
    try {
      await removeBankQuestions(bank.id, [questionId])
      toast.success('已从题目集中移除')
      reload()
    } catch (err) {
      toast.error(getErrorMessage(err, '移除失败'))
    } finally {
      setRemovingId(null)
    }
  }

  return (
    <div className="mx-auto max-w-4xl">
      <BackLink to="/console/questions?tab=sets">返回题库</BackLink>

      {loading ? (
        <div className="space-y-3">
          <Skeleton className="h-16 rounded-2xl" />
          <Skeleton className="h-24 rounded-2xl" />
        </div>
      ) : !bank ? (
        <EmptyState icon={NotebookText} title="题目集不存在" hint="它可能已被删除" />
      ) : (
        <>
          <PageHeader
            title={bank.name}
            actions={
              <>
                <Button
                  size="sm"
                  variant="primary"
                  onPress={() => navigate(`/console/questions/banks/${bank.id}/manage`)}
                >
                  <Settings2 width={15} height={15} className="shrink-0" />
                  管理题目
                </Button>
                <Dropdown>
                  <Button isIconOnly size="sm" variant="secondary" aria-label="更多操作">
                    <Ellipsis width={16} height={16} className="shrink-0" />
                  </Button>
                  <Dropdown.Popover>
                    <Dropdown.Menu
                      onAction={(key) => {
                        if (key === 'rename') {
                          setRenameValue(bank.name)
                          setRenaming(true)
                        } else if (key === 'export-md') void exportMarkdown()
                        else if (key === 'duplicate') void duplicate()
                        else if (key === 'delete') confirmState.open()
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
                      <Dropdown.Item id="duplicate" textValue="复制">
                        <Copy width={15} height={15} className="shrink-0 text-fg-muted" />
                        <Label>复制</Label>
                      </Dropdown.Item>
                      <Dropdown.Item id="delete" textValue="删除">
                        <Trash2 width={15} height={15} className="shrink-0 text-fg-muted" />
                        <Label>删除</Label>
                      </Dropdown.Item>
                    </Dropdown.Menu>
                  </Dropdown.Popover>
                </Dropdown>
              </>
            }
          />

          <div className="mb-4 flex flex-wrap items-center gap-2">
            {renaming ? (
              <Input
                className="max-w-xs"
                value={renameValue}
                onChange={(event) => setRenameValue(event.target.value)}
                maxLength={64}
                autoFocus
                aria-label="重命名题目集"
                onKeyDown={(event) => {
                  if (event.key === 'Enter') void submitRename()
                  if (event.key === 'Escape') setRenaming(false)
                }}
                onBlur={() => void submitRename()}
              />
            ) : (
              <>
                <span className="rounded-lg border border-line bg-sunken px-2 py-0.5 text-[11px] text-fg-muted">
                  {bank.owner.username ?? bank.owner.name}
                  {isOwner && <span className="ml-1 text-brand-600 dark:text-brand-300">（我）</span>}
                </span>
                <span className="tabular rounded-lg bg-brand-500/10 px-2 py-0.5 text-[11px] font-semibold text-brand-600 dark:text-brand-300">
                  {questions.length} 题
                </span>
                <span className="tabular rounded-lg border border-line bg-sunken px-2 py-0.5 text-[11px] text-fg-muted">
                  {bank.experimentCount} 个实验使用
                </span>
              </>
            )}
          </div>

          {!isOwner && (
            <p className="mb-4 text-[11px] text-amber-600 dark:text-amber-400">
              非管理者编辑会影响所有使用该题目集的实验
            </p>
          )}

          <div className="mb-2 text-xs font-semibold text-fg-muted">题目（{questions.length}）</div>

          {questions.length === 0 ? (
            <EmptyState icon={NotebookText} title="题目集为空" hint="点击「管理题目」添加题目" />
          ) : (
            <div className="space-y-3">
              {questions.map((item, index) => (
                <motion.div
                  key={item.id}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{
                    duration: 0.35,
                    delay: Math.min(index, 8) * 0.04,
                    ease: [0.16, 1, 0.3, 1],
                  }}
                  className="rounded-2xl border border-line bg-elevated p-5"
                >
                  <div className="flex items-center gap-2 text-[11px] text-fg-subtle">
                    <span className="tabular">#{index + 1}</span>
                    <span>{item.user.username ?? item.user.name}</span>
                  </div>

                  <div className="mt-3">
                    <Markdown source={item.question} />
                  </div>

                  <div className="mt-3 flex flex-wrap items-center gap-1">
                    <IconAction
                      label={expanded[item.id] ? '隐藏答案' : '显示答案'}
                      onPress={() =>
                        setExpanded((prev) => ({ ...prev, [item.id]: !prev[item.id] }))
                      }
                    >
                      {expanded[item.id] ? (
                        <EyeOff width={14} height={14} className="shrink-0" />
                      ) : (
                        <Eye width={14} height={14} className="shrink-0" />
                      )}
                    </IconAction>
                    <IconAction label="复制题目" onPress={() => void copyText(item.question, '题目')}>
                      <Copy width={14} height={14} className="shrink-0" />
                    </IconAction>
                    {expanded[item.id] && (
                      <IconAction
                        label="复制答案"
                        onPress={() => void copyText(item.answer, '答案')}
                      >
                        <Copy width={14} height={14} className="shrink-0" />
                      </IconAction>
                    )}
                    <span className="ml-auto">
                      <IconAction
                        label="从题目集中移除"
                        variant="danger-soft"
                        isPending={removingId === item.id}
                        onPress={() => void removeQuestion(item.id)}
                      >
                        <X width={14} height={14} className="shrink-0" />
                      </IconAction>
                    </span>
                  </div>

                  <AnimatePresence initial={false}>
                    {expanded[item.id] && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
                        className="overflow-hidden"
                      >
                        <div className="mt-2 rounded-xl bg-sunken p-4">
                          <Markdown source={item.answer} />
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.div>
              ))}
            </div>
          )}
        </>
      )}

      <Modal state={renameState}>
        <Modal.Backdrop>
          <Modal.Container>
            <Modal.Dialog className="sm:max-w-md">
              <Modal.CloseTrigger />
              <Modal.Header>
                <Modal.Icon className="bg-amber-500/10 text-amber-600 dark:text-amber-400">
                  <AlertTriangle width={18} height={18} className="shrink-0" />
                </Modal.Icon>
                <Modal.Heading>重命名题目集</Modal.Heading>
              </Modal.Header>
              <Modal.Body>
                <p className="text-sm text-fg-muted">
                  你不是该题目集的管理者，修改会影响所有使用它的实验。确定继续吗？
                </p>
              </Modal.Body>
              <Modal.Footer>
                <Button slot="close" variant="secondary">
                  取消
                </Button>
                <Button variant="primary" onPress={() => void confirmRename()}>
                  确定继续
                </Button>
              </Modal.Footer>
            </Modal.Dialog>
          </Modal.Container>
        </Modal.Backdrop>
      </Modal>

      <ConfirmDialog
        state={confirmState}
        title="删除题目集"
        description={`确定删除「${bank?.name ?? ''}」吗？该操作不可撤销。`}
        isPending={busy}
        onConfirm={() => void remove()}
      />
    </div>
  )
}
