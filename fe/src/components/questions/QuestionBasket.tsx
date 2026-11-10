import { Button, Drawer, Modal, useOverlayState } from '@heroui/react'
import { useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { toast } from 'sonner'

import Check from '~icons/lucide/check'
import NotebookText from '~icons/lucide/notebook-text'
import Pen from '~icons/lucide/pen'
import ShoppingCart from '~icons/lucide/shopping-cart'
import Trash2 from '~icons/lucide/trash-2'
import { Markdown } from '@/components/ui/Markdown'
import { MarkdownEditor } from '@/components/ui/MarkdownEditor'
import { PendingButton } from '@/components/ui/PendingButton'
import { updateQuestion } from '@/lib/api'
import { getErrorMessage } from '@/lib/error'
import { useQuestionBasket, type BasketQuestion } from '@/lib/question-basket'
import { fetchQuestionsByIds, invalidateQuestions } from '@/lib/query'

export function QuestionBasket() {
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const items = useQuestionBasket((state) => state.items)
  const remove = useQuestionBasket((state) => state.remove)
  const updateItem = useQuestionBasket((state) => state.update)
  const state = useOverlayState()
  const [selectedIds, setSelectedIds] = useState<string[]>([])

  const detailState = useOverlayState()
  const [detailId, setDetailId] = useState<string | null>(null)
  const [showAnswer, setShowAnswer] = useState(false)
  const [editing, setEditing] = useState(false)
  const [editQuestion, setEditQuestion] = useState('')
  const [editAnswer, setEditAnswer] = useState('')
  const [saving, setSaving] = useState(false)

  const visible =
    pathname.startsWith('/console/questions') || pathname.startsWith('/console/tag')
  if (!visible) return null

  const detail = detailId ? (items.find((item) => item.id === detailId) ?? null) : null
  const allSelected = items.length > 0 && selectedIds.length === items.length

  const openBasket = () => {
    setSelectedIds(items.map((item) => item.id))
    state.open()

    const missing = items.filter(
      (item) => item.author === undefined || item.tags === undefined,
    )
    if (missing.length > 0) {
      void fetchQuestionsByIds(missing.map((item) => item.id))
        .then((questions) => {
          for (const question of questions) {
            updateItem({
              id: question.id,
              question: question.question,
              answer: question.answer,
              author: question.user.username ?? question.user.name,
              tags: question.tags,
            })
          }
        })
        .catch(() => {})
    }
  }

  const openDetail = (item: BasketQuestion) => {
    setDetailId(item.id)
    setShowAnswer(false)
    setEditing(false)
    setEditQuestion(item.question)
    setEditAnswer(item.answer)
    detailState.open()
  }

  const startEdit = () => {
    if (!detail) return
    setEditQuestion(detail.question)
    setEditAnswer(detail.answer)
    setEditing(true)
  }

  const saveEdit = async () => {
    if (!detail) return
    setSaving(true)
    try {
      const res = await updateQuestion(detail.id, {
        question: editQuestion.trim(),
        answer: editAnswer.trim(),
      })
      updateItem({
        id: detail.id,
        question: res.question.question,
        answer: res.question.answer,
      })
      toast.success('已保存修改')
      invalidateQuestions()
      setEditing(false)
    } catch (error) {
      toast.error(getErrorMessage(error, '保存失败'))
    } finally {
      setSaving(false)
    }
  }

  const toggleOne = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((value) => value !== id) : [...prev, id],
    )
  }

  const toggleAll = () => {
    setSelectedIds(allSelected ? [] : items.map((item) => item.id))
  }

  const removeSelected = () => {
    selectedIds.forEach((id) => remove(id))
    setSelectedIds([])
  }

  const goCreate = () => {
    if (selectedIds.length === 0) return
    state.close()
    navigate(`/console/questions/banks/new?from=basket&questionIds=${selectedIds.join(',')}`)
  }

  return (
    <>
      <button
        type="button"
        onClick={openBasket}
        aria-label={`试题篮（${items.length}）`}
        className="fixed right-0 top-1/2 z-30 flex -translate-y-1/2 flex-col items-center gap-2 rounded-l-2xl border border-r-0 border-line bg-elevated px-3 py-4 shadow-lg transition-colors hover:bg-sunken"
      >
        <span className="relative">
          <ShoppingCart width={26} height={26} className="text-brand-600 dark:text-brand-300" />
          <span className="absolute -right-2.5 -top-2 flex h-5 min-w-5 items-center justify-center rounded-full bg-danger px-1 text-[10px] font-bold text-white">
            {items.length}
          </span>
        </span>
        <span className="text-xs font-medium leading-tight tracking-widest text-fg-muted [writing-mode:vertical-rl]">
          试题篮
        </span>
      </button>

      <Drawer.Backdrop isOpen={state.isOpen} onOpenChange={state.setOpen}>
        <Drawer.Content placement="right">
          <Drawer.Dialog className="flex h-full w-[min(52rem,100vw)] max-w-none flex-col">
            <Drawer.CloseTrigger />
            <Drawer.Header className="border-b border-line">
              <div className="flex items-baseline gap-3">
                <Drawer.Heading>试题篮</Drawer.Heading>
                <span className="text-sm text-fg-subtle">共 {items.length} 道</span>
              </div>
            </Drawer.Header>

            <Drawer.Body className="flex flex-1 flex-col gap-4 overflow-y-auto">
              {items.length === 0 ? (
                <p className="py-16 text-center text-sm text-fg-subtle">试题篮为空</p>
              ) : (
                items.map((item) => {
                  const checked = selectedIds.includes(item.id)
                  return (
                    <div
                      key={item.id}
                      className="group flex items-start gap-3 rounded-2xl border border-line bg-elevated p-4"
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleOne(item.id)}
                        aria-label="选择题目"
                        className="mt-1 h-4 w-4 shrink-0 accent-brand-600"
                      />
                      <div
                        className="min-w-0 flex-1 cursor-pointer"
                        onClick={() => openDetail(item)}
                      >
                        <Markdown source={item.question} />
                        <div className="flex max-h-0 flex-wrap items-center gap-1.5 overflow-hidden opacity-0 transition-all duration-200 group-hover:mt-2 group-hover:max-h-24 group-hover:opacity-100">
                          {item.author && (
                            <span className="rounded-md border border-line bg-sunken px-1.5 py-0.5 text-[11px] text-fg-muted">
                              命题人 · {item.author}
                            </span>
                          )}
                          {item.tags?.map((tag) => (
                            <span
                              key={tag.id}
                              className="rounded-md bg-brand-500/10 px-1.5 py-0.5 text-[11px] text-brand-600 dark:text-brand-300"
                            >
                              {tag.name}
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>
                  )
                })
              )}
            </Drawer.Body>

            <Drawer.Footer className="border-t border-line">
              <label className="flex cursor-pointer items-center gap-2 text-sm text-fg-muted">
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={toggleAll}
                  className="h-4 w-4 accent-brand-600"
                />
                全选
              </label>
              <span className="text-sm text-fg-subtle">已选 {selectedIds.length} 题</span>
              <div className="ml-auto flex items-center gap-2">
                <Button
                  variant="secondary"
                  isDisabled={selectedIds.length === 0}
                  onPress={removeSelected}
                >
                  <Trash2 width={14} height={14} className="shrink-0" />
                  删除
                </Button>
                <Button
                  variant="primary"
                  isDisabled={selectedIds.length === 0}
                  onPress={goCreate}
                >
                  去组卷
                </Button>
              </div>
            </Drawer.Footer>
          </Drawer.Dialog>
        </Drawer.Content>
      </Drawer.Backdrop>

      <Modal state={detailState}>
        <Modal.Backdrop>
          <Modal.Container>
            <Modal.Dialog className="sm:max-w-3xl">
              <Modal.CloseTrigger />
              <Modal.Header>
                <Modal.Icon className="bg-brand-500/10 text-brand-600 dark:text-brand-300">
                  <NotebookText width={18} height={18} className="shrink-0" />
                </Modal.Icon>
                <Modal.Heading>试题详情</Modal.Heading>
              </Modal.Header>

              <Modal.Body className="flex max-h-[70vh] flex-col gap-4 overflow-y-auto">
                {detail && editing ? (
                  <>
                    <div>
                      <label className="mb-1.5 block text-xs font-semibold text-fg-muted">
                        题目
                      </label>
                      <MarkdownEditor value={editQuestion} onChange={setEditQuestion} />
                    </div>
                    <div>
                      <label className="mb-1.5 block text-xs font-semibold text-fg-muted">
                        答案
                      </label>
                      <MarkdownEditor value={editAnswer} onChange={setEditAnswer} />
                    </div>
                  </>
                ) : detail ? (
                  <>
                    <Markdown source={detail.question} />
                    <div className="flex items-center gap-2">
                      <Button
                        size="sm"
                        variant="secondary"
                        onPress={() => setShowAnswer((prev) => !prev)}
                      >
                        {showAnswer ? '隐藏答案' : '查看答案'}
                      </Button>
                      <Button size="sm" variant="primary" onPress={startEdit}>
                        <Pen width={14} height={14} className="shrink-0" />
                        编辑
                      </Button>
                    </div>
                    {showAnswer && (
                      <div className="rounded-xl bg-sunken p-4">
                        <Markdown source={detail.answer} />
                      </div>
                    )}
                  </>
                ) : (
                  <p className="py-10 text-center text-sm text-fg-subtle">题目不存在</p>
                )}
              </Modal.Body>

              <Modal.Footer>
                {editing ? (
                  <>
                    <Button variant="secondary" onPress={() => setEditing(false)}>
                      取消
                    </Button>
                    <PendingButton
                      isPending={saving}
                      isDisabled={!editQuestion.trim() || !editAnswer.trim()}
                      icon={Check}
                      pendingLabel="保存中"
                      onPress={() => void saveEdit()}
                    >
                      保存
                    </PendingButton>
                  </>
                ) : (
                  <>
                    <Button variant="secondary" onPress={() => detailState.close()}>
                      关闭
                    </Button>
                  </>
                )}
              </Modal.Footer>
            </Modal.Dialog>
          </Modal.Container>
        </Modal.Backdrop>
      </Modal>
    </>
  )
}
