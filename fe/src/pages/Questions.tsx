import { Button, Input, Modal, Pagination, Tabs, useOverlayState } from '@heroui/react'
import copyToClipboard from 'copy-to-clipboard'
import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useState, type FormEvent } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useDebounce } from 'react-use'
import { toast } from 'sonner'

import AlertTriangle from '~icons/lucide/alert-triangle'
import Bot from '~icons/lucide/bot'
import Check from '~icons/lucide/check'
import ChevronUp from '~icons/lucide/chevron-up'
import Copy from '~icons/lucide/copy'
import Eye from '~icons/lucide/eye'
import EyeOff from '~icons/lucide/eye-off'
import Library from '~icons/lucide/library'
import NotebookText from '~icons/lucide/notebook-text'
import Pen from '~icons/lucide/pen'
import Plus from '~icons/lucide/plus'
import Settings2 from '~icons/lucide/settings-2'
import Trash2 from '~icons/lucide/trash-2'
import X from '~icons/lucide/x'
import { SetQuestionsEditor } from '@/components/questions/SetQuestionsEditor'
import { EmptyState } from '@/components/ui/Card'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { IconAction } from '@/components/ui/IconAction'
import { Markdown } from '@/components/ui/Markdown'
import { MarkdownEditor } from '@/components/ui/MarkdownEditor'
import { PageHeader } from '@/components/ui/PageHeader'
import { PendingButton } from '@/components/ui/PendingButton'
import { SearchInput } from '@/components/ui/SearchInput'
import { SkeletonList } from '@/components/ui/SkeletonList'
import {
  createBank,
  createQuestion,
  deleteBank,
  deleteQuestion,
  duplicateBank,
  duplicateQuestion,
  listBanks,
  listQuestions,
  renameBank,
  updateQuestion,
  type Question,
  type QuestionBank,
} from '@/lib/api'
import { useAuth } from '@/lib/auth'
import { getErrorMessage } from '@/lib/error'
import { useAsyncData } from '@/lib/request'

const PAGE_SIZE = 20

/** 复制文本到剪贴板并提示结果 */
async function copyText(text: string, label: string) {
  const ok = await copyToClipboard(text)
  if (ok) toast.success(`已复制${label}`)
  else toast.error('复制失败')
}

