import { Button, Checkbox, Skeleton } from '@heroui/react'
import { memo, useCallback, useEffect, useMemo, useRef, useState, type MouseEvent } from 'react'
import { toast } from 'sonner'

import ChevronDown from '~icons/lucide/chevron-down'
import ListChecks from '~icons/lucide/list-checks'
import RotateCcw from '~icons/lucide/rotate-ccw'
import X from '~icons/lucide/x'
import { IconAction } from '@/components/ui/IconAction'
import { Markdown } from '@/components/ui/Markdown'
import { SearchInput } from '@/components/ui/SearchInput'
import { listQuestions, type Question } from '@/lib/api'
import { getErrorMessage } from '@/lib/error'
import { cn } from '@/lib/utils'

const PAGE_SIZE = 20

type Picker = {
  /** 已选题目 id，顺序即题目集顺序 */
  selected: string[]
  onChange: (ids: string[]) => void
  /** 预置的题目对象（用于展示已选项内容） */
  initialQuestions?: Question[]
  /** 显示「未保存」提示 */
  dirty?: boolean
  disabled?: boolean
}

/**
 * 题目选择器：受控 `selected` + 服务端分页搜索。
 * 只负责搜索/勾选等 UI 状态，可与「新建题目集」「编辑题目集」复用。
 */
export function QuestionPicker({
  selected,
  onChange,
  initialQuestions,
  dirty,
  disabled,
}: Picker) {
  const [known, setKnown] = useState<Map<string, Question>>(new Map())

  const [keyword, setKeyword] = useState('')
  const [debouncedKeyword, setDebouncedKeyword] = useState('')

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedKeyword(keyword), 300)
    return () => window.clearTimeout(timer)
  }, [keyword])

  const [results, setResults] = useState<Question[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [retryNonce, setRetryNonce] = useState(0)

  const seqRef = useRef(0)
  const query = debouncedKeyword.trim()

  const register = useCallback((items: Question[]) => {
    if (items.length === 0) return
    setKnown((prev) => {
      const next = new Map(prev)
      let changed = false
      for (const item of items) {
        if (next.get(item.id) !== item) {
          next.set(item.id, item)
          changed = true
        }
      }
      return changed ? next : prev
    })
  }, [])

  // 预置题目对象
  useEffect(() => {
    if (initialQuestions && initialQuestions.length > 0) register(initialQuestions)
  }, [initialQuestions, register])

  // 搜索（首屏 / 关键词变化 / 重试）
  useEffect(() => {
    const seq = ++seqRef.current
    setLoading(true)
    setError(null)
    listQuestions({ q: query, limit: PAGE_SIZE, offset: 0 })
      .then((data) => {
        if (seq !== seqRef.current) return
        setResults(data.questions)
        setTotal(data.total)
        register(data.questions)
      })
      .catch((err) => {
        if (seq !== seqRef.current) return
        setError(getErrorMessage(err, '加载失败'))
      })
      .finally(() => {
        if (seq === seqRef.current) setLoading(false)
      })
  }, [query, retryNonce, register])

  const loadMore = async () => {
    const seq = seqRef.current
    setLoadingMore(true)
    try {
      const data = await listQuestions({ q: query, limit: PAGE_SIZE, offset: results.length })
      if (seq !== seqRef.current) return
      setResults((prev) => [...prev, ...data.questions])
      setTotal(data.total)
      register(data.questions)
    } catch (err) {
      if (seq === seqRef.current) toast.error(getErrorMessage(err, '加载失败'))
    } finally {
      if (seq === seqRef.current) setLoadingMore(false)
    }
  }

  const toggle = useCallback(
    (item: Question) => {
      register([item])
      onChange(
        selected.includes(item.id)
          ? selected.filter((id) => id !== item.id)
          : [...selected, item.id],
      )
    },
    [onChange, register, selected],
  )

  const clearAll = () => onChange([])
  const selectAllLoaded = () => {
    const added = results.filter((item) => !selected.includes(item.id))
    if (added.length === 0) return
    register(added)
    onChange([...selected, ...added.map((item) => item.id)])
  }

  const selectedSet = useMemo(() => new Set(selected), [selected])
  const allLoadedSelected =
    results.length > 0 && results.every((item) => selectedSet.has(item.id))

  return (
    <div className="flex flex-col gap-4">
      {/* 搜索 + 结果 */}
      <section className="flex flex-col gap-3">
        <SearchInput
          value={keyword}
          onChange={setKeyword}
          placeholder="搜索题目内容…"
          ariaLabel="搜索题目内容"
          isLoading={loading}
        />

        <div className="flex items-center justify-between text-[11px] text-fg-subtle">
          <span className="tabular">匹配 {total} 题</span>
          {results.length > 0 && (
            <button
              type="button"
              onClick={selectAllLoaded}
              disabled={disabled || allLoadedSelected}
              className="font-medium text-brand-600 transition-colors hover:underline disabled:opacity-50 dark:text-brand-300"
            >
              {allLoadedSelected ? '本页已全选' : '全选本页'}
            </button>
          )}
        </div>

        <div className="flex max-h-80 flex-col gap-1 overflow-auto">
          {error ? (
            <div className="flex flex-col items-start gap-2 rounded-xl border border-danger/30 bg-danger/5 px-3 py-3">
              <p className="text-xs text-danger">{error}</p>
              <Button
                size="sm"
                variant="secondary"
                onPress={() => setRetryNonce((n) => n + 1)}
              >
                <RotateCcw width={14} height={14} className="shrink-0" />
                重试
              </Button>
            </div>
          ) : results.length === 0 ? (
            loading ? (
              <div className="flex flex-col gap-1" aria-hidden>
                {Array.from({ length: 4 }).map((_, index) => (
                  <Skeleton key={index} className="h-9 rounded-xl" />
                ))}
              </div>
            ) : (
              <p className="px-2 py-3 text-xs text-fg-subtle">
                {query ? '没有匹配的题目' : '题库暂无题目'}
              </p>
            )
          ) : (
            results.map((item) => (
              <ResultRow
                key={item.id}
                item={item}
                selected={selectedSet.has(item.id)}
                disabled={disabled}
                onToggle={toggle}
              />
            ))
          )}
        </div>

        {!loading && !error && results.length < total && (
          <Button
            size="sm"
            variant="ghost"
            isPending={loadingMore}
            isDisabled={disabled}
            onPress={loadMore}
          >
            <ChevronDown width={14} height={14} className="shrink-0" />
            加载更多（{results.length}/{total}）
          </Button>
        )}

        {/* 已选 */}
        <section className="rounded-xl border border-line bg-sunken p-3">
          <div className="mb-2 flex items-center gap-2 text-xs font-semibold text-fg-muted">
            <ListChecks width={14} height={14} className="shrink-0" />
            已选 {selected.length} 题
            {dirty && <span className="text-amber-600 dark:text-amber-400">· 未保存</span>}
            {selected.length > 0 && (
              <button
                type="button"
                onClick={clearAll}
                disabled={disabled}
                className="ml-auto text-[11px] font-medium text-fg-subtle transition-colors hover:text-danger disabled:opacity-50"
              >
                清空
              </button>
            )}
          </div>
          {selected.length === 0 ? (
            <p className="text-xs text-fg-subtle">还没有题目，从上方搜索并勾选。</p>
          ) : (
            <div className="flex max-h-44 flex-col gap-1 overflow-auto">
              {selected.map((id, index) => {
                const item = known.get(id)
                return (
                  <div
                    key={id}
                    className="flex items-center gap-2 rounded-lg border border-line bg-elevated px-2.5 py-1.5"
                  >
                    <span className="tabular w-5 shrink-0 text-right text-[11px] text-fg-subtle">
                      {index + 1}
                    </span>
                    {item ? (
                      <div className="min-w-0 flex-1 overflow-hidden text-xs">
                        <Markdown source={item.question} />
                      </div>
                    ) : (
                      <span className="min-w-0 flex-1 truncate text-xs text-fg-subtle">
                        加载中…
                      </span>
                    )}
                    <IconAction
                      label="移出"
                      isDisabled={disabled}
                      onPress={() => item && toggle(item)}
                    >
                      <X width={14} height={14} className="shrink-0 text-fg-subtle" />
                    </IconAction>
                  </div>
                )
              })}
            </div>
          )}
        </section>
      </section>
    </div>
  )
}

