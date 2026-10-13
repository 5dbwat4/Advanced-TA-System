import { Button, ToggleButton, Tooltip } from '@heroui/react'
import { useEffect, useMemo, useRef, useState } from 'react'

import Check from '~icons/lucide/check'
import Info from '~icons/lucide/info'
import Search from '~icons/lucide/search'
import SlidersHorizontal from '~icons/lucide/sliders-horizontal'
import { SearchInput } from '@/components/ui/SearchInput'
import { matchStudent } from '@/lib/pinyin'
import { cn } from '@/lib/utils'

import { formatScore, type GradeStudent, type StudentFlag } from './shared'

export function StudentListPanel({
  students,
  selectedPersonId,
  onSelect,
  editorsByStuId,
  flagsByStuId,
}: {
  students: GradeStudent[]
  selectedPersonId: number | null
  onSelect: (personId: number) => void
  editorsByStuId: Map<string, string[]>
  flagsByStuId: Map<string, StudentFlag>
}) {
  const [query, setQuery] = useState('')
  const [onlyUngraded, setOnlyUngraded] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const searchRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (searchOpen) searchRef.current?.focus()
  }, [searchOpen])

  const visible = useMemo(
    () =>
      students.filter(
        (student) => (!onlyUngraded || student.score == null) && matchStudent(query, student),
      ),
    [students, query, onlyUngraded],
  )

  const gradedCount = students.filter((student) => student.score != null).length

  return (
    <div className="flex h-full flex-col">
      <div className="shrink-0 border-b border-line p-3">
        <div className="flex items-center gap-2">
          <div className="relative h-9 min-w-0 flex-1">
            <div
              className={cn(
                'absolute inset-0 transition-all duration-200 ease-out',
                searchOpen
                  ? 'pointer-events-none invisible scale-95 opacity-0'
                  : 'visible scale-100 opacity-100',
              )}
            >
              <ToggleButton
                size="sm"
                isSelected={onlyUngraded}
                onChange={setOnlyUngraded}
                className="h-9 w-full"
              >
                只看未批改
              </ToggleButton>
            </div>
            <div
              className={cn(
                'absolute inset-0 transition-all duration-200 ease-out',
                searchOpen
                  ? 'visible scale-100 opacity-100'
                  : 'pointer-events-none invisible scale-95 opacity-0',
              )}
            >
              <SearchInput
                value={query}
                onChange={setQuery}
                ariaLabel="搜索学生"
                placeholder="搜索"
                inputRef={searchRef}
              />
            </div>
          </div>
          <Button
            isIconOnly
            size="sm"
            variant="secondary"
            className="h-9 w-9"
            aria-label={searchOpen ? '关闭搜索' : '搜索'}
            onPress={() => {
              if (searchOpen) setQuery('')
              setSearchOpen(!searchOpen)
            }}
          >
            <Search width={16} height={16} className="shrink-0" />
          </Button>
          <Button
            isIconOnly
            size="sm"
            variant="secondary"
            className="h-9 w-9"
            aria-label="筛选"
            isDisabled
          >
            <SlidersHorizontal width={16} height={16} className="shrink-0" />
          </Button>
        </div>
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
            const editors = student.stuId ? (editorsByStuId.get(student.stuId) ?? []) : []
            const flag = student.stuId ? flagsByStuId.get(student.stuId) : undefined
            const flagLines: string[] = []
            if (flag?.focusReason != null) {
              const reason = flag.focusReason.trim()
              flagLines.push(reason ? `重点关注对象：${reason}` : '重点关注对象')
            }
            if (flag?.checkpoint) flagLines.push('领取了 Checkpoint')
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
                  <span className="flex min-w-0 items-center gap-1">
                    <span className="min-w-0 truncate text-sm font-semibold">{student.name}</span>
                    {flagLines.length > 0 && (
                      <Tooltip delay={0}>
                        <Tooltip.Trigger className="inline-flex shrink-0">
                          <Info
                            width={13}
                            height={13}
                            className="text-fg-subtle transition-colors hover:text-brand-600 dark:hover:text-brand-300"
                          />
                        </Tooltip.Trigger>
                        <Tooltip.Content showArrow placement="right" className="max-w-xs">
                          <span className="flex flex-col">
                            {flagLines.map((line) => (
                              <span key={line}>{line}</span>
                            ))}
                          </span>
                        </Tooltip.Content>
                      </Tooltip>
                    )}
                  </span>
                  <span className="tabular block text-[11px] text-fg-subtle">
                    {student.studentNo || `person ${student.personId}`}
                  </span>
                  {editors.length > 0 && (
                    <span className="mt-0.5 block truncate text-[11px] font-medium text-amber-600 dark:text-amber-400">
                      {editors.join('、')} 正在批改
                    </span>
                  )}
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
