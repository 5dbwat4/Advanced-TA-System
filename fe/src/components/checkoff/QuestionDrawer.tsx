import { Button, Spinner } from '@heroui/react'
import { AnimatePresence, motion } from 'motion/react'
import { useRef, useState } from 'react'
import { useTimeoutFn } from 'react-use'

import ArrowRight from '~icons/lucide/arrow-right'
import Check from '~icons/lucide/check'
import ChevronLeft from '~icons/lucide/chevron-left'
import ChevronRight from '~icons/lucide/chevron-right'
import Dices from '~icons/lucide/dices'
import Eye from '~icons/lucide/eye'
import EyeOff from '~icons/lucide/eye-off'
import HelpCircle from '~icons/lucide/help-circle'
import Minus from '~icons/lucide/minus'
import Shuffle from '~icons/lucide/shuffle'
import SkipForward from '~icons/lucide/skip-forward'
import X from '~icons/lucide/x'
import { Markdown } from '@/components/ui/Markdown'
import type { CheckoffQuestion, CheckoffStudent } from '@/lib/api'
import type { IconComponent } from '@/lib/icon'
import { cn } from '@/lib/utils'

export type QuestionMark = 'correct' | 'partial' | 'wrong'

const MARK_META: Record<
  QuestionMark,
  { icon: IconComponent; label: string; className: string; activeClass: string }
> = {
  correct: {
    icon: Check,
    label: '对',
    className: 'border-line text-fg-muted hover:border-emerald-500/50 hover:text-emerald-500',
    activeClass: 'border-emerald-500 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
  },
  partial: {
    icon: Minus,
    label: '半对',
    className: 'border-line text-fg-muted hover:border-amber-500/50 hover:text-amber-500',
    activeClass: 'border-amber-500 bg-amber-500/10 text-amber-600 dark:text-amber-400',
  },
  wrong: {
    icon: X,
    label: '错',
    className: 'border-line text-fg-muted hover:border-red-500/50 hover:text-red-500',
    activeClass: 'border-red-500 bg-red-500/10 text-red-600 dark:text-red-400',
  },
}

function shuffle<T>(items: T[]): T[] {
  const copy = [...items]
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[copy[i], copy[j]] = [copy[j], copy[i]]
  }
  return copy
}

function MarkButtons({
  id,
  marks,
  onMark,
}: {
  id: string
  marks: Record<string, QuestionMark | undefined>
  onMark: (id: string, mark: QuestionMark) => void
}) {
  return (
    <div className="flex gap-2">
      {(Object.keys(MARK_META) as QuestionMark[]).map((mark) => {
        const meta = MARK_META[mark]
        const active = marks[id] === mark
        return (
          <motion.button
            key={mark}
            type="button"
            whileTap={{ scale: 0.92 }}
            onClick={() => onMark(id, mark)}
            className={cn(
              'flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-semibold transition-all',
              active ? meta.activeClass : meta.className,
            )}
          >
            <meta.icon width={13} height={13} className="shrink-0" />
            {meta.label}
          </motion.button>
        )
      })}
    </div>
  )
}

