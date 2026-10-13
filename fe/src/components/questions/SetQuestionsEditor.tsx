import { Button, Spinner } from '@heroui/react'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'

import Check from '~icons/lucide/check'
import { QuestionPicker } from '@/components/questions/QuestionPicker'
import {
  fetchBankQuestions,
  setBankQuestions,
  type Question,
  type QuestionBank,
} from '@/lib/api'
import { getErrorMessage } from '@/lib/error'

export function SetQuestionsEditor({ bank, onSaved }: { bank: QuestionBank; onSaved: () => void }) {
  const [selected, setSelected] = useState<string[]>(bank.questions)
  const [members, setMembers] = useState<Question[]>([])
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    let cancelled = false
    fetchBankQuestions(bank.id)
      .then((data) => {
        if (!cancelled) setMembers(data.questions)
      })
      .catch((error) => {
        if (!cancelled) toast.error(getErrorMessage(error, '加载失败'))
      })
    return () => {
      cancelled = true
    }
  }, [bank.id])

  const initialSet = new Set(bank.questions)
  const dirty = selected.length !== initialSet.size || selected.some((id) => !initialSet.has(id))

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

  return (
    <div className="flex flex-col gap-3">
      <QuestionPicker
        selected={selected}
        onChange={setSelected}
        initialQuestions={members}
        dirty={dirty}
      />

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
              {isPending ? (
                <Spinner color="current" size="sm" />
              ) : (
                <Check width={15} height={15} className="shrink-0" />
              )}
              保存题目集
            </>
          )}
        </Button>
      </div>
    </div>
  )
}
