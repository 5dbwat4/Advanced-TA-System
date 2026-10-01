import { Button, Checkbox, Input, Spinner } from '@heroui/react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useDebounce } from 'react-use'
import { toast } from 'sonner'

import Check from '~icons/lucide/check'
import ChevronDown from '~icons/lucide/chevron-down'
import ListChecks from '~icons/lucide/list-checks'
import X from '~icons/lucide/x'
import { IconAction } from '@/components/ui/IconAction'
import {
  fetchBankQuestions,
  listQuestions,
  setBankQuestions,
  type Question,
  type QuestionBank,
} from '@/lib/api'
import { getErrorMessage } from '@/lib/error'
import { cn } from '@/lib/utils'

const PAGE_SIZE = 20

/** 去掉 Markdown 标记，取纯文本摘要 */
function plain(markdown: string, max = 90): string {
  const text = markdown
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/[#*`>_~\-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  return text.length > max ? `${text.slice(0, max)}…` : text
}

export function SetQuestionsEditor({ bank, onSaved }: { bank: QuestionBank; onSaved: () => void }) {
  const [selected, setSelected] = useState<string[]>([])
  const [known, setKnown] = useState<Map<string, Question>>(new Map())
  const [keyword, setKeyword] = useState('')
  const [results, setResults] = useState<Question[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [saving, setSaving] = useState(false)

  const register = useCallback((items: Question[]) => {
    setKnown((prev) => {
      const next = new Map(prev)
      for (const item of items) next.set(item.id, item)
      return next
    })
  }, [])

  // 初始：加载当前题目集成员
  useEffect(() => {
    let cancelled = false
    const run = async () => {
      try {
        const data = await fetchBankQuestions(bank.id)
        if (cancelled) return
        setSelected(data.questions.map((item) => item.id))
        register(data.questions)
      } catch (error) {
        if (!cancelled) toast.error(getErrorMessage(error, '加载失败'))
      }
    }
    run()
    return () => {
      cancelled = true
    }
  }, [bank.id, register])

  // 搜索（防抖）
  const searchSeq = useRef(0)
  useDebounce(
    async () => {
      const seq = ++searchSeq.current
      setLoading(true)
      try {
        const data = await listQuestions({ q: keyword.trim(), limit: PAGE_SIZE, offset: 0 })
        if (seq !== searchSeq.current) return
        setResults(data.questions)
        setTotal(data.total)
        register(data.questions)
      } catch (error) {
        if (seq !== searchSeq.current) return
        toast.error(getErrorMessage(error, '加载失败'))
      } finally {
        if (seq === searchSeq.current) setLoading(false)
      }
    },
    300,
    [keyword],
  )

  const loadMore = async () => {
    setLoadingMore(true)
    try {
      const data = await listQuestions({
        q: keyword.trim(),
        limit: PAGE_SIZE,
        offset: results.length,
      })
      setResults((prev) => [...prev, ...data.questions])
      setTotal(data.total)
      register(data.questions)
    } catch (error) {
      toast.error(getErrorMessage(error, '加载失败'))
    } finally {
      setLoadingMore(false)
    }
  }

  const toggle = (item: Question) => {
    register([item])
    setSelected((prev) =>
      prev.includes(item.id) ? prev.filter((id) => id !== item.id) : [...prev, item.id],
    )
  }

  const save = async () => {
    setSaving(true)
    try {
      await setBankQuestions(bank.id, selected)
      toast.success('题目集已保存')
      onSaved()
    } catch (error) {
      toast.error(getErrorMessage(error, '保存失败'))
    } finally {
      setSaving(false)
    }
  }

  const selectedSet = new Set(selected)
  const initialSet = new Set(bank.questions)
  const dirty =
    selected.length !== initialSet.size || selected.some((id) => !initialSet.has(id))

  return (
    <div className="mt-3 flex flex-col gap-3">
      {/* 已选 */}
      <div className="rounded-xl border border-line bg-sunken p-3">
        <div className="mb-2 flex items-center gap-2 text-xs font-semibold text-fg-muted">
          <ListChecks width={14} height={14} className="shrink-0" />
          已选 {selected.length} 题
          {dirty && <span className="text-amber-600 dark:text-amber-400">· 未保存</span>}
        </div>
        {selected.length === 0 ? (
          <p className="text-xs text-fg-subtle">还没有题目，从下方搜索并勾选。</p>
        ) : (
          <div className="flex max-h-40 flex-col gap-1 overflow-auto">
            {selected.map((id) => {
              const item = known.get(id)
              if (!item) return null
              return (
                <div
                  key={id}
                  className="flex items-center gap-2 rounded-lg border border-line bg-elevated px-2.5 py-1.5"
                >
                  <span className="min-w-0 flex-1 truncate text-xs">{plain(item.question)}</span>
                  <IconAction label="移出" onPress={() => toggle(item)}>
                    <X width={14} height={14} className="shrink-0 text-fg-subtle" />
                  </IconAction>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* 搜索 + 结果 */}
      <Input
        fullWidth
        value={keyword}
        onChange={(e) => setKeyword(e.target.value)}
        placeholder="搜索题目内容…"
        aria-label="搜索题目内容"
      />

      <div className="flex max-h-72 flex-col gap-1 overflow-auto">
        {loading ? (
          <div className="flex items-center gap-2 px-2 py-3 text-xs text-fg-subtle">
            <Spinner size="sm" />
            加载中…
          </div>
        ) : results.length === 0 ? (
          <p className="px-2 py-3 text-xs text-fg-subtle">没有匹配的题目</p>
        ) : (
          results.map((item) => (
            <label
              key={item.id}
              className={cn(
                'flex cursor-pointer items-start gap-2 rounded-xl border px-3 py-2 transition-colors',
                selectedSet.has(item.id)
                  ? 'border-brand-500/50 bg-brand-500/10'
                  : 'border-line bg-elevated hover:border-brand-500/40',
              )}
            >
              <Checkbox
                isSelected={selectedSet.has(item.id)}
                onChange={() => toggle(item)}
                className="mt-0.5"
                aria-label="选择题目"
              >
                <Checkbox.Content>
                  <Checkbox.Control>
                    <Checkbox.Indicator />
                  </Checkbox.Control>
                  <span
                    className={cn(
                      'text-xs',
                      selectedSet.has(item.id) ? 'text-fg' : 'text-fg-muted',
                    )}
                  >
                    {plain(item.question)}
                  </span>
                </Checkbox.Content>
              </Checkbox>
            </label>
          ))
        )}
      </div>

      {results.length < total && (
        <Button size="sm" variant="ghost" isPending={loadingMore} onPress={loadMore}>
          <ChevronDown width={14} height={14} className="shrink-0" />
          加载更多（{results.length}/{total}）
        </Button>
      )}

      <div className="flex items-center justify-end gap-2 border-t border-line pt-3">
        <Button
          size="sm"
          variant="ghost"
          isDisabled={!dirty}
          onPress={() => setSelected(bank.questions)}
        >
          重置
        </Button>
        <Button size="sm" variant="primary" isPending={saving} isDisabled={!dirty} onPress={save}>
          {({ isPending }) => (
            <>
              {isPending ? <Spinner color="current" size="sm" /> : <Check width={15} height={15} className="shrink-0" />}
              保存题目集
            </>
          )}
        </Button>
      </div>
    </div>
  )
}
