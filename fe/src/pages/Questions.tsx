import { Button, Input, Skeleton, Spinner, Tabs } from '@heroui/react'
import { AnimatePresence, motion } from 'motion/react'
import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { toast } from 'sonner'

import { SetQuestionsEditor } from '@/components/questions/SetQuestionsEditor'
import { EmptyState } from '@/components/ui/Card'
import { Icon } from '@/components/ui/Icon'
import { Markdown } from '@/components/ui/Markdown'
import { MarkdownEditor } from '@/components/ui/MarkdownEditor'
import { PageHeader } from '@/components/ui/PageHeader'
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

const PAGE_SIZE = 20

function QuestionsPanel() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [items, setItems] = useState<Question[]>([])
  const [total, setTotal] = useState(0)
  const [query, setQuery] = useState('')
  const [applied, setApplied] = useState('')
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [refreshKey, setRefreshKey] = useState(0)
  const [formOpen, setFormOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [question, setQuestion] = useState('')
  const [answer, setAnswer] = useState('')
  const [saving, setSaving] = useState(false)
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})
  const [confirmingId, setConfirmingId] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

  useEffect(() => {
    const timer = setTimeout(() => setApplied(query.trim()), 300)
    return () => clearTimeout(timer)
  }, [query])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    const run = async () => {
      try {
        const data = await listQuestions({ q: applied, limit: PAGE_SIZE })
        if (cancelled) return
        setItems(data.questions)
        setTotal(data.total)
      } catch (error) {
        if (!cancelled) toast.error(error instanceof Error ? error.message : '加载失败')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    run()
    return () => {
      cancelled = true
    }
  }, [applied, refreshKey])

  const refresh = () => setRefreshKey((key) => key + 1)

  const loadMore = async () => {
    setLoadingMore(true)
    try {
      const data = await listQuestions({ q: applied, limit: PAGE_SIZE, offset: items.length })
      setItems((prev) => [...prev, ...data.questions])
      setTotal(data.total)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '加载失败')
    } finally {
      setLoadingMore(false)
    }
  }

  const resetForm = () => {
    setFormOpen(false)
    setEditingId(null)
    setQuestion('')
    setAnswer('')
  }

  const openCreate = () => {
    setEditingId(null)
    setQuestion('')
    setAnswer('')
    setFormOpen(true)
  }

  const openEdit = (item: Question) => {
    setEditingId(item.id)
    setQuestion(item.question)
    setAnswer(item.answer)
    setFormOpen(true)
  }

  const submit = async (event: FormEvent) => {
    event.preventDefault()
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
      toast.error(error instanceof Error ? error.message : editingId ? '保存失败' : '创建失败')
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
      toast.error(error instanceof Error ? error.message : '复制失败')
    } finally {
      setBusyId(null)
    }
  }

  const remove = async (id: string) => {
    setBusyId(id)
    try {
      await deleteQuestion(id)
      toast.success('已删除题目')
      setConfirmingId(null)
      refresh()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '删除失败')
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="relative min-w-[16rem] flex-1">
          <Icon
            icon="lucide:search"
            width={15}
            className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-fg-subtle"
          />
          <Input
            fullWidth
            className="pl-10"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="搜索题目内容…"
            aria-label="搜索题目内容"
          />
        </div>
        <Button
          variant={formOpen ? 'ghost' : 'primary'}
          onPress={() => (formOpen ? resetForm() : openCreate())}
        >
          <Icon icon={formOpen ? 'lucide:x' : 'lucide:plus'} width={16} />
          新建题目
        </Button>
        <Button
          isIconOnly
          variant="secondary"
          aria-label="连接你的Agent"
          onPress={() => navigate('/console/llm-connect')}
        >
          <Icon icon="lucide:bot" width={16} />
        </Button>
      </div>

      <AnimatePresence>
        {formOpen && (
          <motion.form
            key="form"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
            onSubmit={submit}
            className="mb-6 flex flex-col gap-4 rounded-2xl border border-line bg-elevated p-6"
          >
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-fg-muted">题目</label>
              <MarkdownEditor value={question} onChange={setQuestion} />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-fg-muted">答案</label>
              <MarkdownEditor value={answer} onChange={setAnswer} />
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" onPress={resetForm}>
                取消
              </Button>
              <Button
                type="submit"
                isPending={saving}
                isDisabled={!question.trim() || !answer.trim()}
                className="bg-gradient-to-r from-brand-600 to-brand-700 shadow-lg shadow-brand-600/25"
              >
                {({ isPending }) => (
                  <>
                    {isPending ? (
                      <Spinner color="current" size="sm" />
                    ) : (
                      <Icon icon="lucide:check" width={16} />
                    )}
                    {isPending ? '保存中' : editingId ? '保存修改' : '添加题目'}
                  </>
                )}
              </Button>
            </div>
          </motion.form>
        )}
      </AnimatePresence>

      {!loading && (
        <div className="mb-3 text-xs text-fg-subtle">
          共 {total} 题{applied && `（匹配「${applied}」）`}
        </div>
      )}

      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-2xl" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <EmptyState
          icon="lucide:notebook-text"
          title={applied ? '没有匹配的题目' : '暂无题目'}
          hint={applied ? '换个关键词试试' : '点击右上角新建题目'}
        />
      ) : (
        <div className="space-y-3" onClick={() => setConfirmingId(null)}>
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
                  <div
                    className="ml-auto flex items-center gap-1"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {isOwner ? (
                      <Button size="sm" variant="ghost" onPress={() => openEdit(item)}>
                        <Icon icon="lucide:pen" width={14} />
                        编辑
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        variant="ghost"
                        isPending={busyId === item.id}
                        onPress={() => duplicate(item.id)}
                      >
                        <Icon icon="lucide:copy" width={14} />
                        复制并编辑
                      </Button>
                    )}
                    {isOwner &&
                      (confirmingId === item.id ? (
                        <>
                          <Button
                            size="sm"
                            variant="danger-soft"
                            isPending={busyId === item.id}
                            onPress={() => remove(item.id)}
                          >
                            {({ isPending }) => (
                              <>
                                {isPending ? (
                                  <Spinner color="current" size="sm" />
                                ) : (
                                  <Icon icon="lucide:trash-2" width={14} />
                                )}
                                确认删除
                              </>
                            )}
                          </Button>
                          <Button size="sm" variant="ghost" onPress={() => setConfirmingId(null)}>
                            取消
                          </Button>
                        </>
                      ) : (
                        <Button size="sm" variant="ghost" onPress={() => setConfirmingId(item.id)}>
                          <Icon icon="lucide:trash-2" width={14} />
                          删除
                        </Button>
                      ))}
                  </div>
                </div>

                <div className="mt-4">
                  <Markdown source={item.question} />
                </div>

                <div className="mt-3">
                  <Button size="sm" variant="ghost" onPress={() => setExpanded((p) => ({ ...p, [item.id]: !p[item.id] }))}>
                    <Icon icon={expanded[item.id] ? 'lucide:eye-off' : 'lucide:eye'} width={14} />
                    {expanded[item.id] ? '隐藏答案' : '显示答案'}
                  </Button>
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

      {!loading && items.length < total && (
        <div className="mt-4 flex justify-center">
          <Button variant="secondary" isPending={loadingMore} onPress={loadMore}>
            <Icon icon="lucide:chevron-down" width={15} />
            加载更多（{items.length}/{total}）
          </Button>
        </div>
      )}
    </div>
  )
}