function AnswerReveal({
  questionId,
  answer,
  revealed,
  onToggle,
}: {
  questionId: string
  answer: string
  revealed: Record<string, boolean>
  onToggle: (id: string) => void
}) {
  return (
    <div className="flex flex-col gap-2">
      <Button size="sm" variant="ghost" onPress={() => onToggle(questionId)}>
        {revealed[questionId] ? (
          <EyeOff width={14} height={14} className="shrink-0" />
        ) : (
          <Eye width={14} height={14} className="shrink-0" />
        )}
        {revealed[questionId] ? '隐藏答案' : '显示答案'}
      </Button>
      <AnimatePresence initial={false}>
        {revealed[questionId] && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
            className="overflow-hidden"
          >
            <div className="rounded-xl bg-sunken p-4">
              <Markdown source={answer} />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

export function QuestionDrawer({
  mode,
  questions,
  drawn,
  onDrawnChange,
  marks,
  onMark,
  onNext,
  onSkip,
  student,
  loading = false,
  questionIndex = 0,
  onQuestionIndex,
  showPager = false,
  drawCount = 3,
}: {
  mode: 'random' | 'fixed'
  questions: CheckoffQuestion[]
  drawn: CheckoffQuestion[]
  onDrawnChange: (drawn: CheckoffQuestion[]) => void
  marks: Record<string, QuestionMark | undefined>
  onMark: (id: string, mark: QuestionMark) => void
  onNext: () => void
  onSkip: () => void
  student: CheckoffStudent
  loading?: boolean
  questionIndex?: number
  onQuestionIndex?: (index: number) => void
  showPager?: boolean
  drawCount?: number
}) {
  const [drawing, setDrawing] = useState(false)
  const [revealed, setRevealed] = useState<Record<string, boolean>>({})
  const drawArmed = useRef(false)

  const [, , scheduleDraw] = useTimeoutFn(() => {
    if (!drawArmed.current) return
    drawArmed.current = false
    const count = Math.min(drawCount, questions.length)
    onDrawnChange(shuffle(questions).slice(0, count))
    setDrawing(false)
  }, 600)

  const toggleReveal = (id: string) => setRevealed((prev) => ({ ...prev, [id]: !prev[id] }))

  const draw = () => {
    if (questions.length === 0) return
    setDrawing(true)
    drawArmed.current = true
    scheduleDraw()
  }

  const toggleFixed = (question: CheckoffQuestion) => {
    if (drawn.some((item) => item.id === question.id)) {
      onDrawnChange(drawn.filter((item) => item.id !== question.id))
    } else {
      onDrawnChange([...drawn, question])
    }
  }

  const goToQuestion = onQuestionIndex

  const pager =
    showPager && drawn.length > 0 && goToQuestion ? (
      <div className="flex items-center gap-1.5">
        <Button
          isIconOnly
          size="sm"
          variant="ghost"
          isDisabled={questionIndex === 0}
          onPress={() => goToQuestion(Math.max(0, questionIndex - 1))}
          aria-label="上一题"
        >
          <ChevronLeft width={15} height={15} className="shrink-0" />
        </Button>
        <div className="flex gap-1.5">
          {drawn.map((question, i) => (
            <button
              key={question.id}
              type="button"
              onClick={() => goToQuestion(i)}
              className={cn(
                'h-2 rounded-full transition-all duration-300',
                i === questionIndex ? 'w-6 bg-brand-500' : 'w-2 bg-line hover:bg-fg-subtle',
              )}
              aria-label={`第 ${i + 1} 题`}
            />
          ))}
        </div>
        <Button
          isIconOnly
          size="sm"
          variant="ghost"
          isDisabled={questionIndex >= drawn.length - 1}
          onPress={() => goToQuestion(Math.min(drawn.length - 1, questionIndex + 1))}
          aria-label="下一题"
        >
          <ChevronRight width={15} height={15} className="shrink-0" />
        </Button>
      </div>
    ) : null

  const footer = (
    <div className="mt-5 flex items-center justify-between gap-3">
      <Button size="sm" variant="ghost" onPress={onSkip}>
        <SkipForward width={14} height={14} className="shrink-0" />
        跳过抽题
      </Button>
      <Button
        size="lg"
        onPress={onNext}
        className="bg-gradient-to-r from-brand-600 to-brand-700 shadow-lg shadow-brand-600/25"
      >
        录入成绩
        <ArrowRight width={16} height={16} className="shrink-0" />
      </Button>
    </div>
  )

  return (
    <div>
      <div className="mb-4 flex items-center gap-3 rounded-2xl border border-line bg-elevated px-4 py-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-500/10 text-sm font-bold text-brand-600 dark:text-brand-300">
          {student.name.slice(0, 1)}
        </div>
        <div className="min-w-0 flex-1">
          <span className="font-semibold text-fg">{student.name}</span>
          <span className="tabular ml-2 text-xs text-fg-muted">{student.studentNo}</span>
        </div>
        <span className="rounded-lg border border-line bg-sunken px-2.5 py-1 text-[11px] font-semibold text-fg-muted">
          {drawn.length} 题
        </span>
      </div>

      {loading ? (
        <div className="flex h-56 items-center justify-center">
          <Spinner size="lg" />
        </div>
      ) : questions.length === 0 ? (
        <>
          <div className="rounded-2xl border border-dashed border-line p-12 text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-sunken text-fg-subtle">
              <HelpCircle width={20} height={20} className="shrink-0" />
            </div>
            <div className="mt-3 text-sm font-semibold text-fg">该实验暂无题目</div>
            <div className="mt-1 text-xs text-fg-subtle">可跳过抽题，直接录入成绩</div>
          </div>
          {footer}
        </>
      ) : mode === 'random' ? (
        drawn.length === 0 ? (
          <div>
            <motion.button
              type="button"
              onClick={draw}
              whileHover={{ scale: 1.01 }}
              whileTap={{ scale: 0.98 }}
              className="flex w-full flex-col items-center gap-4 rounded-3xl border-2 border-dashed border-line py-16 transition-colors hover:border-brand-500/40 hover:bg-brand-500/5"
            >
              <motion.div
                animate={drawing ? { rotate: [0, -8, 8, -8, 0], scale: [1, 1.1, 1] } : {}}
                transition={{ duration: 0.6, repeat: drawing ? Infinity : 0 }}
                className="rounded-2xl bg-gradient-to-br from-brand-500 to-brand-700 p-4 text-white shadow-lg shadow-brand-600/30"
              >
                <Dices width={28} height={28} className="shrink-0" />
              </motion.div>
              <span className="text-sm font-semibold text-fg-muted">
                {drawing ? '抽取中…' : '现场抽题'}
              </span>
            </motion.button>
            {footer}
          </div>
        ) : (
          <>
            <div className="space-y-3">
              <AnimatePresence mode="popLayout">
                {drawn.map((question, i) => (
                  <motion.div
                    key={question.id}
                    layout
                    initial={{ opacity: 0, y: 24, rotateX: -30 }}
                    animate={{ opacity: 1, y: 0, rotateX: 0 }}
                    exit={{ opacity: 0, y: -16 }}
                    transition={{ duration: 0.5, delay: i * 0.12, ease: [0.16, 1, 0.3, 1] }}
                    className={cn(
                      'rounded-2xl border border-line bg-elevated p-5',
                      showPager && i === questionIndex && 'border-brand-500 ring-2 ring-brand-500/40',
                    )}
                    style={{ transformPerspective: 800 }}
                  >
                    <div className="flex items-start gap-3">
                      <span className="tabular mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-gradient-to-br from-brand-500/15 to-amber-500/10 text-xs font-bold text-brand-600 dark:text-brand-300">
                        {i + 1}
                      </span>
                      <div className="min-w-0 flex-1 text-sm leading-relaxed text-fg">
                        <Markdown source={question.question} />
                      </div>
                    </div>
                    <div className="mt-4 flex flex-wrap items-center gap-2 pl-9">
                      <MarkButtons id={question.id} marks={marks} onMark={onMark} />
                    </div>
                    <div className="mt-3 pl-9">
                      <AnswerReveal
                        questionId={question.id}
                        answer={question.answer}
                        revealed={revealed}
                        onToggle={toggleReveal}
                      />
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>

            <div className={cn('mt-4 flex', pager ? 'items-center justify-between' : 'justify-end')}>
              {pager}
              <Button variant="ghost" size="sm" isPending={drawing} onPress={draw}>
                <Shuffle width={14} height={14} className="shrink-0" />
                重新抽题
              </Button>
            </div>
          </>
        )
      ) : (
        <>
          <div className="space-y-2">
            {questions.map((question) => {
              const selectedIndex = drawn.findIndex((item) => item.id === question.id)
              const selected = selectedIndex >= 0
              return (
                <div
                  key={question.id}
                  className={cn(
                    'rounded-2xl border p-4 transition-colors',
                    selected ? 'border-brand-500/50 bg-brand-500/5' : 'border-line bg-elevated',
                    showPager && selectedIndex === questionIndex && 'ring-2 ring-brand-500/40',
                  )}
                >
                  <button
                    type="button"
                    onClick={() => toggleFixed(question)}
                    className="flex w-full items-start gap-3 text-left"
                  >
                    <span
                      className={cn(
                        'mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border transition-colors',
                        selected
                          ? 'border-brand-500 bg-brand-500 text-white'
                          : 'border-line bg-elevated text-transparent',
                      )}
                    >
                      <Check width={12} height={12} className="shrink-0" />
                    </span>
                    <span className="min-w-0 flex-1 text-sm leading-relaxed text-fg">
                      <Markdown source={question.question} />
                    </span>
                    {selected && (
                      <span className="tabular flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-gradient-to-br from-brand-500/15 to-amber-500/10 text-xs font-bold text-brand-600 dark:text-brand-300">
                        {selectedIndex + 1}
                      </span>
                    )}
                  </button>

                  {selected && (
                    <div className="mt-3 pl-8">
                      <MarkButtons id={question.id} marks={marks} onMark={onMark} />
                      <div className="mt-3">
                        <AnswerReveal
                          questionId={question.id}
                          answer={question.answer}
                          revealed={revealed}
                          onToggle={toggleReveal}
                        />
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
          {pager && <div className="mt-4">{pager}</div>}
          {footer}
        </>
      )}
    </div>
  )
}
