import { AnimatePresence, motion } from 'motion/react'

import Cpu from '~icons/lucide/cpu'
import { AvatarImage } from '@/components/ui/AvatarImage'
import { Markdown } from '@/components/ui/Markdown'
import type { MarkdownStyleId } from '@/lib/api'
import type { SlaveCardState } from '@/lib/checkoff-socket'
import { cn } from '@/lib/utils'

const variants = {
  enter: { x: 360, opacity: 0, scale: 0.9, rotateY: 18 },
  center: { x: 0, opacity: 1, scale: 1, rotateY: 0 },
  exit: { x: -360, opacity: 0, scale: 0.9, rotateY: -18 },
}

/** 为每个状态推导稳定的过渡 key */
function cardKey(state: SlaveCardState): string {
  if (state.kind === 'ask_question') {
    return `q-${state.index}-${state.content.slice(0, 8)}`
  }
  if (state.kind === 'custom_card') {
    return `custom-${state.title}-${state.content.slice(0, 8)}`
  }
  return state.kind
}

function IdleCard({ mark, title }: { mark: string; title: string }) {
  return (
    <div className="flex flex-col items-center gap-6 text-center">
      <motion.div
        animate={{ scale: [1, 1.1, 1], opacity: [0.7, 1, 0.7] }}
        transition={{ duration: 2.4, repeat: Infinity, ease: 'easeInOut' }}
        className="flex h-16 w-16 items-center justify-center rounded-2xl bg-brand-600/10 text-brand-600 dark:text-brand-300"
      >
        <Cpu width={30} height={30} className="shrink-0" />
      </motion.div>
      <div className="text-4xl font-bold tracking-tight text-fg md:text-5xl">此处可验收</div>
      {mark.length > 0 && (
        <div className="text-sm text-fg-subtle">
          Lab {mark} · {title}
        </div>
      )}
    </div>
  )
}

function HintCard({ title, hint }: { title: string; hint: string }) {
  return (
    <div className="flex flex-col items-center gap-2 text-center">
      <div className="text-3xl font-bold tracking-tight text-fg md:text-4xl">{title}</div>
      <div className="text-sm text-fg-subtle">{hint}</div>
    </div>
  )
}

function QuestionCard({
  studentName,
  studentAvatar,
  questionAuthor,
  questionAuthorAvatar,
  index,
  total,
  content,
  markdownStyle,
}: {
  studentName: string
  studentAvatar: number | null
  questionAuthor: string
  questionAuthorAvatar: number | null
  index: number
  total: number
  content: string
  markdownStyle?: MarkdownStyleId
}) {
  return (
    <div>
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <AvatarImage
            id={studentAvatar}
            size={36}
            fallback={studentName.slice(0, 1)}
          />
          <span className="text-sm font-semibold text-fg">{studentName}</span>
        </div>
        <div className="text-right">
          <div className="tabular text-[11px] uppercase tracking-widest text-fg-subtle">
            问题 {index} / {total}
          </div>
          <div className="mt-0.5 flex items-center justify-end gap-1.5 text-[11px] text-fg-subtle">
            <span>命题人</span>
            <AvatarImage
              id={questionAuthorAvatar}
              size={18}
              fallback={(questionAuthor || '未知').slice(0, 1)}
            />
            <span>{questionAuthor || '未知'}</span>
          </div>
        </div>
      </div>
      <Markdown source={content} style={markdownStyle} />
    </div>
  )
}

function CustomCardBody({
  title,
  content,
  markdownStyle,
}: {
  title: string
  content: string
  markdownStyle?: MarkdownStyleId
}) {
  return (
    <div>
      {title.trim() && (
        <div className="mb-4 text-2xl font-bold tracking-tight text-fg">{title}</div>
      )}
      <Markdown source={content} style={markdownStyle} />
    </div>
  )
}

function CardBody({ state, markdownStyle }: { state: SlaveCardState; markdownStyle?: MarkdownStyleId }) {
  switch (state.kind) {
    case 'idle':
      return <IdleCard mark={state.experimentMark} title={state.experimentTitle} />
    case 'ask_name':
      return <HintCard title="您的姓名 / 学号？" hint="请告诉助教" />
    case 'ask_demo':
      return <HintCard title="请展示 demo" hint="代码 / 上板结果 / 仿真结果等" />
    case 'custom_card':
      return (
        <CustomCardBody
          title={state.title}
          content={state.content}
          markdownStyle={markdownStyle}
        />
      )
    case 'ask_question':
      return (
        <QuestionCard
          studentName={state.studentName}
          studentAvatar={state.studentAvatar}
          questionAuthor={state.questionAuthor}
          questionAuthorAvatar={state.questionAuthorAvatar}
          index={state.index}
          total={state.total}
          content={state.content}
          markdownStyle={markdownStyle}
        />
      )
    case 'thank':
      return (
        <div className="flex flex-col items-center gap-2 text-center">
          <div className="text-3xl font-bold tracking-tight text-fg md:text-4xl">感谢您参与验收</div>
          {state.studentName && <div className="text-sm text-fg-subtle">{state.studentName}</div>}
        </div>
      )
  }
}

export function SlaveCard({ state, markdownStyle }: { state: SlaveCardState; markdownStyle?: MarkdownStyleId }) {
  const isHero = state.kind === 'idle' || state.kind === 'thank'
  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={cardKey(state)}
        variants={variants}
        initial="enter"
        animate="center"
        exit="exit"
        transition={{ type: 'spring', stiffness: 220, damping: 26 }}
        style={{ transformPerspective: 1000 }}
        className={cn(
          'rounded-3xl border border-line bg-elevated/80 p-8 shadow-2xl backdrop-blur-xl transition-shadow duration-300 hover:shadow-2xl hover:shadow-brand-600/20',
          isHero && 'flex aspect-square w-full items-center justify-center',
        )}
      >
        <CardBody state={state} markdownStyle={markdownStyle} />
      </motion.div>
    </AnimatePresence>
  )
}
