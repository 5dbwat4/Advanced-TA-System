import { Button, Input, Modal, Skeleton, Spinner, Tooltip, useOverlayState } from '@heroui/react'
import { useCallback, useEffect, useMemo, useState, type KeyboardEvent } from 'react'
import { toast } from 'sonner'

import ArrowDown from '~icons/lucide/arrow-down'
import ArrowUp from '~icons/lucide/arrow-up'
import ArrowUpDown from '~icons/lucide/arrow-up-down'
import FlaskConical from '~icons/lucide/flask-conical'
import RefreshCw from '~icons/lucide/refresh-cw'
import School from '~icons/lucide/school'
import UserRoundPlus from '~icons/lucide/user-round-plus'
import Users from '~icons/lucide/users'
import { EmptyState } from '@/components/ui/Card'
import { PageHeader } from '@/components/ui/PageHeader'
import {
  apiFetch,
  applyRoster,
  fetchClassSettings,
  previewRoster,
  type ClassSettings,
  type Experiment,
  type RosterDiff,
  type Score,
  type Student,
} from '@/lib/api'
import { useAuth } from '@/lib/auth'
import {
  connectScoreSocket,
  disconnectScoreSocket,
  subscribeScores,
  type ScoreChangeEvent,
} from '@/lib/realtime'
import { SCORE_MAX, SCORE_TYPES, scoreKey } from '@/lib/scores'
import { resolveScoreRatio, weightedTotal } from '@/lib/scoring'
import { useCurrentClass, useHasXzzdPermission } from '@/lib/store'
import { cn } from '@/lib/utils'

type ScoreData = {
  students: Student[]
  experiments: Experiment[]
  scores: Score[]
}

async function fetchAll(): Promise<ScoreData> {
  const [studentRes, experimentRes, scoreRes] = await Promise.all([
    apiFetch<{ students: Student[] }>('/api/students'),
    apiFetch<{ experiments: Experiment[] }>('/api/experiments'),
    apiFetch<{ scores: Score[] }>('/api/scores'),
  ])
  return {
    students: studentRes.students,
    experiments: experimentRes.experiments,
    scores: scoreRes.scores,
  }
}

function toScoreMap(scores: Score[]): Map<string, Score> {
  return new Map(scores.map((item) => [scoreKey(item.stuId, item.type, item.indId), item]))
}

