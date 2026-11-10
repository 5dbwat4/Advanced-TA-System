import { Checkbox, Input } from '@heroui/react'
import { useState, type FormEvent } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { toast } from 'sonner'

import Check from '~icons/lucide/check'
import { QuestionPicker } from '@/components/questions/QuestionPicker'
import { TagSelect } from '@/components/questions/TagSelect'
import { BackLink } from '@/components/ui/BackLink'
import { PageHeader } from '@/components/ui/PageHeader'
import { PendingButton } from '@/components/ui/PendingButton'
import { createBank, setBankQuestions, type Question } from '@/lib/api'
import { getErrorMessage } from '@/lib/error'
import { useQuestionBasket } from '@/lib/question-basket'
import { fetchAllQuestionsByTag, useTags } from '@/lib/query'

export default function NewBank() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const fromBasket = params.get('from') === 'basket'
  const clearBasket = useQuestionBasket((state) => state.clear)
  const [clearBasketOnCreate, setClearBasketOnCreate] = useState(true)
  const [name, setName] = useState('')
  const [selected, setSelected] = useState<string[]>(() => {
    const questionIds = params.get('questionIds')
    return questionIds ? questionIds.split(',').filter(Boolean) : []
  })
  const [tagIds, setTagIds] = useState<string[]>(() => {
    const tagId = params.get('tagId')
    return tagId ? [tagId] : []
  })
  const [selectTagIds, setSelectTagIds] = useState<string[]>(tagIds)
  const [taggedQuestions, setTaggedQuestions] = useState<Question[]>([])
  const [selecting, setSelecting] = useState(false)
  const [inverting, setInverting] = useState(false)
  const [saving, setSaving] = useState(false)
  const { data: tags = [] } = useTags()
  const selectTagNames = tags
    .filter((tag) => selectTagIds.includes(tag.id))
    .map((tag) => tag.name)

  // 左侧标签变化时同步到右侧；右侧的变化不影响左侧。
  const changeTagIds = (next: string[]) => {
    setTagIds(next)
    setSelectTagIds(next)
  }

  // 右侧标签选中的全部题目（用于批量选中 / 反选）。
  const loadTaggedQuestions = async () => {
    const results = await Promise.all(
      selectTagIds.map((tagId) => fetchAllQuestionsByTag(tagId)),
    )
    const merged = new Map<string, Question>()
    for (const questions of results) {
      for (const question of questions) merged.set(question.id, question)
    }
    const items = [...merged.values()]
    setTaggedQuestions((prev) => {
      const map = new Map(prev.map((item) => [item.id, item]))
      for (const item of items) map.set(item.id, item)
      return [...map.values()]
    })
    return items
  }

  // 只新增：把带这些标签的题目加入已选，不移除任何已选题目。
  const selectByTags = async () => {
    if (selectTagIds.length === 0) return
    setSelecting(true)
    try {
      const items = await loadTaggedQuestions()
      setSelected((prev) => {
        const existing = new Set(prev)
        const next = [...prev]
        for (const item of items) {
          if (!existing.has(item.id)) {
            existing.add(item.id)
            next.push(item.id)
          }
        }
        return next
      })
    } catch (error) {
      toast.error(getErrorMessage(error, '按标签加载题目失败'))
    } finally {
      setSelecting(false)
    }
  }

  // 反选：在带这些标签的题目范围内，已选的移出、未选的加入。
  const invertSelection = async () => {
    if (selectTagIds.length === 0) return
    setInverting(true)
    try {
      const items = await loadTaggedQuestions()
      setSelected((prev) => {
        const next = new Set(prev)
        for (const item of items) {
          if (next.has(item.id)) next.delete(item.id)
          else next.add(item.id)
        }
        return [...next]
      })
    } catch (error) {
      toast.error(getErrorMessage(error, '按标签加载题目失败'))
    } finally {
      setInverting(false)
    }
  }

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (!name.trim()) return
    setSaving(true)
    try {
      const { bank } = await createBank(name.trim(), tagIds)
      if (selected.length > 0) {
        try {
          await setBankQuestions(bank.id, selected)
        } catch (error) {
          toast.error(getErrorMessage(error, '题目保存失败，可稍后在题目集页面添加'))
        }
      }
      if (fromBasket && clearBasketOnCreate) clearBasket()
      toast.success('已创建题目集')
      navigate(`/console/questions/banks/${bank.id}`, { replace: true })
    } catch (error) {
      toast.error(getErrorMessage(error, '创建失败'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="w-full">
      <BackLink to="/console/questions?tab=sets">返回题库</BackLink>

      <PageHeader title="新建题目集" />

      <form onSubmit={submit} className="flex flex-col gap-5">
        <div className="rounded-2xl border border-line bg-elevated p-6">
          <label className="mb-1.5 block text-xs font-semibold text-fg-muted">题目集名称</label>
          <Input
            fullWidth
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="如：系统II 流水线题集"
            maxLength={64}
            autoFocus
            required
            aria-label="题目集名称"
          />
        </div>

        <div className="grid gap-5 sm:grid-cols-2">
          <div className="rounded-2xl border border-line bg-elevated p-6">
            <div className="mb-1.5 block text-xs font-semibold text-fg-muted">
              标签<span className="ml-1 text-xs font-normal text-fg-subtle">（可选）</span>
            </div>
            <TagSelect value={tagIds} onChange={changeTagIds} />
          </div>

          <div className="rounded-2xl border border-line bg-elevated p-6">
            <div className="mb-1.5 block text-xs font-semibold text-fg-muted">按标签选中题目</div>
            <TagSelect value={selectTagIds} onChange={setSelectTagIds} />
            <div className="mt-2 flex flex-wrap gap-2">
              <PendingButton
                type="button"
                size="sm"
                variant="secondary"
                isPending={selecting}
                isDisabled={selectTagIds.length === 0}
                pendingLabel="选中中"
                onPress={selectByTags}
              >
                {`选中所有 tag 为${selectTagNames.length > 0 ? `「${selectTagNames.join('、')}」` : '……'}的题目`}
              </PendingButton>
              <PendingButton
                type="button"
                size="sm"
                variant="secondary"
                isPending={inverting}
                isDisabled={selectTagIds.length === 0}
                pendingLabel="反选中"
                onPress={invertSelection}
              >
                反选
              </PendingButton>
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-line bg-elevated p-6">
          <div className="mb-4 text-sm font-bold">选择题目</div>
          <QuestionPicker
            selected={selected}
            onChange={setSelected}
            initialQuestions={taggedQuestions}
          />
        </div>

        <div className="flex flex-col items-end gap-3">
          {fromBasket && (
            <div className="flex items-center gap-2">
              <Checkbox
                aria-label="同时清空试题篮"
                isSelected={clearBasketOnCreate}
                onChange={setClearBasketOnCreate}
              >
                <Checkbox.Content>
                  <Checkbox.Control>
                    <Checkbox.Indicator />
                  </Checkbox.Control>
                </Checkbox.Content>
              </Checkbox>
              <button
                type="button"
                onClick={() => setClearBasketOnCreate((prev) => !prev)}
                className="text-xs text-fg-muted"
              >
                同时清空试题篮
              </button>
            </div>
          )}
          <PendingButton
            type="submit"
            isPending={saving}
            isDisabled={!name.trim()}
            icon={Check}
            pendingLabel="创建中"
          >
            {selected.length > 0 ? `创建题目集（${selected.length} 题）` : '创建题目集'}
          </PendingButton>
        </div>
      </form>
    </div>
  )
}