function QuestionsPanel() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [items, setItems] = useState<Question[]>([])
  const [total, setTotal] = useState(0)
  const [query, setQuery] = useState('')
  const [applied, setApplied] = useState('')
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(1)
  const [refreshKey, setRefreshKey] = useState(0)
  const formState = useOverlayState()
  const [editingId, setEditingId] = useState<string | null>(null)
  const [question, setQuestion] = useState('')
  const [answer, setAnswer] = useState('')
  const [saving, setSaving] = useState(false)
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})
  const [confirmTarget, setConfirmTarget] = useState<Question | null>(null)
  const confirmState = useOverlayState({
    onOpenChange: (open) => {
      if (!open) setConfirmTarget(null)
    },
  })
  const [busyId, setBusyId] = useState<string | null>(null)

  useDebounce(
    () => {
      setApplied(query.trim())
      setPage(1)
    },
    300,
    [query],
  )

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    const run = async () => {
      try {
        const data = await listQuestions({
          q: applied,
          limit: PAGE_SIZE,
          offset: (page - 1) * PAGE_SIZE,
        })
        if (cancelled) return
        const maxPage = Math.max(1, Math.ceil(data.total / PAGE_SIZE))
        if (page > maxPage) {
          setPage(maxPage)
          return
        }
        setItems(data.questions)
        setTotal(data.total)
      } catch (error) {
        if (!cancelled) toast.error(getErrorMessage(error, '加载失败'))
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    run()
    return () => {
      cancelled = true
    }
  }, [applied, refreshKey, page])

  const refresh = () => setRefreshKey((key) => key + 1)

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  const goToPage = (next: number) => {
    setPage(next)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const pageNumbers = (): (number | 'ellipsis')[] => {
    if (totalPages <= 7) return Array.from({ length: totalPages }, (_, i) => i + 1)
    const pages: (number | 'ellipsis')[] = [1]
    if (page > 3) pages.push('ellipsis')
    const start = Math.max(2, page - 1)
    const end = Math.min(totalPages - 1, page + 1)
    for (let i = start; i <= end; i++) pages.push(i)
    if (page < totalPages - 2) pages.push('ellipsis')
    pages.push(totalPages)
    return pages
  }

  const resetForm = () => {
    formState.close()
    setEditingId(null)
    setQuestion('')
    setAnswer('')
  }

  const openCreate = () => {
    setEditingId(null)
    setQuestion('')
    setAnswer('')
    formState.open()
  }

  const openEdit = (item: Question) => {
    setEditingId(item.id)
    setQuestion(item.question)
    setAnswer(item.answer)
    formState.open()
  }

  const submit = async () => {
    setSaving(true)
    try {
      const body = { question: question.trim(), answer: answer.trim() }
      if (editingId) {
        await updateQuestion(editingId, body)
        toast.success('已保存修改')
      } else {
        await createQuestion(body)
        toast.success('已添加题目')
      }
      resetForm()
      refresh()
    } catch (error) {
      toast.error(getErrorMessage(error, editingId ? '保存失败' : '创建失败'))
    } finally {
      setSaving(false)
    }
  }

  const duplicate = async (id: string) => {
    setBusyId(id)
    try {
      await duplicateQuestion(id)
      toast.success('已复制题目，你现在可以编辑副本')
      refresh()
    } catch (error) {
      toast.error(getErrorMessage(error, '复制失败'))
    } finally {
      setBusyId(null)
    }
  }

  const remove = async (id: string) => {
    setBusyId(id)
    try {
      await deleteQuestion(id)
      toast.success('已删除题目')
      confirmState.close()
      refresh()
    } catch (error) {
      toast.error(getErrorMessage(error, '删除失败'))
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <SearchInput
          value={query}
          onChange={setQuery}
          placeholder="搜索题目内容…"
          ariaLabel="搜索题目内容"
          className="min-w-[16rem] flex-1"
        />
        <Button variant="primary" onPress={openCreate}>
          <Plus width={16} height={16} className="shrink-0" />
          新建题目
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

      {!loading && (
        <div className="mb-3 text-xs text-fg-subtle">
          共 {total} 题{applied && `（匹配「${applied}」）`}
        </div>
      )}

      {loading ? (
        <SkeletonList rows={4} className="h-24 rounded-2xl" />
      ) : items.length === 0 ? (
        <EmptyState
          icon={NotebookText}
          title={applied ? '没有匹配的题目' : '暂无题目'}
          hint={applied ? '换个关键词试试' : '点击右上角新建题目'}
        />
      ) : (
        <div className="space-y-3">
          {items.map((item, i) => {
            const isOwner = item.provider === user?.id
            return (
              <motion.div
                key={item.id}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.35, delay: Math.min(i, 8) * 0.04, ease: [0.16, 1, 0.3, 1] }}
                className="rounded-2xl border border-line bg-elevated p-5"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-lg border border-line bg-sunken px-2 py-0.5 text-[11px] text-fg-muted">
                    {item.user.username ?? item.user.name}
                    {isOwner && (
                      <span className="ml-1 text-brand-600 dark:text-brand-300">（我）</span>
                    )}
                  </span>
                  <span className="tabular text-[11px] text-fg-subtle">
                    {new Date(item.createdAt).toLocaleDateString()}
                  </span>
                  <div className="ml-auto flex items-center gap-1">
                    {isOwner ? (
                      <IconAction label="编辑" onPress={() => openEdit(item)}>
                        <Pen width={14} height={14} className="shrink-0" />
                      </IconAction>
                    ) : (
                      <Button
                        size="sm"
                        variant="ghost"
                        isPending={busyId === item.id}
                        onPress={() => duplicate(item.id)}
                      >
                        <Copy width={14} height={14} className="shrink-0" />
                        创建副本编辑
                      </Button>
                    )}
                    {isOwner && (
                      <IconAction
                        label="删除"
                        onPress={() => {
                          setConfirmTarget(item)
                          confirmState.open()
                        }}
                      >
                        <Trash2 width={14} height={14} className="shrink-0" />
                      </IconAction>
                    )}
                  </div>
                </div>

                <div className="mt-4">
                  <Markdown source={item.question} />
                </div>

                <div className="mt-3 flex flex-wrap items-center gap-1">
                  <IconAction
                    label={expanded[item.id] ? '隐藏答案' : '显示答案'}
                    onPress={() => setExpanded((p) => ({ ...p, [item.id]: !p[item.id] }))}
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
                    <IconAction label="复制答案" onPress={() => void copyText(item.answer, '答案')}>
                      <Copy width={14} height={14} className="shrink-0" />
                    </IconAction>
                  )}
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
            )
          })}
        </div>
      )}

      {!loading && totalPages > 1 && (
        <Pagination className="mt-4 justify-center" size="sm">
          <Pagination.Content>
            <Pagination.Item>
              <Pagination.Previous isDisabled={page === 1} onPress={() => goToPage(page - 1)}>
                <Pagination.PreviousIcon />
                <span>上一页</span>
              </Pagination.Previous>
            </Pagination.Item>
            {pageNumbers().map((p, i) =>
              p === 'ellipsis' ? (
                <Pagination.Item key={`ellipsis-${i}`}>
                  <Pagination.Ellipsis />
                </Pagination.Item>
              ) : (
                <Pagination.Item key={p}>
                  <Pagination.Link isActive={p === page} onPress={() => goToPage(p)}>
                    {p}
                  </Pagination.Link>
                </Pagination.Item>
              ),
            )}
            <Pagination.Item>
              <Pagination.Next
                isDisabled={page === totalPages}
                onPress={() => goToPage(page + 1)}
              >
                <span>下一页</span>
                <Pagination.NextIcon />
              </Pagination.Next>
            </Pagination.Item>
          </Pagination.Content>
        </Pagination>
      )}

      <Modal state={formState}>
        <Modal.Backdrop>
          <Modal.Container>
            <Modal.Dialog className="sm:max-w-2xl">
              <Modal.CloseTrigger />
              <Modal.Header>
                <Modal.Icon className="bg-brand-500/10 text-brand-600 dark:text-brand-300">
                  {editingId ? (
                    <Pen width={18} height={18} className="shrink-0" />
                  ) : (
                    <Plus width={18} height={18} className="shrink-0" />
                  )}
                </Modal.Icon>
                <Modal.Heading>{editingId ? '编辑题目' : '新建题目'}</Modal.Heading>
              </Modal.Header>
              <Modal.Body className="flex flex-col gap-4">
                <div>
                  <label className="mb-1.5 block text-xs font-semibold text-fg-muted">题目</label>
                  <MarkdownEditor value={question} onChange={setQuestion} />
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-semibold text-fg-muted">答案</label>
                  <MarkdownEditor value={answer} onChange={setAnswer} />
                </div>
              </Modal.Body>
              <Modal.Footer>
                <Button variant="secondary" onPress={resetForm}>
                  取消
                </Button>
                <PendingButton
                  isPending={saving}
                  isDisabled={!question.trim() || !answer.trim()}
                  icon={Check}
                  pendingLabel="保存中"
                  onPress={submit}
                  className="bg-gradient-to-r from-brand-600 to-brand-700 shadow-lg shadow-brand-600/25"
                >
                  {editingId ? '保存修改' : '添加题目'}
                </PendingButton>
              </Modal.Footer>
            </Modal.Dialog>
          </Modal.Container>
        </Modal.Backdrop>
      </Modal>

      <ConfirmDialog
        state={confirmState}
        title="删除题目"
        description={`确定删除「${confirmTarget?.question ?? ''}」吗？此操作不可撤销。`}
        isPending={busyId !== null && busyId === confirmTarget?.id}
        onConfirm={() => confirmTarget && remove(confirmTarget.id)}
      />
    </div>
  )
}

