import { Button, Input, Spinner } from '@heroui/react'
import { useState, type FormEvent } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { toast } from 'sonner'

import Check from '~icons/lucide/check'
import { Card } from '@/components/ui/Card'
import { PageHeader } from '@/components/ui/PageHeader'
import { createClass } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import { cn } from '@/lib/utils'

const TYPE_OPTIONS = [
  { value: '2026-sys1', label: '系统I' },
  { value: '2026-sys2', label: '系统II' },
  { value: '2026-sys3', label: '系统III' },
] as const

export default function NewCourse() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const { refresh } = useAuth()
  const xzzdClassId = params.get('id') ?? ''
  const [name, setName] = useState(params.get('name') ?? '')
  const [type, setType] = useState<'2026-sys1' | '2026-sys2' | '2026-sys3'>('2026-sys1')
  const [saving, setSaving] = useState(false)

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setSaving(true)
    try {
      await createClass({ xzzdClassId, name: name.trim(), type })
      await refresh()
      toast.success('课程已添加')
      navigate('/console/settings')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '保存失败')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title="添加课程" />
      <form onSubmit={submit}>
        <Card index={0} className="flex flex-col gap-4">
          <div>
            <label className="mb-1.5 block text-xs font-semibold text-fg-muted">学在浙大id</label>
            <Input
              fullWidth
              className="tabular disabled:opacity-60"
              value={xzzdClassId}
              disabled
            />
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-semibold text-fg-muted">名称</label>
            <Input
              fullWidth
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="课程名称"
              maxLength={64}
              required
            />
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-semibold text-fg-muted">类别</label>
            <div className="flex flex-wrap gap-2">
              {TYPE_OPTIONS.map((option) => (
                <label
                  key={option.value}
                  className={cn(
                    'flex cursor-pointer items-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-semibold transition-colors',
                    type === option.value
                      ? 'border-brand-500/60 bg-brand-500/10 text-brand-600 dark:text-brand-300'
                      : 'border-line bg-sunken text-fg-muted hover:border-brand-500/40',
                  )}
                >
                  <input
                    type="radio"
                    name="type"
                    value={option.value}
                    checked={type === option.value}
                    onChange={() => setType(option.value)}
                    className="accent-brand-600"
                  />
                  {option.label}
                </label>
              ))}
            </div>
          </div>

          <Button
            type="submit"
            fullWidth
            isPending={saving}
            isDisabled={!xzzdClassId || !name.trim()}
            className="mt-2 bg-gradient-to-r from-brand-600 to-brand-700 shadow-lg shadow-brand-600/25"
          >
            {({ isPending }) => (
              <>
                {isPending ? (
                  <Spinner color="current" size="sm" />
                ) : (
                  <Check width={16} height={16} className="shrink-0" />
                )}
                {isPending ? '保存中' : '保存'}
              </>
            )}
          </Button>
        </Card>
      </form>
    </div>
  )
}
