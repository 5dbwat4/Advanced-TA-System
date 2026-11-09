import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'

import RefreshCw from '~icons/lucide/refresh-cw'
import School from '~icons/lucide/school'
import UserSearch from '~icons/lucide/user-search'
import { EmptyState } from '@/components/ui/Card'
import { IconAction } from '@/components/ui/IconAction'
import { PageHeader } from '@/components/ui/PageHeader'
import { SearchInput } from '@/components/ui/SearchInput'
import { SkeletonList } from '@/components/ui/SkeletonList'
import {
  fetchClassTables,
  listFocusStudents,
  type ClassTables,
  type FocusStudent,
  type Score,
} from '@/lib/api'
import { matchStudent } from '@/lib/pinyin'
import { useAsyncData } from '@/lib/request'
import { SCORE_TYPES, scoreKey } from '@/lib/scores'
import { useCurrentClass } from '@/lib/store'

const TH = 'border-b border-r border-line bg-elevated px-4 py-2 text-left font-semibold'
const TH_STICKY =
  'sticky left-0 z-30 whitespace-nowrap border-b border-r border-line bg-elevated px-4 py-2 text-left font-semibold'
const TH_CENTER = 'border-b border-r border-line bg-elevated px-4 py-2 text-center font-semibold'
const TH_SUB =
  'min-w-[5.5rem] border-b border-r border-line bg-elevated px-2 py-2 text-center text-xs font-medium text-fg-muted'

type ViewerFocusData = { focusStudents: FocusStudent[]; tables: ClassTables | null }

export default function ViewerFocusStudents() {
  const currentClass = useCurrentClass()
  const classId = currentClass?.id ?? null
  const [query, setQuery] = useState('')

  const { data, error, loading, reload } = useAsyncData<ViewerFocusData>(async () => {
    if (!classId) return { focusStudents: [], tables: null }
    const [focus, tables] = await Promise.all([
      listFocusStudents(classId),
      fetchClassTables(classId),
    ])
    return { focusStudents: focus.focusStudents, tables }
  }, [classId])

  useEffect(() => {
    if (error) toast.error(error)
  }, [error])

  const focusStudents = useMemo(() => data?.focusStudents ?? [], [data])

  const experiments = useMemo(
    () => (data?.tables?.experiments ?? []).filter((item) => item.classId === classId),
    [data, classId],
  )

  const scores = useMemo(
    () =>
      new Map<string, Score>(
        (data?.tables?.scores ?? []).map((item) => [
          scoreKey(item.userId, item.type, item.indId),
          item,
        ]),
      ),
    [data],
  )

  const rows = useMemo(
    () =>
      focusStudents.filter((item) =>
        matchStudent(query, item.student ?? { name: '', studentId: '' }),
      ),
    [focusStudents, query],
  )

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title="重点关注对象"
        actions={
          <>
            <SearchInput
              value={query}
              onChange={setQuery}
              placeholder="搜索姓名 / 学号"
              ariaLabel="搜索重点关注对象"
              className="w-48"
            />
            <IconAction label="刷新" isDisabled={loading} onPress={reload}>
              <RefreshCw width={15} height={15} className="shrink-0" />
            </IconAction>
          </>
        }
      />

      {!classId ? (
        <EmptyState icon={School} title="未绑定班级" hint="当前观察者账号尚未加入任何课程" />
      ) : loading ? (
        <SkeletonList rows={5} className="h-12 rounded-xl" />
      ) : focusStudents.length === 0 ? (
        <EmptyState icon={UserSearch} title="暂无重点关注对象" hint="该课程还没有重点关注学生" />
      ) : rows.length === 0 ? (
        <EmptyState icon={UserSearch} title="未找到匹配的学生" hint="试试其他姓名、学号或拼音" />
      ) : (
        <>
          <div className="mb-3 text-xs text-fg-subtle">
            共 {focusStudents.length} 人{query.trim() ? `，匹配 ${rows.length} 人` : ''}
          </div>
          <div className="max-h-[70vh] overflow-auto rounded-2xl border border-line">
            <table className="w-full border-separate border-spacing-0 text-sm">
              <colgroup>
                <col className="w-40" />
                <col className="w-36" />
                <col className="w-72" />
                {experiments.flatMap((experiment) =>
                  SCORE_TYPES.map((type) => (
                    <col key={`${experiment.id}:${type.value}`} className="w-20" />
                  )),
                )}
                <col />
              </colgroup>
              <thead className="sticky top-0 z-20">
                <tr>
                  <th rowSpan={2} className={TH_STICKY}>
                    姓名
                  </th>
                  <th rowSpan={2} className={TH}>
                    学号
                  </th>
                  <th rowSpan={2} className={TH}>
                    重点关注原因
                  </th>
                  {experiments.map((experiment) => (
                    <th
                      key={experiment.id}
                      colSpan={SCORE_TYPES.length}
                      className={TH_CENTER}
                    >
                      {experiment.mark} · {experiment.title}
                    </th>
                  ))}
                </tr>
                <tr>
                  {experiments.flatMap((experiment) =>
                    SCORE_TYPES.map((type) => (
                      <th key={`${experiment.id}:${type.value}`} className={TH_SUB}>
                        {type.label}
                      </th>
                    )),
                  )}
                </tr>
              </thead>
              <tbody>
                {rows.map((item) => {
                  const name = item.student?.name ?? '—'
                  return (
                    <tr key={item.id} className="transition-colors hover:bg-sunken/40">
                      <td className="sticky left-0 z-10 whitespace-nowrap border-b border-r border-line bg-elevated px-4 py-2">
                        <Link
                          to={`/viewer/scores/students/${item.userId}`}
                          className="block font-bold transition-colors hover:text-brand-600 dark:hover:text-brand-300"
                          title="查看学情报告"
                        >
                          {name}
                        </Link>
                      </td>
                      <td className="tabular border-b border-r border-line px-4 py-2 text-fg-muted">
                        {item.student?.studentId || '—'}
                      </td>
                      <td className="border-b border-r border-line px-4 py-2">
                        {item.reason ? (
                          <div
                            className="max-w-[16rem] truncate text-fg-muted"
                            title={item.reason}
                          >
                            {item.reason}
                          </div>
                        ) : (
                          <span className="text-fg-subtle">—</span>
                        )}
                      </td>
                      {experiments.flatMap((experiment) =>
                        SCORE_TYPES.map((type) => {
                          const value = scores.get(
                            scoreKey(item.userId, type.value, experiment.id),
                          )
                          return (
                            <td
                              key={`${item.userId}:${experiment.id}:${type.value}`}
                              className="tabular min-w-[5.5rem] border-b border-r border-line px-2 py-1.5 text-center"
                            >
                              {value ? (
                                value.score
                              ) : (
                                <span className="text-fg-subtle">—</span>
                              )}
                            </td>
                          )
                        }),
                      )}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}
