import { Button, Modal, Tabs, useOverlayState } from '@heroui/react'
import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useState } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { toast } from 'sonner'

import Check from '~icons/lucide/check'
import Eye from '~icons/lucide/eye'
import EyeOff from '~icons/lucide/eye-off'
import Library from '~icons/lucide/library'
import NotebookText from '~icons/lucide/notebook-text'
import Plus from '~icons/lucide/plus'
import Settings2 from '~icons/lucide/settings-2'
import ShoppingCart from '~icons/lucide/shopping-cart'
import Tags from '~icons/lucide/tags'
import { AddToBasketButton, BasketQuestionText } from '@/components/questions/AddToBasketButton'
import { TagLink } from '@/components/questions/TagLink'
import { TagSelect } from '@/components/questions/TagSelect'
import { EmptyState } from '@/components/ui/Card'
import { IconAction } from '@/components/ui/IconAction'
import { Markdown } from '@/components/ui/Markdown'
import { MarkdownEditor } from '@/components/ui/MarkdownEditor'
import { PendingButton } from '@/components/ui/PendingButton'
import { SkeletonList } from '@/components/ui/SkeletonList'
import {
  createQuestion,
  getTag,
  listBanks,
  type Question,
  type QuestionBank,
} from '@/lib/api'
import { getErrorMessage } from '@/lib/error'
import { useQuestionBasket } from '@/lib/question-basket'
import { fetchAllQuestionsByTag, invalidateQuestions } from '@/lib/query'
import { useAsyncData } from '@/lib/request'

