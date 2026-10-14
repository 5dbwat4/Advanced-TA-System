import { Alert, Button, Modal, Spinner, useOverlayState } from '@heroui/react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'

import ArrowDown from '~icons/lucide/arrow-down'
import ArrowUp from '~icons/lucide/arrow-up'
import ArrowUpDown from '~icons/lucide/arrow-up-down'
import FlaskConical from '~icons/lucide/flask-conical'
import ListPlus from '~icons/lucide/list-plus'
import RefreshCw from '~icons/lucide/refresh-cw'
import School from '~icons/lucide/school'
import TriangleAlert from '~icons/lucide/triangle-alert'
import UserRoundPlus from '~icons/lucide/user-round-plus'
import Users from '~icons/lucide/users'
import { ScoreCell } from '@/components/scores/ScoreCell'
import { EmptyState } from '@/components/ui/Card'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { IconAction } from '@/components/ui/IconAction'
import { PageHeader } from '@/components/ui/PageHeader'
import { PendingButton } from '@/components/ui/PendingButton'
import { SkeletonList } from '@/components/ui/SkeletonList'
import {
  apiFetch,
  ApiError,
  applyRoster,
  fetchClassSettings,
  fetchClassTables,
  previewRoster,
  type ClassSettings,
  type Experiment,
  type RosterDiff,
  type Score,
  type Student,
} from '@/lib/api'
import { useAuth } from '@/lib/auth'
import { getErrorMessage } from '@/lib/error'
import {
  connectScoreSocket,
  disconnectScoreSocket,
  subscribeScores,
  type ScoreChangeEvent,
} from '@/lib/realtime'
import { extraProjectNames, SCORE_TYPES, SCORE_TYPE_EXTRA, scoreKey } from '@/lib/scores'
import { resolveScoreRatio, weightedTotal } from '@/lib/scoring'
import { useCurrentClass, useHasXzzdPermission } from '@/lib/store'

function toScoreMap(scores: Score[]): Map<string, Score> {
  return new Map(scores.map((item) => [scoreKey(item.stuId, item.type, item.indId), item]))
}

type SortDir = 'asc' | 'desc'
type SortState = { key: string; dir: SortDir }

function SortIndicator({ dir }: { dir: SortDir | null }) {
  if (dir === 'asc') return <ArrowUp width={12} height={12} className="shrink-0" />
  if (dir === 'desc') return <ArrowDown width={12} height={12} className="shrink-0" />
  return (
    <ArrowUpDown
      width={12}
      height={12}
      className="shrink-0 opacity-30 transition-opacity group-hover/sort:opacity-70"
    />
  )
}

function SortButton({
  label,
  columnKey,
  sort,
  onToggle,
}: {
  label: string
  columnKey: string
  sort: SortState | null
  onToggle: (key: string) => void
}) {
  const active = sort?.key === columnKey
  return (
    <button
      type="button"
      onClick={() => onToggle(columnKey)}
      className="group/sort inline-flex items-center gap-1 rounded-md transition-colors hover:text-fg"
      aria-label={`按「${label}」排序`}
    >
      {label}
      <SortIndicator dir={active ? sort.dir : null} />
    </button>
  )
}

const STUDENT_SORT_KEY = 'student'

/** 排序键的分隔符：用不可见控制字符，避免实验 id / 项目名里出现冒号导致解析错位 */
const SORT_SEP = '\u0000'

/** 分数列的排序键（实验列与独立计分项目列共用） */
function scoreSortKey(indId: string, type: number): string {
  return `${indId}${SORT_SEP}${type}`
}

/** 依据排序状态返回排好序的学生列表；无分数的行始终排在末尾 */
function sortStudents(
  list: Student[],
  sort: SortState | null,
  scores: Map<string, Score>,
): Student[] {
  if (!sort) return list
  const factor = sort.dir === 'asc' ? 1 : -1
  const [indId, typePart] = sort.key === STUDENT_SORT_KEY ? [] : sort.key.split(SORT_SEP)
  const type = typePart === undefined ? undefined : Number(typePart)
  const byName = (a: Student, b: Student) => a.name.localeCompare(b.name, 'zh-Hans-CN')
  const compare = (a: Student, b: Student): number => {
    if (!indId || type === undefined) {
      const cmp = byName(a, b)
      return cmp !== 0 ? cmp * factor : a.studentNo.localeCompare(b.studentNo)
    }
    const va = scores.get(scoreKey(a.stuId, type, indId))?.score ?? null
    const vb = scores.get(scoreKey(b.stuId, type, indId))?.score ?? null
    if (va === null || vb === null) {
      if (va === null && vb === null) return byName(a, b)
      return va === null ? 1 : -1
    }
    return va !== vb ? (va - vb) * factor : byName(a, b)
  }
  // 就地构建新数组（不修改入参），避免 React Compiler 将入参判定为可变
  const out: Student[] = []
  for (const student of list) {
    let lo = 0
    let hi = out.length
    while (lo < hi) {
      const mid = (lo + hi) >> 1
      if (compare(out[mid], student) <= 0) lo = mid + 1
      else hi = mid
    }
    out.splice(lo, 0, student)
  }
  return out
}

