import { Button } from '@heroui/react'
import { AnimatePresence, motion } from 'motion/react'
import Copy from '~icons/lucide/copy'
import Eye from '~icons/lucide/eye'
import EyeOff from '~icons/lucide/eye-off'
import Pen from '~icons/lucide/pen'
import Trash2 from '~icons/lucide/trash-2'

import { AddToBasketButton, BasketQuestionText } from '@/components/questions/AddToBasketButton'
import { TagLink } from '@/components/questions/TagLink'
import { IconAction } from '@/components/ui/IconAction'
import { Markdown } from '@/components/ui/Markdown'
import type { Question } from '@/lib/api'
import { copyText } from '@/lib/copy-text'

type QuestionCardProps = {
  item: Question
  isOwner: boolean
  expanded: boolean
  busy: boolean
  onEdit: (item: Question) => void
  onDuplicate: (id: string) => void
  onDelete: (item: Question) => void
  onToggleAnswer: (id: string) => void
}

export function QuestionCard({
  item,
  isOwner,
  expanded,
  busy,
  onEdit,
  onDuplicate,
  onDelete,
  onToggleAnswer,
}: QuestionCardProps) {
  return (
    <div className="rounded-2xl border border-line bg-elevated p-5">
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
        {item.tags.map((tag) => (
          <TagLink key={tag.id} tag={tag} />
        ))}
        <div className="ml-auto flex items-center gap-1">
          {isOwner ? (
            <IconAction label="编辑" onPress={() => onEdit(item)}>
              <Pen width={14} height={14} className="shrink-0" />
            </IconAction>
          ) : (
            <Button
              size="sm"
              variant="ghost"
              isPending={busy}
              onPress={() => onDuplicate(item.id)}
            >
              <Copy width={14} height={14} className="shrink-0" />
              创建副本编辑
            </Button>
          )}
          {isOwner && (
            <IconAction label="删除" onPress={() => onDelete(item)}>
              <Trash2 width={14} height={14} className="shrink-0" />
            </IconAction>
          )}
        </div>
      </div>

      <BasketQuestionText id={item.id} className="mt-4">
        <Markdown source={item.question} />
      </BasketQuestionText>

      <div className="mt-3 flex flex-wrap items-center gap-1">
        <IconAction
          label={expanded ? '隐藏答案' : '显示答案'}
          onPress={() => onToggleAnswer(item.id)}
        >
          {expanded ? (
            <EyeOff width={14} height={14} className="shrink-0" />
          ) : (
            <Eye width={14} height={14} className="shrink-0" />
          )}
        </IconAction>
        <IconAction label="复制题目" onPress={() => void copyText(item.question, '题目')}>
          <Copy width={14} height={14} className="shrink-0" />
        </IconAction>
        {expanded && (
          <IconAction label="复制答案" onPress={() => void copyText(item.answer, '答案')}>
            <Copy width={14} height={14} className="shrink-0" />
          </IconAction>
        )}
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
        {expanded && (
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
    </div>
  )
}
