import { Chip, Input, Spinner } from '@heroui/react'
import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react'
import { toast } from 'sonner'

import ChevronRight from '~icons/lucide/chevron-right'
import ScanSearch from '~icons/lucide/scan-search'
import { fetchCheckoff, type CheckoffStudent, type Score } from '@/lib/api'
import { matchStudent } from '@/lib/pinyin'

const SUMMARY_LABELS: Record<number, string> = {
  0: '功能',
  1: '问答',
  2: '报告',
}

function summaryFor(scores: Score[]): string | null {
  if (scores.length === 0) return null
  return scores
    .map((score) => `${SUMMARY_LABELS[score.type] ?? score.type} ${score.score}`)
    .join(' · ')
}

export function StudentFinder({
  classId,
  experimentId,
  onSelect,
  onSearchBlur,
}: {
  classId: string
  experimentId: string
  onSelect: (student: CheckoffStudent, scores: Score[]) => void
  onSearchBlur?: () => void
}) {
  const [query, setQuery] = useState('')
  const [students, setStudents] = useState<CheckoffStudent[]>([])
  const [scores, setScores] = useState<Score[]>([])
  const [loading, setLoading] = useState(true)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  // 班级人数不多，一次加载完整名单，检索（含拼音）在前端完成
  useEffect(() => {
    let cancelled = false
    setLoading(true)
    fetchCheckoff({ classId, experimentId })
      .then((res) => {
        if (cancelled) return
        setStudents(res.students)
        setScores(res.scores)
      })
      .catch((error) => {
        if (!cancelled) toast.error(error instanceof Error ? error.message : '加载名单失败')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [classId, experimentId])

  const filtered = useMemo(
    () => students.filter((student) => matchStudent(query, student)),
    [students, query],
  )

  const onChange = (event: ChangeEvent<HTMLInputElement>) => setQuery(event.target.value)

  return (
    <div>
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
        className="relative"
      >
        <ScanSearch
          width={18}
          height={18}
          className="shrink-0 pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-fg-subtle"
        />
        <Input
          ref={inputRef}
          fullWidth
          value={query}
          onChange={onChange}
          onBlur={onSearchBlur}
          placeholder="输入姓名、学号、拼音或首字母搜索"
          aria-label="搜索学生"
          className="tabular w-full rounded-2xl border border-line bg-elevated py-3.5 pl-11 pr-11 text-sm text-fg outline-none transition-all placeholder:text-fg-subtle focus:border-brand-500 focus:ring-4 focus:ring-brand-500/15"
        />
        {loading ? (
          <Spinner size="sm" className="absolute right-4 top-1/2 -translate-y-1/2" />
        ) : (
          <span className="tabular pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-xs text-fg-subtle">
            {filtered.length}/{students.length}
          </span>
        )}
      </motion.div>

      <div className="mt-4 space-y-2">
        <AnimatePresence mode="popLayout">
          {filtered.map((student, i) => {
            const studentScores = scores.filter((score) => score.stuId === student.stuId)
            const summary = summaryFor(studentScores)
            return (
              <motion.button
                key={student.stuId}
                type="button"
                layout
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.97 }}
                transition={{ duration: 0.25, delay: Math.min(i, 8) * 0.03, ease: [0.16, 1, 0.3, 1] }}
                onClick={() => onSelect(student, studentScores)}
                className="flex w-full items-center gap-4 rounded-2xl border border-line bg-elevated p-4 text-left transition-all hover:border-brand-500/40 hover:shadow-lg hover:shadow-brand-500/5"
              >
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-brand-500/15 to-amber-500/10 text-sm font-bold text-brand-600 dark:text-brand-300">
                  {student.name.slice(0, 1)}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate font-semibold text-fg">{student.name}</div>
                  <div className="tabular mt-0.5 text-xs text-fg-muted">{student.studentNo}</div>
                </div>
                {summary ? (
                  <Chip size="sm" variant="soft" color="accent" className="tabular">
                    {summary}
                  </Chip>
                ) : (
                  <ChevronRight width={18} height={18} className="shrink-0 text-fg-subtle" />
                )}
              </motion.button>
            )
          })}
        </AnimatePresence>

        {!loading && filtered.length === 0 && (
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="py-10 text-center text-sm text-fg-subtle"
          >
            {query ? `未找到与“${query}”匹配的学生` : '暂无学生'}
          </motion.p>
        )}
      </div>
    </div>
  )
}
