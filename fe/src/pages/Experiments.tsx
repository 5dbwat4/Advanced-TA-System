import { Button, Input, Skeleton, Spinner } from '@heroui/react'
import { AnimatePresence, motion } from 'motion/react'
import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'

import { EmptyState } from '@/components/ui/Card'
import { Icon } from '@/components/ui/Icon'
import { PageHeader } from '@/components/ui/PageHeader'
import { apiFetch, type Experiment } from '@/lib/api'
import { useCurrentClass } from '@/lib/store'

export default function Experiments() {
  const currentClass = useCurrentClass()
  const [experiments, setExperiments] = useState<Experiment[]>([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [mark, setMark] = useState('')
  const [title, setTitle] = useState('')
  const [saving, setSaving] = useState(false)

  const reload = useCallback(async () => {
    try {
      const data = await apiFetch<{ experiments: Experiment[] }>('/api/experiments')
      setExperiments(data.experiments)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '加载失败')
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    const run = async () => {
      try {
        const data = await apiFetch<{ experiments: Experiment[] }>('/api/experiments')
        if (!cancelled) setExperiments(data.experiments)
      } catch (error) {
        if (!cancelled) toast.error(error instanceof Error ? error.message : '加载失败')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    run()
    return () => {
      cancelled = true
    }
  }, [])

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (!currentClass) return
    setSaving(true)
    try {
      await apiFetch<{ experiment: Experiment }>('/api/experiments', {
        method: 'POST',
        body: JSON.stringify({ mark: mark.trim(), title: title.trim(), classId: currentClass.id }),
      })
      toast.success('已添加实验')
      setMark('')
      setTitle('')
      setCreating(false)
      await reload()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '创建失败')
    } finally {
      setSaving(false)
    }
  }

  const visible = currentClass
    ? experiments.filter((exp) => exp.classId === currentClass.id)
    : experiments

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title="实验"
        actions={
          <Button
            size="lg"
            variant={creating ? 'ghost' : 'primary'}
            onPress={() => setCreating((open) => !open)}
          >
            <Icon icon={creating ? 'lucide:x' : 'lucide:plus'} width={16} />
            新建实验
          </Button>
        }
      />

      <AnimatePresence>
        {creating && (
          <motion.form
            key="create"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
            onSubmit={submit}
            className="mb-6 flex flex-col gap-4 rounded-2xl border border-line bg-elevated p-6"
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-fg-muted">实验编号</label>
                <Input
                  fullWidth
                  className="tabular"
                  value={mark}
                  onChange={(e) => setMark(e.target.value)}
                  placeholder="Lab 0"
                  maxLength={32}
                  autoFocus
                  required
                />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-fg-muted">实验标题</label>
                <Input
                  fullWidth
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="五级流水线"
                  maxLength={64}
                  required
                />
              </div>
            </div>

            <div className="flex items-center gap-2 rounded-xl bg-sunken px-4 py-2.5 text-xs text-fg-subtle">
              <Icon icon="lucide:graduation-cap" width={14} />
              归属课程：{currentClass?.name ?? '未选择课程'}
            </div>

            <Button
              type="submit"
              fullWidth
              isPending={saving}
              isDisabled={!currentClass || !mark.trim() || !title.trim()}
              className="mt-1 bg-gradient-to-r from-brand-600 to-brand-700 shadow-lg shadow-brand-600/25"
            >
              {({ isPending }) => (
                <>
                  {isPending ? (
                    <Spinner color="current" size="sm" />
                  ) : (
                    <Icon icon="lucide:check" width={16} />
                  )}
                  {isPending ? '添加中' : '添加实验'}
                </>
              )}
            </Button>
          </motion.form>
        )}
      </AnimatePresence>

      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-20 rounded-2xl" />
          ))}
        </div>
      ) : visible.length === 0 ? (
        <EmptyState icon="lucide:flask-conical" title="暂无实验" hint="点击右上角新建实验" />
      ) : (
        <div className="space-y-3">
          {visible.map((exp, i) => (
            <motion.div
              key={exp.id}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.35, delay: i * 0.05, ease: [0.16, 1, 0.3, 1] }}
            >
              <Link
                to={`/console/experiments/${exp.id}`}
                className="group flex flex-wrap items-center gap-4 rounded-2xl border border-line bg-elevated p-5 transition-colors hover:border-brand-500/40 hover:bg-sunken/40"
              >
                <span className="tabular rounded-lg bg-brand-500/10 px-2.5 py-1 text-xs font-bold text-brand-600 dark:text-brand-300">
                  {exp.mark}
                </span>
                <h3 className="min-w-0 flex-1 truncate font-bold">{exp.title}</h3>
                <span className="rounded-lg border border-line bg-sunken px-2.5 py-1 text-xs font-semibold text-fg-muted">
                  {exp.klass?.name ?? '未绑定课程'}
                </span>
                <span className="hidden items-center gap-1 text-xs text-fg-subtle sm:flex">
                  <Icon icon="lucide:notebook-text" width={13} />
                  {exp.questionBank ? exp.questionBank.name : '未绑定题目集'}
                </span>
                <Icon
                  icon="lucide:chevron-right"
                  width={18}
                  className="text-fg-subtle transition-transform group-hover:translate-x-0.5"
                />
              </Link>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  )
}
