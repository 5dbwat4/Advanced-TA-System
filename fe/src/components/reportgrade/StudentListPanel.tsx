import { useMemo, useState } from 'react'

import Check from '~icons/lucide/check'
import { SearchInput } from '@/components/ui/SearchInput'
import { cn } from '@/lib/utils'

import { formatScore, type GradeStudent } from './shared'

export function StudentListPanel({
  students,
  selectedPersonId,
  onSelect,
}: {
  students: GradeStudent[]
  selectedPersonId: number | null
  onSelect: (personId: number) => void
}) {
  const [query, setQuery] = useState('')

  const visible = useMemo(() => {
    const keyword = query.trim().toLowerCase()
    if (!keyword) return students
    return students.filter(
      (student) =>
        student.name.toLowerCase().includes(keyword) ||
        student.studentNo.toLowerCase().includes(keyword),
    )
  }, [students, query])

  const gradedCount = students.filter((student) => student.score != null).length

  return (
    <div className="flex h-full flex-col">
      <div className="shrink-0 border-b border-line p-3">
        <SearchInput
          value={query}
          onChange={setQuery}
          ariaLabel="搜索学生"
          placeholder="搜索姓名 / 学号"
        />
        <div className="mt-2 flex items-center justify-between text-[11px] text-fg-subtle">
          <span>已提交 {students.length} 人</span>
          <span className="tabular">
            已批改 <span className="font-semibold text-fg">{gradedCount}</span> / {students.length}
          </span>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-auto p-2">
        {visible.length === 0 ? (
          <p className="px-2 py-6 text-center text-xs text-fg-subtle">没有匹配的学生</p>
        ) : (
          visible.map((student) => {
            const active = student.personId === selectedPersonId
            return (
              <button
                key={student.personId}
                type="button"
                onClick={() => onSelect(student.personId)}
                className={cn(
                  'mb-0.5 flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left transition-colors',
                  active ? 'bg-brand-500/10 text-fg' : 'hover:bg-sunken',
                )}
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold">{student.name}</span>
                  <span className="tabular block text-[11px] text-fg-subtle">
                    {student.studentNo || `person ${student.personId}`}
                  </span>
                </span>
                {student.score != null ? (
                  <span className="tabular inline-flex shrink-0 items-center gap-1 rounded-lg bg-emerald-500/10 px-2 py-0.5 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                    <Check width={12} height={12} className="shrink-0" />
                    {formatScore(student.score.score)}
                  </span>
                ) : (
                  <span className="shrink-0 rounded-lg bg-sunken px-2 py-0.5 text-[11px] text-fg-subtle">
                    未批改
                  </span>
                )}
              </button>
            )
          })
        )}
      </div>
    </div>
  )
}
