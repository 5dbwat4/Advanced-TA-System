import { Tooltip } from '@heroui/react'
import { useEffect, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'

import FlaskConical from '~icons/lucide/flask-conical'
import RefreshCw from '~icons/lucide/refresh-cw'
import School from '~icons/lucide/school'
import Users from '~icons/lucide/users'
import { EmptyState } from '@/components/ui/Card'
import { IconAction } from '@/components/ui/IconAction'
import { PageHeader } from '@/components/ui/PageHeader'
import { SkeletonList } from '@/components/ui/SkeletonList'
import { fetchClassTables, type Score } from '@/lib/api'
import { formatLocaleDateTime } from '@/lib/format'
import { useAsyncData } from '@/lib/request'
import { extraProjectNames, SCORE_TYPES, SCORE_TYPE_EXTRA, scoreKey } from '@/lib/scores'
import { useCurrentClass } from '@/lib/store'

const TH_STICKY =
  'sticky left-0 z-30 whitespace-nowrap border-b border-r border-line bg-elevated px-4 py-2 text-left font-semibold'
const TH_CENTER = 'border-b border-r border-line bg-elevated px-4 py-2 text-center font-semibold'
const TH_SUB =
  'min-w-[5.5rem] border-b border-r border-line bg-elevated px-2 py-2 text-center text-xs font-medium text-fg-muted'

function ScoreValue({ score }: { score: Score | undefined }) {
  if (!score) return <span className="text-fg-subtle">—</span>
  if (!score.graderName) return <span>{score.score}</span>

  return (
    <Tooltip closeDelay={0} delay={200}>
      <Tooltip.Trigger className="tabular inline-block">{score.score}</Tooltip.Trigger>
      <Tooltip.Content placement="top" showArrow>
        {`最后由 ${score.graderName} 于 ${formatLocaleDateTime(score.updatedAt)} 更新`}
      </Tooltip.Content>
    </Tooltip>
  )
}

export default function ViewerScores() {
  const currentClass = useCurrentClass()
  const classId = currentClass?.id ?? null

  const { data, error, loading, reload } = useAsyncData(
    () => fetchClassTables(classId ?? undefined),
    [classId],
  )

  useEffect(() => {
    if (error) toast.error(error)
  }, [error])

  const scores = useMemo(
    () =>
      new Map<string, Score>(
        (data?.scores ?? []).map((item) => [scoreKey(item.userId, item.type, item.indId), item]),
      ),
    [data],
  )

  const students = useMemo(() => {
    const list = data?.students ?? []
    return classId ? list.filter((student) => student.classId === classId) : list
  }, [data, classId])

  const experiments = useMemo(() => {
    const list = data?.experiments ?? []
    return classId ? list.filter((experiment) => experiment.classId === classId) : list
  }, [data, classId])

  const extraProjects = useMemo(() => extraProjectNames(scores.values()), [scores])

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title="分数列表"
        actions={
          <IconAction label="刷新" isDisabled={loading} onPress={reload}>
            <RefreshCw width={15} height={15} className="shrink-0" />
          </IconAction>
        }
      />

      {!classId ? (
        <EmptyState icon={School} title="未绑定班级" hint="当前观察者账号尚未加入任何课程" />
      ) : loading ? (
        <SkeletonList rows={5} className="h-12 rounded-xl" />
      ) : experiments.length === 0 && extraProjects.length === 0 ? (
        <EmptyState icon={FlaskConical} title="暂无实验" hint="该课程还未创建实验" />
      ) : students.length === 0 ? (
        <EmptyState icon={Users} title="暂无学生" hint="该课程还没有学生名单" />
      ) : (
        <div className="max-h-[70vh] overflow-auto rounded-2xl border border-line bg-elevated">
          <table className="w-full border-separate border-spacing-0 text-sm">
            <thead className="sticky top-0 z-20">
              <tr>
                <th rowSpan={2} className={TH_STICKY}>
                  学生
                </th>
                {experiments.map((exp) => (
                  <th key={exp.id} colSpan={SCORE_TYPES.length} className={TH_CENTER}>
                    {exp.mark} · {exp.title}
                  </th>
                ))}
                {extraProjects.length > 0 && (
                  <th colSpan={extraProjects.length} className={TH_CENTER}>
                    独立计分项目
                  </th>
                )}
              </tr>
              <tr>
                {experiments.flatMap((exp) =>
                  SCORE_TYPES.map((type) => (
                    <th key={`${exp.id}:${type.value}`} className={TH_SUB}>
                      {type.label}
                    </th>
                  )),
                )}
                {extraProjects.map((name) => (
                  <th key={`extra:${name}`} className={TH_SUB}>
                    {name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {students.map((student) => (
                <tr key={student.userId} className="transition-colors hover:bg-sunken/40">
                  <td className="sticky left-0 z-10 whitespace-nowrap border-b border-r border-line bg-elevated px-4 py-2">
                    <Link
                      to={`/viewer/scores/students/${student.userId}`}
                      className="block transition-colors hover:text-brand-600 dark:hover:text-brand-300"
                      title="查看学生详情"
                    >
                      <div className="font-bold">{student.name}</div>
                      <div className="tabular text-xs text-fg-muted">{student.studentId || '—'}</div>
                    </Link>
                  </td>
                  {experiments.flatMap((exp) =>
                    SCORE_TYPES.map((type) => {
                      const value = scores.get(scoreKey(student.userId, type.value, exp.id))
                      return (
                        <td
                          key={`${student.userId}:${exp.id}:${type.value}`}
                          className="tabular min-w-[5.5rem] border-b border-r border-line px-2 py-1.5 text-center"
                        >
                          <ScoreValue score={value} />
                        </td>
                      )
                    }),
                  )}
                  {extraProjects.map((name) => {
                    const value = scores.get(
                      scoreKey(student.userId, SCORE_TYPE_EXTRA, name),
                    )
                    return (
                      <td
                        key={`${student.userId}:extra:${name}`}
                        className="tabular min-w-[5.5rem] border-b border-r border-line px-2 py-1.5 text-center"
                      >
                        <ScoreValue score={value} />
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
