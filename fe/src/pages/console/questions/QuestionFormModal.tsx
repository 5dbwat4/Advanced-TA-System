import { Button, Modal, useOverlayState } from '@heroui/react'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import Check from '~icons/lucide/check'
import Pen from '~icons/lucide/pen'
import Plus from '~icons/lucide/plus'
import ShoppingCart from '~icons/lucide/shopping-cart'

import { TagSelect } from '@/components/questions/TagSelect'
import { MarkdownEditor } from '@/components/ui/MarkdownEditor'
import { PendingButton } from '@/components/ui/PendingButton'
import {
  createQuestion,
  updateQuestion,
  type Question,
} from '@/lib/api'
import { getErrorMessage } from '@/lib/error'
import { useQuestionBasket } from '@/lib/question-basket'
import { invalidateQuestions } from '@/lib/query'

type QuestionFormModalProps = {
  state: ReturnType<typeof useOverlayState>
  question: Question | null
  onSaved: () => void
}

export function QuestionFormModal({
  state,
  question,
  onSaved,
}: QuestionFormModalProps) {
  const addToBasket = useQuestionBasket((store) => store.add)
  const [prompt, setPrompt] = useState('')
  const [answer, setAnswer] = useState('')
  const [tagIds, setTagIds] = useState<string[]>([])
  const [saving, setSaving] = useState(false)

  const editingId = question?.id ?? null
  const editing = question !== null

  useEffect(() => {
    if (!state.isOpen) return
    setPrompt(question?.question ?? '')
    setAnswer(question?.answer ?? '')
    setTagIds(question?.tags.map((tag) => tag.id) ?? [])
  }, [state.isOpen, question])

  const resetAndClose = () => {
    state.close()
    setPrompt('')
    setAnswer('')
    setTagIds([])
  }

  const submit = async () => {
    setSaving(true)
    try {
      const body = { question: prompt.trim(), answer: answer.trim(), tagIds }
      if (editingId) {
        await updateQuestion(editingId, body)
        toast.success('已保存修改')
      } else {
        await createQuestion(body)
        toast.success('已添加题目')
      }
      resetAndClose()
      invalidateQuestions()
      onSaved()
    } catch (error) {
      toast.error(getErrorMessage(error, editingId ? '保存失败' : '创建失败'))
    } finally {
      setSaving(false)
    }
  }

  const submitAndAddToBasket = async () => {
    setSaving(true)
    try {
      const { question: created } = await createQuestion({
        question: prompt.trim(),
        answer: answer.trim(),
        tagIds,
      })
      addToBasket({
        id: created.id,
        question: created.question,
        answer: created.answer,
        author: created.user.username ?? created.user.name,
        tags: created.tags,
      })
      toast.success('已创建题目并加入试题篮')
      resetAndClose()
      invalidateQuestions()
      onSaved()
    } catch (error) {
      toast.error(getErrorMessage(error, '创建失败'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal state={state}>
      <Modal.Backdrop>
        <Modal.Container>
          <Modal.Dialog className="sm:max-w-2xl">
            <Modal.CloseTrigger />
            <Modal.Header>
              <Modal.Icon className="bg-brand-500/10 text-brand-600 dark:text-brand-300">
                {editing ? (
                  <Pen width={18} height={18} className="shrink-0" />
                ) : (
                  <Plus width={18} height={18} className="shrink-0" />
                )}
              </Modal.Icon>
              <Modal.Heading>{editing ? '编辑题目' : '新建题目'}</Modal.Heading>
            </Modal.Header>
            <Modal.Body className="flex flex-col gap-4">
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-fg-muted">题目</label>
                <MarkdownEditor value={prompt} onChange={setPrompt} />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-fg-muted">答案</label>
                <MarkdownEditor value={answer} onChange={setAnswer} />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-fg-muted">
                  标签（可选）
                </label>
                <TagSelect value={tagIds} onChange={setTagIds} />
              </div>
            </Modal.Body>
            <Modal.Footer>
              <Button variant="secondary" onPress={resetAndClose}>
                取消
              </Button>
              <PendingButton
                isPending={saving}
                isDisabled={!prompt.trim() || !answer.trim()}
                icon={Check}
                pendingLabel="保存中"
                onPress={submit}
                className="bg-gradient-to-r from-brand-600 to-brand-700 shadow-lg shadow-brand-600/25"
              >
                {editing ? '保存修改' : '添加题目'}
              </PendingButton>
              {!editing && (
                <PendingButton
                  variant="secondary"
                  isPending={saving}
                  isDisabled={!prompt.trim() || !answer.trim()}
                  icon={ShoppingCart}
                  pendingLabel="创建中"
                  onPress={() => void submitAndAddToBasket()}
                >
                  创建题目并加入试题篮
                </PendingButton>
              )}
            </Modal.Footer>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </Modal>
  )
}