function SetsPanel() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [banks, setBanks] = useState<QuestionBank[]>([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [name, setName] = useState('')
  const [saving, setSaving] = useState(false)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const [confirmingId, setConfirmingId] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

  const reload = useCallback(async () => {
    try {
      const data = await listBanks()
      setBanks(data.banks)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '加载失败')
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    const run = async () => {
      try {
        const data = await listBanks()
        if (cancelled) return
        setBanks(data.banks)
      } catch (error) {
        if (!cancelled) toast.error(error instanceof Error ? error.message : '加载失败')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    run()
    return () => {
      cancelled = true
    }
  }, [])

  const create = async (event: FormEvent) => {
    event.preventDefault()
    setSaving(true)
    try {
      await createBank(name.trim())
      toast.success('已创建题目集')
      setName('')
      setCreating(false)
      await reload()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '创建失败')
    } finally {
      setSaving(false)
    }
  }

  const submitRename = async (bank: QuestionBank) => {
    const next = renameValue.trim()
    if (!next || next === bank.name) {
      setRenamingId(null)
      return
    }
    const isOwner = bank.owner.id === user?.id
    if (!isOwner && !window.confirm('你不是该题目集的管理者，修改会影响所有使用它的实验。确定继续？')) {
      return
    }
    try {
      await renameBank(bank.id, next)
      toast.success('已重命名')
      setRenamingId(null)
      await reload()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '重命名失败')
    }
  }

  const duplicate = async (id: string) => {
    setBusyId(id)
    try {
      await duplicateBank(id)
      toast.success('已复制题目集')
      await reload()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '复制失败')
    } finally {
      setBusyId(null)
    }
  }

  const remove = async (id: string) => {
    setBusyId(id)
    try {
      await deleteBank(id)
      toast.success('已删除题目集')
      setConfirmingId(null)
      await reload()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '删除失败')
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
            <Icon icon={creating ? 'lucide:x' : 'lucide:plus'} width={16} />
            新建题目集
          </Button>
          <Button
            isIconOnly
            variant="secondary"
            aria-label="连接你的Agent"
            onPress={() => navigate('/console/llm-connect')}
          >
            <Icon icon="lucide:bot" width={16} />
          </Button>
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
              <Button
                type="submit"
                isPending={saving}
                isDisabled={!name.trim()}
                className="bg-gradient-to-r from-brand-600 to-brand-700 shadow-lg shadow-brand-600/25"
              >
                {({ isPending }) => (
                  <>
                    {isPending ? (
                      <Spinner color="current" size="sm" />
                    ) : (
                      <Icon icon="lucide:check" width={16} />
                    )}
                    {isPending ? '创建中' : '创建题目集'}
                  </>
                )}
              </Button>
            </div>
          </motion.form>
        )}
      </AnimatePresence>

      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-2xl" />
          ))}
        </div>
      ) : banks.length === 0 ? (
        <EmptyState icon="lucide:library" title="暂无题目集" hint="点击右上角新建题目集" />
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
                    <Button
                      size="sm"
                      variant="ghost"
                      onPress={() => {
                        setRenamingId(bank.id)
                        setRenameValue(bank.name)
                      }}
                    >
                      <Icon icon="lucide:pen" width={14} />
                      重命名
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      isPending={busyId === bank.id}
                      onPress={() => duplicate(bank.id)}
                    >
                      <Icon icon="lucide:copy" width={14} />
                      复制
                    </Button>
                    {confirmingId === bank.id ? (
                      <>
                        <Button
                          size="sm"
                          variant="danger-soft"
                          isPending={busyId === bank.id}
                          onPress={() => remove(bank.id)}
                        >
                          {({ isPending }) => (
                            <>
                              {isPending ? (
                                <Spinner color="current" size="sm" />
                              ) : (
                                <Icon icon="lucide:trash-2" width={14} />
                              )}
                              确认删除
                            </>
                          )}
                        </Button>
                        <Button size="sm" variant="ghost" onPress={() => setConfirmingId(null)}>
                          取消
                        </Button>
                      </>
                    ) : (
                      <Button size="sm" variant="ghost" onPress={() => setConfirmingId(bank.id)}>
                        <Icon icon="lucide:trash-2" width={14} />
                        删除
                      </Button>
                    )}
                  </div>
                </div>

                <div className="mt-3 flex items-center gap-2">
                  <Button
                    size="sm"
                    variant="secondary"
                    onPress={() => setExpandedId(expanded ? null : bank.id)}
                  >
                    <Icon icon={expanded ? 'lucide:chevron-up' : 'lucide:settings-2'} width={14} />
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