/** 形如 2026/9/24 21:51 */
function formatUpdatedAt(value: string): string {
  return new Date(value).toLocaleString('zh-CN', {
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
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

/** 依据排序状态返回排好序的学生列表；无分数的行始终排在末尾 */
function sortStudents(
  list: Student[],
  sort: SortState | null,
  scores: Map<string, Score>,
): Student[] {
  if (!sort) return list
  const factor = sort.dir === 'asc' ? 1 : -1
  const [expId, typePart] = sort.key === STUDENT_SORT_KEY ? [] : sort.key.split(':')
  const type = typePart === undefined ? undefined : Number(typePart)
  const byName = (a: Student, b: Student) => a.name.localeCompare(b.name, 'zh-Hans-CN')
  const compare = (a: Student, b: Student): number => {
    if (!expId || type === undefined) {
      const cmp = byName(a, b)
      return cmp !== 0 ? cmp * factor : a.studentNo.localeCompare(b.studentNo)
    }
    const va = scores.get(scoreKey(a.stuId, type, expId))?.score ?? null
    const vb = scores.get(scoreKey(b.stuId, type, expId))?.score ?? null
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

function ScoreCell({
  score,
  onCommit,
}: {
  score: Score | null
  onCommit: (next: number | null) => Promise<void>
}) {
  const value = score?.score ?? null
  const [draft, setDraft] = useState(value === null ? '' : String(value))
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    setDraft(value === null ? '' : String(value))
  }, [value])

  const current = value === null ? '' : String(value)

  const commit = async () => {
    const trimmed = draft.trim()
    if (trimmed === current) return
    if (trimmed === '') {
      setSaving(true)
      try {
        await onCommit(null)
      } catch {
        setDraft(current)
      } finally {
        setSaving(false)
      }
      return
    }
    const parsed = Number(trimmed)
    if (Number.isNaN(parsed) || parsed < 0 || parsed > SCORE_MAX) {
      toast.error(`请输入 0~${SCORE_MAX} 的分数`)
      setDraft(current)
      return
    }
    setSaving(true)
    try {
      await onCommit(parsed)
    } catch {
      setDraft(current)
    } finally {
      setSaving(false)
    }
  }

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault()
      event.currentTarget.blur()
    } else if (event.key === 'Escape') {
      setDraft(current)
      event.currentTarget.blur()
    }
  }

  const input = (
    <Input
      type="number"
      min={0}
      max={SCORE_MAX}
      step="1"
      value={draft}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={commit}
      onKeyDown={onKeyDown}
      aria-label="分数"
      className={cn(
        'tabular w-16 rounded-lg border border-line bg-elevated px-2 py-1 text-center text-sm outline-none transition-all focus:border-brand-500 focus:ring-2 focus:ring-brand-500/15',
        saving && 'opacity-50',
      )}
    />
  )

  if (!score || !score.graderName) return input

  return (
    <Tooltip closeDelay={0} delay={200}>
      <Tooltip.Trigger className="inline-block">{input}</Tooltip.Trigger>
      <Tooltip.Content placement="top" showArrow>
        {`最后由 ${score.graderName} 于 ${formatUpdatedAt(score.updatedAt)} 更新`}
      </Tooltip.Content>
    </Tooltip>
  )
}

export default function Scores() {
  const currentClass = useCurrentClass()
  const classId = currentClass?.id ?? null
  const { refresh } = useAuth()
  const hasXzzd = useHasXzzdPermission()
  const [students, setStudents] = useState<Student[]>([])
  const [experiments, setExperiments] = useState<Experiment[]>([])
  const [scores, setScores] = useState<Map<string, Score>>(new Map())
  const [classSettings, setClassSettings] = useState<ClassSettings | null>(null)
  const [loading, setLoading] = useState(true)
  const [rosterBusy, setRosterBusy] = useState(false)
  const [pendingDiff, setPendingDiff] = useState<RosterDiff | null>(null)
  const [sort, setSort] = useState<SortState | null>(null)

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

  const reload = useCallback(async () => {
    try {
      const data = await fetchAll()
      setStudents(data.students)
      setExperiments(data.experiments)
      setScores(toScoreMap(data.scores))
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '加载失败')
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    const run = async () => {
      try {
        const data = await fetchAll()
        if (cancelled) return
        setStudents(data.students)
        setExperiments(data.experiments)
        setScores(toScoreMap(data.scores))
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

  useEffect(() => {
    if (!classId) {
      setClassSettings(null)
      return
    }
    let cancelled = false
    fetchClassSettings(classId)
      .then((res) => {
        if (!cancelled) setClassSettings(res.settings)
      })
      .catch(() => {
        // 占比缺失时回退默认，不影响分数编辑
      })
    return () => {
      cancelled = true
    }
  }, [classId])

  useEffect(() => {
    const socket = connectScoreSocket()

    const handleConnect = () => {
      subscribeScores(socket)
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

    const handleReady = () => undefined

    socket.on('connect', handleConnect)
    socket.on('score:change', handleScoreChange)
    socket.on('scores:ready', handleReady)

    return () => {
      socket.off('connect', handleConnect)
      socket.off('score:change', handleScoreChange)
      socket.off('scores:ready', handleReady)
      disconnectScoreSocket()
    }
  }, [reload])

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
        toast.error(error instanceof Error ? error.message : '保存失败')
        throw error
      }
    },
    [],
  )

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
      toast.error(error instanceof Error ? error.message : '操作失败')
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
      })
      toast.success('名单已更新')
      await refresh()
      await reload()
      rosterState.close()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '操作失败')
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
            <Button size="sm" variant="ghost" isDisabled={loading} onPress={reload}>
              <RefreshCw width={15} height={15} className="shrink-0" />
              刷新
            </Button>
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
                <Button
                  variant="danger"
                  isPending={rosterBusy}
                  onPress={() => void confirmRoster()}
                >
                  {({ isPending }) => (
                    <>
                      {isPending && <Spinner color="current" size="sm" />}
                      更新名单
                    </>
                  )}
                </Button>
              </Modal.Footer>
            </Modal.Dialog>
          </Modal.Container>
        </Modal.Backdrop>
      </Modal>

      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-12 rounded-xl" />
          ))}
        </div>
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

          {classExperiments.length === 0 ? (
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
                      className="sticky left-0 z-30 border-b border-r border-line bg-elevated px-4 py-2 text-left font-semibold"
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
                        className="border-b border-r border-line bg-elevated px-4 py-2 text-center font-semibold"
                      >
                        {exp.mark} · {exp.title}
                      </th>
                    ))}
                  </tr>
                  <tr>
                    {classExperiments.flatMap((exp) => [
                      ...SCORE_TYPES.map((type) => (
                        <th
                          key={`${exp.id}:${type.value}`}
                          aria-sort={ariaSort(`${exp.id}:${type.value}`)}
                          className="min-w-[5.5rem] border-b border-r border-line bg-elevated px-2 py-2 text-center text-xs font-medium text-fg-muted"
                        >
                          <SortButton
                            label={type.label}
                            columnKey={`${exp.id}:${type.value}`}
                            sort={sort}
                            onToggle={toggleSort}
                          />
                        </th>
                      )),
                      <th
                        key={`${exp.id}:total`}
                        className="min-w-[5.5rem] border-b border-r border-line bg-elevated px-2 py-2 text-center text-xs font-medium text-fg-muted"
                      >
                        总评
                      </th>,
                    ])}
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
