import { Button, useOverlayState } from '@heroui/react'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { motion } from 'motion/react'
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useDebounce } from 'react-use'
import { toast } from 'sonner'
import Bot from '~icons/lucide/bot'
import NotebookText from '~icons/lucide/notebook-text'
import Plus from '~icons/lucide/plus'

import { TagFilter } from '@/components/questions/TagFilter'
import { EmptyState } from '@/components/ui/Card'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { IconAction } from '@/components/ui/IconAction'
import { SearchInput } from '@/components/ui/SearchInput'
import { SkeletonList } from '@/components/ui/SkeletonList'
import {
  deleteQuestion,
  duplicateQuestion,
  listQuestions,
  type Question,
  type Tag,
} from '@/lib/api'
import { useAuth } from '@/lib/auth'
import { getErrorMessage } from '@/lib/error'
import { invalidateQuestions } from '@/lib/query'

import { QuestionCard } from './QuestionCard'
import { QuestionFormModal } from './QuestionFormModal'
import { QuestionPagination } from './QuestionPagination'

const PAGE_SIZE = 20

export function QuestionsPanel({ tags }: { tags: Tag[] }) {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const [applied, setApplied] = useState('')
  const [tagFilter, setTagFilter] = useState<string | null>(null)
  const [page, setPage] = useState(1)
  const formState = useOverlayState()
  const [editingQuestion, setEditingQuestion] = useState<Question | null>(null)
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

  const {
    data: questionPage,
    isLoading: loading,
    isError,
    error: queryError,
  } = useQuery({
    queryKey: ['questions', 'page', applied, tagFilter ?? '', page, PAGE_SIZE],
    queryFn: () =>
      listQuestions({
        q: applied,
        tagId: tagFilter ?? undefined,
        limit: PAGE_SIZE,
        offset: (page - 1) * PAGE_SIZE,
      }),
    placeholderData: keepPreviousData,
  })

  useEffect(() => {
    if (isError) toast.error(getErrorMessage(queryError, '加载失败'))
  }, [isError, queryError])

  const items = questionPage?.questions ?? []
  const total = questionPage?.total ?? 0

  useEffect(() => {
    if (!questionPage) return
    const maxPage = Math.max(1, Math.ceil(questionPage.total / PAGE_SIZE))
    if (page > maxPage) setPage(maxPage)
  }, [page, questionPage])

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  const goToPage = (next: number) => {
    setPage(next)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const openCreate = () => {
    setEditingQuestion(null)
    formState.open()
  }

  const openEdit = (item: Question) => {
    setEditingQuestion(item)
    formState.open()
  }

  const duplicate = async (id: string) => {
    setBusyId(id)
    try {
      await duplicateQuestion(id)
      toast.success('已复制题目，你现在可以编辑副本')
      invalidateQuestions()
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
      invalidateQuestions()
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

      {tags.length > 0 && (
        <div className="mb-3">
          <TagFilter
            tags={tags}
            value={tagFilter}
            onChange={(value) => {
              setTagFilter(value)
              setPage(1)
            }}
            onOpenTag={(id) => navigate(`/console/tag/${id}/questions`)}
          />
        </div>
      )}

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
          {items.map((item, i) => (
            <motion.div
              key={item.id}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.35, delay: Math.min(i, 8) * 0.04, ease: [0.16, 1, 0.3, 1] }}
            >
              <QuestionCard
                item={item}
                isOwner={item.provider === user?.id}
                expanded={Boolean(expanded[item.id])}
                busy={busyId === item.id}
                onEdit={openEdit}
                onDuplicate={duplicate}
                onDelete={(target) => {
                  setConfirmTarget(target)
                  confirmState.open()
                }}
                onToggleAnswer={(id) =>
                  setExpanded((prev) => ({ ...prev, [id]: !prev[id] }))
                }
              />
            </motion.div>
          ))}
        </div>
      )}

      {!loading && totalPages > 1 && (
        <QuestionPagination page={page} totalPages={totalPages} onPageChange={goToPage} />
      )}

      <QuestionFormModal
        state={formState}
        question={editingQuestion}
        onSaved={() => setEditingQuestion(null)}
      />

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