const TH_STICKY =
  'sticky left-0 z-30 border-b border-r border-line bg-elevated px-4 py-2 text-left font-semibold'
const TH_CENTER = 'border-b border-r border-line bg-elevated px-4 py-2 text-center font-semibold'
const TH_SUB =
  'min-w-[5.5rem] border-b border-r border-line bg-elevated px-2 py-2 text-center text-xs font-medium text-fg-muted'

export default function Scores() {
  const currentClass = useCurrentClass()
  const classId = currentClass?.id ?? null
  const { refresh } = useAuth()
  const navigate = useNavigate()
  const hasXzzd = useHasXzzdPermission()
  const [students, setStudents] = useState<Student[]>([])
  const [experiments, setExperiments] = useState<Experiment[]>([])
  const [scores, setScores] = useState<Map<string, Score>>(new Map())
  const [classSettings, setClassSettings] = useState<ClassSettings | null>(null)
  const [ratioError, setRatioError] = useState(false)
  const [loading, setLoading] = useState(true)
  const [rosterBusy, setRosterBusy] = useState(false)
  const [pendingDiff, setPendingDiff] = useState<RosterDiff | null>(null)
  const [sort, setSort] = useState<SortState | null>(null)
  const [pendingRange, setPendingRange] = useState<{
    student: Student
    type: number
    indId: string
    score: number
  } | null>(null)
  const [rangeBusy, setRangeBusy] = useState(false)

  const toggleSort = useCallback((key: string) => {
    setSort((prev) => {
      if (!prev || prev.key !== key) return { key, dir: 'asc' }
      if (prev.dir === 'asc') return { key, dir: 'desc' }
      return null
    })
  }, [])

  const rosterState = useOverlayState({
    onOpenChange: (open) => {
      if (!open) setPendingDiff(null)
    },
  })

  const rangeState = useOverlayState({
    onOpenChange: (open) => {
      if (!open) setPendingRange(null)
    },
  })

  const reload = useCallback(async () => {
    try {
      const data = await fetchClassTables(classId ?? undefined)
      setStudents(data.students)
      setExperiments(data.experiments)
      setScores(toScoreMap(data.scores))
    } catch (error) {
      toast.error(getErrorMessage(error, '加载失败'))
    }
  }, [classId])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    const run = async () => {
      try {
        const data = await fetchClassTables(classId ?? undefined)
        if (cancelled) return
        setStudents(data.students)
        setExperiments(data.experiments)
        setScores(toScoreMap(data.scores))
      } catch (error) {
        if (!cancelled) toast.error(getErrorMessage(error, '加载失败'))
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    run()
    return () => {
      cancelled = true
    }
  }, [classId])

  useEffect(() => {
    if (!classId) {
      setClassSettings(null)
      return
    }
    let cancelled = false
    setRatioError(false)
    fetchClassSettings(classId)
      .then((res) => {
        if (!cancelled) setClassSettings(res.settings)
      })
      .catch(() => {
        if (!cancelled) setRatioError(true)
      })
    return () => {
      cancelled = true
    }
  }, [classId])

  useEffect(() => {
    const socket = connectScoreSocket()

    const handleConnect = () => {
      if (classId) subscribeScores(socket, classId)
      void reload()
    }

    const handleScoreChange = (event: ScoreChangeEvent) => {
      setScores((prev) => {
        const map = new Map(prev)
        if (event.action === 'upsert') {
          const { stuId, type, indId } = event.score
          map.set(scoreKey(stuId, type, indId), event.score)
        } else {
          map.delete(scoreKey(event.stuId, event.type, event.indId))
        }
        return map
      })
    }

    socket.on('connect', handleConnect)
    socket.on('score:change', handleScoreChange)

    return () => {
      socket.off('connect', handleConnect)
      socket.off('score:change', handleScoreChange)
      disconnectScoreSocket()
    }
  }, [reload, classId])

  const commitScore = useCallback(
    async (student: Student, type: number, indId: string, next: number | null) => {
      const key = scoreKey(student.stuId, type, indId)
      try {
        if (next === null) {
          await apiFetch<{ ok: true }>('/api/scores', {
            method: 'DELETE',
            body: JSON.stringify({ stuId: student.stuId, type, indId }),
          })
          setScores((prev) => {
            const map = new Map(prev)
            map.delete(key)
            return map
          })
        } else {
          const res = await apiFetch<{ score: Score }>('/api/scores', {
            method: 'PUT',
            body: JSON.stringify({ stuId: student.stuId, type, indId, score: next }),
          })
          setScores((prev) => {
            const map = new Map(prev)
            map.set(key, res.score)
            return map
          })
        }
      } catch (error) {
        toast.error(getErrorMessage(error, '保存失败'))
        throw error
      }
    },
    [],
  )

  const confirmOutOfRange = async () => {
    if (!pendingRange) return
    setRangeBusy(true)
    try {
      await commitScore(pendingRange.student, pendingRange.type, pendingRange.indId, pendingRange.score)
      rangeState.close()
    } catch {
      rangeState.close()
    } finally {
      setRangeBusy(false)
    }
  }

  const visibleStudents = useMemo(
    () => (currentClass ? students.filter((student) => student.classId === currentClass.id) : []),
    [students, currentClass],
  )

  const sortedStudents = useMemo(() => sortStudents(visibleStudents, sort, scores), [
    visibleStudents,
    sort,
    scores,
  ])

  const ariaSort = (key: string): 'ascending' | 'descending' | 'none' => {
    if (sort?.key !== key) return 'none'
    return sort.dir === 'asc' ? 'ascending' : 'descending'
  }

  const classExperiments = currentClass
    ? experiments.filter((exp) => exp.classId === currentClass.id)
    : []

  /** 独立计分项目（type=3）的项目名列表，由现有分数推导 */
  const extraProjects = useMemo(() => extraProjectNames(scores.values()), [scores])

  /** 按该实验的评分占比现场计算总评；缺任一计入项时为 null */
  const experimentTotal = (student: Student, experiment: Experiment) =>
    weightedTotal(
      SCORE_TYPES.map(
        (type) => scores.get(scoreKey(student.stuId, type.value, experiment.id))?.score ?? null,
      ),
      resolveScoreRatio(classSettings, experiment.id),
    )

  const importRoster = useCallback(async () => {
    if (!currentClass) return
    setRosterBusy(true)
    try {
      const diff = await previewRoster(currentClass.id)
      if (diff.added.length === 0 && diff.removed.length === 0) {
        toast.success('名单已是最新')
        return
      }
      if (visibleStudents.length === 0) {
        await applyRoster(currentClass.id, {
          added: diff.added,
          removed: diff.removed.map((item) => item.studentNo),
        })
        toast.success('名单已导入')
        await refresh()
        await reload()
        return
      }
      setPendingDiff(diff)
      rosterState.open()
    } catch (error) {
      toast.error(getErrorMessage(error, '操作失败'))
    } finally {
      setRosterBusy(false)
    }
  }, [currentClass, visibleStudents.length, refresh, reload, rosterState])

  const confirmRoster = useCallback(async () => {
    if (!currentClass || !pendingDiff) return
    setRosterBusy(true)
    try {
      await applyRoster(currentClass.id, {
        added: pendingDiff.added,
        removed: pendingDiff.removed.map((item) => item.studentNo),
        expectedSyncAt: currentClass.lastRosterSyncAt ?? undefined,
      })
      toast.success('名单已更新')
      await refresh()
      await reload()
      rosterState.close()
    } catch (error) {
      if (error instanceof ApiError && error.code === 'ROSTER_STALE') {
        toast.error(error.message)
        rosterState.close()
        await refresh()
        return
      }
      toast.error(getErrorMessage(error, '操作失败'))
    } finally {
      setRosterBusy(false)
    }
  }, [currentClass, pendingDiff, refresh, reload, rosterState])

  const rosterLabel = visibleStudents.length > 0 ? '更新名单' : '导入学生名单'

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title="分数和名单"
        actions={
          <>
            {currentClass && (
              <Button
                size="sm"
                variant="secondary"
                onPress={() => navigate('/console/scores/standalone')}
              >
                <ListPlus width={15} height={15} className="shrink-0" />
                独立计分项目
              </Button>
            )}
            {hasXzzd && currentClass && (
              <Button
                size="sm"
                variant="secondary"
                isPending={rosterBusy}
                onPress={() => void importRoster()}
              >
                {({ isPending }) => (
                  <>
                    {isPending ? (
                      <Spinner color="current" size="sm" />
                    ) : (
                      <UserRoundPlus width={15} height={15} className="shrink-0" />
                    )}
                    {rosterLabel}
                  </>
                )}
              </Button>
            )}
            <IconAction label="刷新" isDisabled={loading} onPress={reload}>
              <RefreshCw width={15} height={15} className="shrink-0" />
            </IconAction>
          </>
        }
      />

      <Modal state={rosterState}>
        <Modal.Backdrop>
          <Modal.Container>
            <Modal.Dialog className="sm:max-w-md">
              <Modal.CloseTrigger />
              <Modal.Header>
                <Modal.Icon className="bg-danger/10 text-danger">
                  <UserRoundPlus width={18} height={18} className="shrink-0" />
                </Modal.Icon>
                <Modal.Heading>更新名单</Modal.Heading>
              </Modal.Header>
              <Modal.Body className="flex flex-col gap-4">
                {pendingDiff && (
                  <>
                    <div className="flex flex-col gap-2">
                      <div className="text-sm font-semibold text-fg">
                        新增 {pendingDiff.added.length} 人
                      </div>
                      {pendingDiff.added.length === 0 ? (
                        <div className="rounded-xl border border-dashed border-line py-4 text-center text-xs text-fg-subtle">
                          无新增学生
                        </div>
                      ) : (
                        <div className="flex max-h-40 flex-col gap-1 overflow-auto">
                          {pendingDiff.added.map((entry) => (
                            <div
                              key={entry.studentNo}
                              className="flex items-center gap-3 rounded-xl border border-line bg-sunken px-3 py-2"
                            >
                              <div className="min-w-0 flex-1 truncate text-sm font-semibold">
                                {entry.name}
                              </div>
                              <span className="tabular shrink-0 text-xs text-fg-subtle">
                                {entry.studentNo}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    <div className="flex flex-col gap-2">
                      <div className="text-sm font-semibold text-fg">
                        移除 {pendingDiff.removed.length} 人
                      </div>
                      {pendingDiff.removed.length === 0 ? (
                        <div className="rounded-xl border border-dashed border-line py-4 text-center text-xs text-fg-subtle">
                          无移除学生
                        </div>
                      ) : (
                        <>
                          <div className="flex max-h-40 flex-col gap-1 overflow-auto">
                            {pendingDiff.removed.map((entry) => (
                              <div
                                key={entry.studentNo}
                                className="flex items-center gap-3 rounded-xl border border-line bg-sunken px-3 py-2"
                              >
                                <div className="min-w-0 flex-1 truncate text-sm font-semibold">
                                  {entry.name}
                                </div>
                                <span className="tabular shrink-0 text-xs text-fg-subtle">
                                  {entry.studentNo}
                                </span>
                              </div>
                            ))}
                          </div>
                          <p className="text-xs text-danger">
                            移除将删除这些学生及其全部分数，操作不可撤销。
                          </p>
                        </>
                      )}
                    </div>
                  </>
                )}
              </Modal.Body>
              <Modal.Footer>
                <Button slot="close" variant="secondary">
                  取消
                </Button>
                <PendingButton
                  variant="danger"
                  isPending={rosterBusy}
                  onPress={() => void confirmRoster()}
                >
                  更新名单
                </PendingButton>
              </Modal.Footer>
            </Modal.Dialog>
          </Modal.Container>
        </Modal.Backdrop>
      </Modal>

      <ConfirmDialog
        state={rangeState}
        icon={TriangleAlert}
        tone="brand"
        title="分数超出范围"
        description="你确定要将分数值设置为在0~100以外的数目吗？"
        confirmLabel="确定"
        isPending={rangeBusy}
        onConfirm={() => void confirmOutOfRange()}
      />

      {loading ? (
        <SkeletonList rows={5} className="h-12 rounded-xl" />
      ) : !currentClass ? (
        <EmptyState icon={School} title="尚未绑定班级" hint="请先在设置中绑定班级" />
      ) : (
        <>
          <div className="mb-4 flex flex-wrap items-center gap-3">
            <span className="text-sm font-semibold text-fg">{currentClass.name}</span>
            <span className="tabular text-xs text-fg-subtle">{visibleStudents.length} 人</span>
            <span className="text-xs text-fg-subtle">
              {currentClass.lastRosterSyncAt
                ? `名单更新于 ${new Date(currentClass.lastRosterSyncAt).toLocaleString()}`
                : '尚未同步名单'}
            </span>
          </div>

          {ratioError && (
            <Alert className="mb-4" status="warning">
              <Alert.Indicator />
              <Alert.Content>
                <Alert.Description>
                  评分占比加载失败，总评按默认占比 2:5:0 估算，仅供参考
                </Alert.Description>
              </Alert.Content>
            </Alert>
          )}

          {classExperiments.length === 0 && extraProjects.length === 0 ? (
            <EmptyState icon={FlaskConical} title="暂无实验" hint="请先在实验页创建实验" />
          ) : students.length === 0 ? (
            <EmptyState icon={Users} title="暂无学生" hint="请先导入学生名单" />
          ) : (
            <div className="max-h-[70vh] overflow-auto rounded-2xl border border-line">
              <table className="w-full border-separate border-spacing-0 text-sm">
                <thead className="sticky top-0 z-20">
                  <tr>
                    <th
                      rowSpan={2}
                      aria-sort={ariaSort(STUDENT_SORT_KEY)}
                      className={TH_STICKY}
                    >
                      <SortButton
                        label="学生"
                        columnKey={STUDENT_SORT_KEY}
                        sort={sort}
                        onToggle={toggleSort}
                      />
                    </th>
                    {classExperiments.map((exp) => (
                      <th
                        key={exp.id}
                        colSpan={SCORE_TYPES.length + 1}
                        className={TH_CENTER}
                      >
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
                    {classExperiments.flatMap((exp) => [
                      ...SCORE_TYPES.map((type) => (
                        <th
                          key={`${exp.id}:${type.value}`}
                          aria-sort={ariaSort(scoreSortKey(exp.id, type.value))}
                          className={TH_SUB}
                        >
                          <SortButton
                            label={type.label}
                            columnKey={scoreSortKey(exp.id, type.value)}
                            sort={sort}
                            onToggle={toggleSort}
                          />
                        </th>
                      )),
                      <th key={`${exp.id}:total`} className={TH_SUB}>
                        总评
                      </th>,
                    ])}
                    {extraProjects.map((name) => (
                      <th
                        key={`extra:${name}`}
                        aria-sort={ariaSort(scoreSortKey(name, SCORE_TYPE_EXTRA))}
                        className={TH_SUB}
                      >
                        <SortButton
                          label={name}
                          columnKey={scoreSortKey(name, SCORE_TYPE_EXTRA)}
                          sort={sort}
                          onToggle={toggleSort}
                        />
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {sortedStudents.map((student) => (
                    <tr key={student.stuId} className="transition-colors hover:bg-sunken/40">
                      <td className="sticky left-0 z-10 border-b border-r border-line bg-elevated px-4 py-2">
                        <div className="font-bold">{student.name}</div>
                        <div className="tabular text-xs text-fg-muted">{student.studentNo}</div>
                      </td>
                      {classExperiments.flatMap((exp) => {
                        const total = experimentTotal(student, exp)
                        return [
                          ...SCORE_TYPES.map((type) => {
                            const key = scoreKey(student.stuId, type.value, exp.id)
                            return (
                              <td
                                key={key}
                                className="min-w-[5.5rem] border-b border-r border-line px-2 py-1.5 text-center"
                              >
                                <ScoreCell
                                  score={scores.get(key) ?? null}
                                  onCommit={(next) => commitScore(student, type.value, exp.id, next)}
                                  onOutOfRange={(next) => {
                                    setPendingRange({
                                      student,
                                      type: type.value,
                                      indId: exp.id,
                                      score: next,
                                    })
                                    rangeState.open()
                                  }}
                                />
                              </td>
                            )
                          }),
                          <td
                            key={`${exp.id}:total`}
                            className="tabular min-w-[5.5rem] border-b border-r border-line px-2 py-1.5 text-center font-bold"
                          >
                            {total == null ? (
                              <span className="font-normal text-fg-subtle">—</span>
                            ) : (
                              total.toFixed(1)
                            )}
                          </td>,
                        ]
                      })}
                      {extraProjects.map((name) => {
                        const key = scoreKey(student.stuId, SCORE_TYPE_EXTRA, name)
                        return (
                          <td
                            key={`extra:${name}`}
                            className="min-w-[5.5rem] border-b border-r border-line px-2 py-1.5 text-center"
                          >
                            <ScoreCell
                              score={scores.get(key) ?? null}
                              onCommit={(next) =>
                                commitScore(student, SCORE_TYPE_EXTRA, name, next)
                              }
                              onOutOfRange={(next) => {
                                setPendingRange({
                                  student,
                                  type: SCORE_TYPE_EXTRA,
                                  indId: name,
                                  score: next,
                                })
                                rangeState.open()
                              }}
                            />
                          </td>
                        )
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  )
}
