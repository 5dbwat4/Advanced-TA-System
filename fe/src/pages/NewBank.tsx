import { Input } from '@heroui/react'
import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'

import Check from '~icons/lucide/check'
import { QuestionPicker } from '@/components/questions/QuestionPicker'
import { BackLink } from '@/components/ui/BackLink'
import { PageHeader } from '@/components/ui/PageHeader'
import { PendingButton } from '@/components/ui/PendingButton'
import { createBank, setBankQuestions } from '@/lib/api'
import { getErrorMessage } from '@/lib/error'

export default function NewBank() {
  const navigate = useNavigate()
  const [name, setName] = useState('')
  const [selected, setSelected] = useState<string[]>([])
  const [saving, setSaving] = useState(false)

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (!name.trim()) return
    setSaving(true)
    try {
      const { bank } = await createBank(name.trim())
      if (selected.length > 0) {
        try {
          await setBankQuestions(bank.id, selected)
        } catch (error) {
          toast.error(getErrorMessage(error, '题目保存失败，可稍后在题目集页面添加'))
        }
      }
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

        <div className="rounded-2xl border border-line bg-elevated p-6">
          <div className="mb-4 text-sm font-bold">选择题目</div>
          <QuestionPicker selected={selected} onChange={setSelected} />
        </div>

        <div className="flex justify-end">
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