const ResultRow = memo(function ResultRow({
  item,
  selected,
  disabled,
  onToggle,
}: {
  item: Question
  selected: boolean
  disabled?: boolean
  onToggle: (item: Question) => void
}) {
  // 点击整行切换；链接 / 复选框自身除外（避免与 Checkbox 的 onChange 双触发）
  const handleClick = (event: MouseEvent<HTMLDivElement>) => {
    if (disabled) return
    if ((event.target as HTMLElement).closest('a, [data-slot="checkbox-content"]')) return
    onToggle(item)
  }

  return (
    <div
      onClick={handleClick}
      className={cn(
        'flex cursor-pointer items-start gap-2 rounded-xl border px-3 py-2 transition-colors',
        disabled && 'cursor-not-allowed opacity-60',
        selected
          ? 'border-brand-500/50 bg-brand-500/10'
          : 'border-line bg-elevated hover:border-brand-500/40',
      )}
    >
      <Checkbox
        isSelected={selected}
        isDisabled={disabled}
        onChange={() => onToggle(item)}
        className="mt-0.5 shrink-0"
        aria-label="选择题目"
      >
        <Checkbox.Content>
          <Checkbox.Control>
            <Checkbox.Indicator />
          </Checkbox.Control>
        </Checkbox.Content>
      </Checkbox>
      <div className={cn('min-w-0 flex-1 text-xs', selected ? 'text-fg' : 'text-fg-muted')}>
        <Markdown source={item.question} />
      </div>
    </div>
  )
})