export default function TagDetail() {
  const { id } = useParams<{ id: string }>()
  const location = useLocation()
  const navigate = useNavigate()
  const addToBasket = useQuestionBasket((state) => state.add)
  const showBanks = location.pathname.endsWith('/banks')
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})
  const formState = useOverlayState()
  const [questionText, setQuestionText] = useState('')
  const [answerText, setAnswerText] = useState('')
  const [tagIds, setTagIds] = useState<string[]>([])
  const [saving, setSaving] = useState(false)

  const { data: tag } = useAsyncData(async () => {
    if (!id) return null
    const res = await getTag(id)
    return res.tag
  }, [id])

  const { data, error, loading, reload } = useAsyncData(async () => {
    if (!id) return { questions: [] as Question[], banks: [] as QuestionBank[] }
    if (showBanks) {
      const res = await listBanks({ tagId: id })
      return { questions: [] as Question[], banks: res.banks }
    }

    const questions = await fetchAllQuestionsByTag(id)
    return { questions, banks: [] as QuestionBank[] }
  }, [id, showBanks])

  useEffect(() => {
    if (error) toast.error(error)
  }, [error])

  const questions = data?.questions ?? []
  const banks = data?.banks ?? []

  const goTab = (key: string) => {
    if (!id) return
    navigate(`/console/tag/${id}/${key}`)
  }

  const openCreate = () => {
    if (showBanks) {
      if (id) navigate(`/console/questions/banks/new?tagId=${id}`)
      return
    }
    setQuestionText('')
    setAnswerText('')
    setTagIds(id ? [id] : [])
    formState.open()
  }

  const submitQuestion = async () => {
    if (!id) return
    setSaving(true)
    try {
      await createQuestion({
        question: questionText.trim(),
        answer: answerText.trim(),
        tagIds,
      })
      toast.success('已添加题目')
      formState.close()
      reload()
      invalidateQuestions()
    } catch (err) {
      toast.error(getErrorMessage(err, '创建失败'))
    } finally {
      setSaving(false)
    }
  }

  const submitQuestionAndAdd = async () => {
    if (!id) return
    setSaving(true)
    try {
      const { question: created } = await createQuestion({
        question: questionText.trim(),
        answer: answerText.trim(),
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
      formState.close()
      reload()
      invalidateQuestions()
    } catch (err) {
      toast.error(getErrorMessage(err, '创建失败'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="mx-auto max-w-4xl">
      <Tabs selectedKey={showBanks ? 'banks' : 'questions'} onSelectionChange={goTab}>
        <div className="mb-3 flex flex-wrap items-center gap-3">
          <span className="inline-flex items-center gap-2 rounded-2xl bg-brand-500/10 px-4 py-2 text-xl font-bold tracking-tight text-brand-600 dark:text-brand-300">
            <Tags width={18} height={18} className="shrink-0" />
            {tag?.name ?? '标签'}
          </span>
          <Tabs.ListContainer className="flex-1">
            <Tabs.List aria-label="标签内容" className="w-full whitespace-nowrap">
              <Tabs.Tab id="questions">
                题目
                <Tabs.Indicator />
              </Tabs.Tab>
              <Tabs.Tab id="banks">
                题目集
                <Tabs.Indicator />
              </Tabs.Tab>
            </Tabs.List>
          </Tabs.ListContainer>
        </div>

        <div className="mb-3 flex items-center justify-between gap-3">
          <span className="tabular text-xs text-fg-subtle">
            {showBanks ? `有 ${banks.length} 个题目集` : `有 ${questions.length} 题`}
          </span>
          <Button variant="primary" size="sm" onPress={openCreate}>
            <Plus width={14} height={14} className="shrink-0" />
            {showBanks ? '新增题目集' : '新增题目'}
          </Button>
        </div>

        <Tabs.Panel id="questions" className="pt-0">
          {loading ? (
            <SkeletonList rows={4} className="h-24 rounded-2xl" />
          ) : questions.length === 0 ? (
            <EmptyState
              icon={NotebookText}
              title="该标签下暂无题目"
              hint="可在题目编辑时为题目绑定标签"
            />
          ) : (
            <div className="space-y-3">
              {questions.map((item, i) => (
                <motion.div
                  key={item.id}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{
                    duration: 0.35,
                    delay: Math.min(i, 8) * 0.04,
                    ease: [0.16, 1, 0.3, 1],
                  }}
                  className="rounded-2xl border border-line bg-elevated p-5"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-lg border border-line bg-sunken px-2 py-0.5 text-[11px] text-fg-muted">
                      {item.user.username ?? item.user.name}
                    </span>
                    <span className="tabular text-[11px] text-fg-subtle">
                      {new Date(item.createdAt).toLocaleDateString()}
                    </span>
                    {item.tags.map((itemTag) => (
                      <TagLink key={itemTag.id} tag={itemTag} />
                    ))}
                  </div>

                  <BasketQuestionText id={item.id} className="mt-4">
                    <Markdown source={item.question} />
                  </BasketQuestionText>

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
                    <span className="ml-auto">
                      <AddToBasketButton
                        question={{
                          id: item.id,
                          question: item.question,
                          answer: item.answer,
                          author: item.user.username ?? item.user.name,
                          tags: item.tags,
                        }}
                      />
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
        </Tabs.Panel>

        <Tabs.Panel id="banks" className="pt-0">
          {loading ? (
            <SkeletonList rows={3} className="h-20 rounded-2xl" />
          ) : banks.length === 0 ? (
            <EmptyState
              icon={Library}
              title="该标签下暂无题目集"
              hint="可在新建或编辑题目集时为其绑定标签"
            />
          ) : (
            <div className="space-y-3">
              {banks.map((bank) => (
                <div key={bank.id} className="rounded-2xl border border-line bg-elevated p-5">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="min-w-0 truncate text-sm font-bold">{bank.name}</h3>
                    <span className="rounded-lg border border-line bg-sunken px-2 py-0.5 text-[11px] text-fg-muted">
                      {bank.owner.username ?? bank.owner.name}
                    </span>
                    <span className="tabular rounded-lg bg-brand-500/10 px-2 py-0.5 text-[11px] font-semibold text-brand-600 dark:text-brand-300">
                      {bank.questions.length} 题
                    </span>
                    <span className="tabular rounded-lg border border-line bg-sunken px-2 py-0.5 text-[11px] text-fg-muted">
                      {bank.experimentCount} 个实验使用
                    </span>
                    {bank.tags.map((itemTag) => (
                      <TagLink key={itemTag.id} tag={itemTag} kind="banks" />
                    ))}
                    <div className="ml-auto">
                      <Button
                        size="sm"
                        variant="secondary"
                        onPress={() => navigate(`/console/questions/banks/${bank.id}`)}
                      >
                        <Settings2 width={14} height={14} className="shrink-0" />
                        查看题目集
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Tabs.Panel>
      </Tabs>

      <Modal state={formState}>
        <Modal.Backdrop>
          <Modal.Container>
            <Modal.Dialog className="sm:max-w-2xl">
              <Modal.CloseTrigger />
              <Modal.Header>
                <Modal.Icon className="bg-brand-500/10 text-brand-600 dark:text-brand-300">
                  <Plus width={18} height={18} className="shrink-0" />
                </Modal.Icon>
                <Modal.Heading>新增题目</Modal.Heading>
              </Modal.Header>
              <Modal.Body className="flex flex-col gap-4">
                <div>
                  <label className="mb-1.5 block text-xs font-semibold text-fg-muted">题目</label>
                  <MarkdownEditor value={questionText} onChange={setQuestionText} />
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-semibold text-fg-muted">答案</label>
                  <MarkdownEditor value={answerText} onChange={setAnswerText} />
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-semibold text-fg-muted">
                    标签（可选）
                  </label>
                  <TagSelect value={tagIds} onChange={setTagIds} />
                </div>
              </Modal.Body>
              <Modal.Footer>
                <Button variant="secondary" onPress={() => formState.close()}>
                  取消
                </Button>
                <PendingButton
                  isPending={saving}
                  isDisabled={!questionText.trim() || !answerText.trim()}
                  icon={Check}
                  pendingLabel="保存中"
                  onPress={() => void submitQuestion()}
                >
                  添加题目
                </PendingButton>
                <PendingButton
                  variant="secondary"
                  isPending={saving}
                  isDisabled={!questionText.trim() || !answerText.trim()}
                  icon={ShoppingCart}
                  pendingLabel="创建中"
                  onPress={() => void submitQuestionAndAdd()}
                >
                  创建题目并加入试题篮
                </PendingButton>
              </Modal.Footer>
            </Modal.Dialog>
          </Modal.Container>
        </Modal.Backdrop>
      </Modal>
    </div>
  )
}