function SetsPanel() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [creating, setCreating] = useState(false)
  const [name, setName] = useState('')
  const [saving, setSaving] = useState(false)
  const [expandedId, setExpandedId] = useState<string | null>(null)
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

  const { data, error, loading, reload } = useAsyncData(() => listBanks(), [])
  const banks = data?.banks ?? []

  useEffect(() => {
    if (error) toast.error(error)
  }, [error])

  const create = async (event: FormEvent) => {
    event.preventDefault()
    setSaving(true)
    try {
      await createBank(name.trim())
      toast.success('已创建题目集')
      setName('')
      setCreating(false)
      reload()
    } catch (error) {
      toast.error(getErrorMessage(error, '创建失败'))
    } finally {
      setSaving(false)
    }
  }

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

  return (
    <div>
      <div className="mb-4 flex items-center justify-between gap-3">
        <span className="text-xs text-fg-subtle">共 {banks.length} 个题目集</span>
        <div className="flex items-center gap-2">
          <Button
            variant={creating ? 'ghost' : 'primary'}
            onPress={() => setCreating((open) => !open)}
          >
            {creating ? (
              <X width={16} height={16} className="shrink-0" />
            ) : (
              <Plus width={16} height={16} className="shrink-0" />
            )}
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

      <AnimatePresence>
        {creating && (
          <motion.form
            key="create"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
            onSubmit={create}
            className="mb-6 flex flex-col gap-4 rounded-2xl border border-line bg-elevated p-6"
          >
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-fg-muted">题目集名称</label>
              <Input
                fullWidth
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="如：系统II 流水线题集"
                maxLength={64}
                autoFocus
                required
              />
            </div>
            <div className="flex justify-end">
              <PendingButton
                type="submit"
                isPending={saving}
                isDisabled={!name.trim()}
                icon={Check}
                pendingLabel="创建中"
                className="bg-gradient-to-r from-brand-600 to-brand-700 shadow-lg shadow-brand-600/25"
              >
                创建题目集
              </PendingButton>
            </div>
          </motion.form>
        )}
      </AnimatePresence>

      {loading ? (
        <SkeletonList rows={3} className="h-24 rounded-2xl" />
      ) : banks.length === 0 ? (
        <EmptyState icon={Library} title="暂无题目集" hint="点击右上角新建题目集" />
      ) : (
        <div className="space-y-3">
          {banks.map((bank, i) => {
            const isOwner = bank.owner.id === user?.id
            const expanded = expandedId === bank.id
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

                  <div className="ml-auto flex items-center gap-1">
                    <IconAction
                      label="重命名"
                      onPress={() => {
                        setRenamingId(bank.id)
                        setRenameValue(bank.name)
                      }}
                    >
                      <Pen width={14} height={14} className="shrink-0" />
                    </IconAction>
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
                  </div>
                </div>

                <div className="mt-3 flex items-center gap-2">
                  <Button
                    size="sm"
                    variant="secondary"
                    onPress={() => setExpandedId(expanded ? null : bank.id)}
                  >
                    {expanded ? (
                      <ChevronUp width={14} height={14} className="shrink-0" />
                    ) : (
                      <Settings2 width={14} height={14} className="shrink-0" />
                    )}
                    {expanded ? '收起' : '管理题目'}
                  </Button>
                  {!isOwner && (
                    <span className="text-[11px] text-amber-600 dark:text-amber-400">
                      非管理者编辑会影响所有使用该题目集的实验
                    </span>
                  )}
                </div>

                <AnimatePresence initial={false}>
                  {expanded && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
                      className="overflow-hidden"
                    >
                      <SetQuestionsEditor bank={bank} onSaved={reload} />
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            )
          })}
        </div>
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
        description={`确定删除「${confirmTarget?.name ?? ''}」吗？该操作不可撤销。`}
        isPending={busyId !== null && busyId === confirmTarget?.id}
        onConfirm={() => confirmTarget && remove(confirmTarget.id)}
      />
    </div>
  )
}

export default function Questions() {
  const [params, setParams] = useSearchParams()
  const tab = params.get('tab') === 'sets' ? 'sets' : 'questions'

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader title="题库" />

      <Tabs
        selectedKey={tab}
        onSelectionChange={(key) =>
          setParams(key === 'sets' ? { tab: 'sets' } : {}, { replace: true })
        }
      >
        <Tabs.ListContainer>
          <Tabs.List aria-label="题库视图" className="max-w-xs">
            <Tabs.Tab id="questions">
              题目
              <Tabs.Indicator />
            </Tabs.Tab>
            <Tabs.Tab id="sets">
              题目集
              <Tabs.Indicator />
            </Tabs.Tab>
          </Tabs.List>
        </Tabs.ListContainer>
        <Tabs.Panel id="questions" className="pt-4">
          <QuestionsPanel />
        </Tabs.Panel>
        <Tabs.Panel id="sets" className="pt-4">
          <SetsPanel />
        </Tabs.Panel>
      </Tabs>
    </div>
  )
}
