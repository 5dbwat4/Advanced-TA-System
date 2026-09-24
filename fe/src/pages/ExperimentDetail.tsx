import { ListBox, Select, Skeleton, Spinner } from '@heroui/react'
import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { toast } from 'sonner'

import { EmptyState } from '@/components/ui/Card'
import { Icon } from '@/components/ui/Icon'
import { PageHeader } from '@/components/ui/PageHeader'
import {
  apiFetch,
  fetchCheckoff,
  listBanks,
  updateExperiment,
  type CheckoffStudent,
  type Experiment,
  type QuestionBank,
} from '@/lib/api'
import { SCORE_TYPES, scoreKey } from '@/lib/scores'

export default function ExperimentDetail() {
  const { id } = useParams<{ id: string }>()
  const [experiment, setExperiment] = useState<Experiment | null>(null)
  const [banks, setBanks] = useState<QuestionBank[]>([])
  const [students, setStudents] = useState<CheckoffStudent[]>([])
  const [scores, setScores] = useState<Map<string, number>>(new Map())
  const [loading, setLoading] = useState(true)
  const [binding, setBinding] = useState(false)

  const load = useCallback(async (experimentId: string) => {
    const [detail, bankData] = await Promise.all([
      apiFetch<{ experiment: Experiment }>(`/api/experiments/${experimentId}`),
      listBanks(),
    ])
    setExperiment(detail.experiment)
    setBanks(bankData.banks)

    const checkoff = await fetchCheckoff({
      classId: detail.experiment.classId,
      experimentId,
    })
    setStudents(checkoff.students)
    setScores(
      new Map(checkoff.scores.map((item) => [scoreKey(item.stuId, item.type, item.indId), item.score])),
    )
  }, [])

  useEffect(() => {
    if (!id) return
    let cancelled = false
    const run = async () => {
      try {
        await load(id)
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
  }, [id, load])

  const bind = async (bankId: string) => {
    if (!experiment) return
    setBinding(true)
    try {
      const { experiment: updated } = await updateExperiment(experiment.id, {
        questionBankId: bankId || null,
      })
      setExperiment(updated)
      toast.success(bankId ? '已绑定题目集' : '已解绑题目集')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '操作失败')
    } finally {
      setBinding(false)
    }
  }

  const scoreOf = (stuId: string, type: number) =>
    experiment ? scores.get(scoreKey(stuId, type, experiment.id)) : undefined

  const totalOf = (stuId: string) => {
    const func = scoreOf(stuId, 0)
    const qa = scoreOf(stuId, 1)
    if (func == null || qa == null) return null
    return (func * 2 + qa * 5) / 7
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-4xl space-y-3">
        <Skeleton className="h-16 rounded-2xl" />
        <Skeleton className="h-32 rounded-2xl" />
        <Skeleton className="h-64 rounded-2xl" />
      </div>
    )
  }

  if (!experiment) {
    return (
      <div className="mx-auto max-w-4xl">
        <EmptyState icon="lucide:flask-conical" title="实验不存在" hint="它可能已被删除" />
      </div>
    )
  }

  const bank = experiment.questionBank
  const bankQuestionCount = bank
    ? (banks.find((item) => item.id === bank.id)?.questions.length ?? null)
    : null

  return (
    <div className="mx-auto max-w-4xl">
      <Link
        to="/console/experiments"
        className="mb-3 inline-flex items-center gap-1 text-xs font-semibold text-fg-subtle transition-colors hover:text-fg-muted"
      >
        <Icon icon="lucide:arrow-left" width={14} />
        返回实验列表
      </Link>

      <PageHeader title={`${experiment.mark} · ${experiment.title}`} />

      <div className="mb-4 rounded-2xl border border-line bg-elevated p-5">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <Icon
              icon="lucide:notebook-text"
              width={16}
              className="text-brand-600 dark:text-brand-300"
            />
            <span className="text-sm font-bold">抽题题目集</span>
          </div>
          <Select
            className="min-w-[14rem]"
            aria-label="抽题题目集"
            isDisabled={binding}
            value={bank?.id ?? null}
            placeholder="未绑定题目集"
            onChange={(key) => void bind(key == null ? '' : String(key))}
            onClear={() => void bind('')}
          >
            <Select.Trigger>
              <Select.Value />
              <Select.ClearButton />
              <Select.Indicator />
            </Select.Trigger>
            <Select.Popover>
              <ListBox>
                {banks.map((item) => (
                  <ListBox.Item key={item.id} id={item.id} textValue={item.name}>
                    {item.name}
                    <ListBox.ItemIndicator />
                  </ListBox.Item>
                ))}
              </ListBox>
            </Select.Popover>
          </Select>
          {binding && <Spinner size="sm" />}
          {bankQuestionCount !== null && (
            <span className="tabular rounded-lg bg-brand-500/10 px-2.5 py-1 text-xs font-semibold text-brand-600 dark:text-brand-300">
              {bankQuestionCount} 题
            </span>
          )}
          <Link
            to="/console/questions?tab=sets"
            className="ml-auto text-xs font-semibold text-brand-600 hover:underline dark:text-brand-300"
          >
            管理题目集 →
          </Link>
        </div>
        {!bank && (
          <p className="mt-3 flex items-center gap-1.5 text-xs text-amber-600 dark:text-amber-400">
            <Icon icon="lucide:triangle-alert" width={13} />
            未绑定题目集时，验收抽题将没有题目。
          </p>
        )}
      </div>

      <div className="mb-3 flex items-center gap-2 text-sm font-bold">
        <Icon icon="lucide:table" width={16} />
        学生得分
        <span className="tabular text-xs font-normal text-fg-subtle">{students.length} 人</span>
      </div>

      {students.length === 0 ? (
        <EmptyState
          icon="lucide:users"
          title="暂无学生"
          hint="请先到「分数和名单」导入学生名单"
        />
      ) : (
        <div className="max-h-[70vh] overflow-auto rounded-2xl border border-line">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr>
                <th className="sticky left-0 top-0 z-30 border-b border-r border-line bg-elevated px-4 py-2 text-left font-semibold">
                  学生
                </th>
                {SCORE_TYPES.map((type) => (
                  <th
                    key={type.value}
                    className="sticky top-0 z-20 border-b border-r border-line bg-elevated px-4 py-2 text-center font-semibold"
                  >
                    {type.label}
                  </th>
                ))}
                <th className="sticky top-0 z-20 border-b border-line bg-elevated px-4 py-2 text-center font-semibold">
                  总评
                </th>
              </tr>
            </thead>
            <tbody>
              {students.map((student) => (
                <tr key={student.stuId} className="transition-colors hover:bg-sunken/40">
                  <td className="sticky left-0 z-10 border-b border-r border-line bg-elevated px-4 py-2">
                    <div className="font-bold">{student.name}</div>
                    <div className="tabular text-xs text-fg-muted">{student.studentNo}</div>
                  </td>
                  {SCORE_TYPES.map((type) => {
                    const value = scoreOf(student.stuId, type.value)
                    return (
                      <td
                        key={type.value}
                        className="tabular border-b border-r border-line px-4 py-2 text-center"
                      >
                        {value ?? <span className="text-fg-subtle">—</span>}
                      </td>
                    )
                  })}
                  <td className="tabular border-b border-line px-4 py-2 text-center font-bold">
                    {totalOf(student.stuId)?.toFixed(1) ?? (
                      <span className="font-normal text-fg-subtle">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
