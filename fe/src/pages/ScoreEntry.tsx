import {
  Button,
  Input,
  ListBox,
  Modal,
  Select,
  ToggleButton,
  ToggleButtonGroup,
  useOverlayState,
} from '@heroui/react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'

import ArrowLeft from '~icons/lucide/arrow-left'
import Layers from '~icons/lucide/layers'
import ListChecks from '~icons/lucide/list-checks'
import ListPlus from '~icons/lucide/list-plus'
import Pencil from '~icons/lucide/pencil'
import Plus from '~icons/lucide/plus'
import School from '~icons/lucide/school'
import Search from '~icons/lucide/search'
import Target from '~icons/lucide/target'
import TriangleAlert from '~icons/lucide/triangle-alert'
import Users from '~icons/lucide/users'
import { ScoreCell } from '@/components/scores/ScoreCell'
import { Card, EmptyState } from '@/components/ui/Card'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { IconAction } from '@/components/ui/IconAction'
import { PageHeader } from '@/components/ui/PageHeader'
import { SkeletonList } from '@/components/ui/SkeletonList'
import { apiFetch, fetchClassTables, type Score, type Student } from '@/lib/api'
import { getErrorMessage } from '@/lib/error'
import { matchStudent } from '@/lib/pinyin'
import { useQuickScores } from '@/lib/quick-scores'
import {
  connectScoreSocket,
  disconnectScoreSocket,
  subscribeScores,
  type ScoreChangeEvent,
} from '@/lib/realtime'
import { extraProjectNames, SCORE_LIMIT, SCORE_MAX, SCORE_TYPE_EXTRA, scoreKey } from '@/lib/scores'
import { useCurrentClass } from '@/lib/store'

function toScoreMap(scores: Score[]): Map<string, Score> {
  return new Map(scores.map((item) => [scoreKey(item.stuId, item.type, item.indId), item]))
}

/** 独立计分项目（type=3）的分数录入页：左侧全部学生 + 搜索，右侧「将分数应用于…」 */
export default function ScoreEntry() {
  const currentClass = useCurrentClass()
  const classId = currentClass?.id ?? null
  const navigate = useNavigate()

  const [students, setStudents] = useState<Student[]>([])
  const [scores, setScores] = useState<Map<string, Score>>(new Map())
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [newName, setNewName] = useState('')
  const [applyValue, setApplyValue] = useState('')
  const [targetQuery, setTargetQuery] = useState('')
  const [applying, setApplying] = useState(false)
  const { values: quickScores, save: saveQuickScores } = useQuickScores()
  const [editingQuick, setEditingQuick] = useState(false)
  const [quickDraft, setQuickDraft] = useState('')
  const [pendingRange, setPendingRange] = useState<{
    student: Student
    name: string
    score: number
  } | null>(null)
  const [rangeBusy, setRangeBusy] = useState(false)
  const [bulkValue, setBulkValue] = useState('')
  const [bulkScope, setBulkScope] = useState<'all' | 'empty'>('all')
  const [bulkBusy, setBulkBusy] = useState(false)

  const newState = useOverlayState({
    onOpenChange: (open) => {
      if (!open) setNewName('')
    },
  })

  const rangeState = useOverlayState({
    onOpenChange: (open) => {
      if (!open) setPendingRange(null)
    },
  })

  const bulkState = useOverlayState({
    onOpenChange: (open) => {
      if (!open) {
        setBulkValue('')
        setBulkScope('all')
      }
    },
  })

  const projects = useMemo(() => extraProjectNames(scores.values()), [scores])

  const reload = useCallback(async () => {
    try {
      const data = await fetchClassTables(classId ?? undefined)
      setStudents(data.students)
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
    setSelected((prev) => (prev && projects.includes(prev) ? prev : projects[0] ?? null))
  }, [projects])

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
    async (student: Student, name: string, next: number | null) => {
      const key = scoreKey(student.stuId, SCORE_TYPE_EXTRA, name)
      try {
        if (next === null) {
          await apiFetch<{ ok: true }>('/api/scores', {
            method: 'DELETE',
            body: JSON.stringify({ stuId: student.stuId, type: SCORE_TYPE_EXTRA, indId: name }),
          })
          setScores((prev) => {
            const map = new Map(prev)
            map.delete(key)
            return map
          })
        } else {
          const res = await apiFetch<{ score: Score }>('/api/scores', {
            method: 'PUT',
            body: JSON.stringify({
              stuId: student.stuId,
              type: SCORE_TYPE_EXTRA,
              indId: name,
              score: next,
            }),
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
      await commitScore(pendingRange.student, pendingRange.name, pendingRange.score)
    } catch {
      // commitScore 已提示
    } finally {
      rangeState.close()
      setRangeBusy(false)
    }
  }

  const visibleStudents = useMemo(
    () => (currentClass ? students.filter((student) => student.classId === currentClass.id) : []),
    [students, currentClass],
  )

  const filteredStudents = useMemo(
    () => (query.trim() ? visibleStudents.filter((student) => matchStudent(query, student)) : visibleStudents),
    [visibleStudents, query],
  )

  const recorded = selected
    ? visibleStudents.filter((student) =>
        scores.has(scoreKey(student.stuId, SCORE_TYPE_EXTRA, selected)),
      ).length
    : 0

  /** 右侧固定分值（未输入或非法时为 null） */
  const applyScore = useMemo(() => {
    const trimmed = applyValue.trim()
    if (trimmed === '') return null
    const parsed = Number(trimmed)
    return Number.isNaN(parsed) ? null : parsed
  }, [applyValue])

  const targetMatches = useMemo(() => {
    if (applyScore === null || !targetQuery.trim()) return []
    return visibleStudents.filter((student) => matchStudent(targetQuery, student)).slice(0, 6)
  }, [applyScore, targetQuery, visibleStudents])

  const applyTo = useCallback(
    async (student: Student) => {
      if (!selected || applyScore === null) return
      const value = applyScore
      setTargetQuery('')
      if (value < -SCORE_LIMIT || value > SCORE_LIMIT) {
        toast.error(`请输入 ${-SCORE_LIMIT}~${SCORE_LIMIT} 的分数`)
        return
      }
      if (value < 0 || value > SCORE_MAX) {
        setPendingRange({ student, name: selected, score: value })
        rangeState.open()
        return
      }
      setApplying(true)
      try {
        await commitScore(student, selected, value)
        toast.success(`已将 ${value} 分应用于 ${student.name}`)
      } catch {
        // commitScore 已提示
      } finally {
        setApplying(false)
      }
    },
    [selected, applyScore, commitScore, rangeState],
  )

  /** 批量设置的目标分数（未输入或非法时为 null） */
  const bulkScore = useMemo(() => {
    const trimmed = bulkValue.trim()
    if (trimmed === '') return null
    const parsed = Number(trimmed)
    return Number.isNaN(parsed) ? null : parsed
  }, [bulkValue])

  /** 批量作用的学生：全部，或仅当前项目未填项 */
  const bulkTargets = useMemo(() => {
    if (!selected) return []
    if (bulkScope === 'all') return visibleStudents
    return visibleStudents.filter(
      (student) => !scores.has(scoreKey(student.stuId, SCORE_TYPE_EXTRA, selected)),
    )
  }, [selected, bulkScope, visibleStudents, scores])

  const applyBulk = async () => {
    if (!selected) return
    if (bulkScore === null) {
      toast.error('请输入分数')
      return
    }
    if (bulkScore < -SCORE_LIMIT || bulkScore > SCORE_LIMIT) {
      toast.error(`请输入 ${-SCORE_LIMIT}~${SCORE_LIMIT} 的分数`)
      return
    }
    if (bulkTargets.length === 0) {
      toast.info('没有需要设置的学生')
      return
    }
    setBulkBusy(true)
    let done = 0
    for (const student of bulkTargets) {
      try {
        await commitScore(student, selected, bulkScore)
        done += 1
      } catch {
        // commitScore 已提示
      }
    }
    setBulkBusy(false)
    bulkState.close()
    toast.success(`已将 ${bulkScore} 分应用于 ${done} 名学生`)
  }

  const createProject = () => {
    const name = newName.trim()
    if (!name) {
      toast.error('请输入项目名称')
      return
    }
    if (projects.includes(name)) toast.info('已存在同名项目，已为你选中')
    setSelected(name)
    setNewName('')
    newState.close()
  }

  const startEditQuick = () => {
    setQuickDraft(quickScores.join(', '))
    setEditingQuick(true)
  }

  const commitQuick = () => {
    const parsed = quickDraft
      .split(/[,，\s]+/)
      .map((part) => Number(part))
      .filter((num) => Number.isFinite(num))
    saveQuickScores(parsed)
    setEditingQuick(false)
  }

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title="录入分数"
        subtitle={currentClass ? `${currentClass.name} · 独立计分项目` : undefined}
        actions={
          <>
            <Select
              className="w-48"
              aria-label="选择项目"
              placeholder="选择项目"
              isDisabled={loading || projects.length === 0}
              value={selected}
              onChange={(key) => setSelected(key == null ? null : String(key))}
            >
              <Select.Trigger>
                <Select.Value />
                <Select.Indicator />
              </Select.Trigger>
              <Select.Popover>
                <ListBox>
                  {projects.map((name) => (
                    <ListBox.Item key={name} id={name} textValue={name}>
                      {name}
                      <ListBox.ItemIndicator />
                    </ListBox.Item>
                  ))}
                </ListBox>
              </Select.Popover>
            </Select>
            <Button size="sm" variant="secondary" onPress={newState.open}>
              <Plus width={15} height={15} className="shrink-0" />
              新建项目
            </Button>
            <IconAction label="返回分数和名单" onPress={() => navigate('/console/scores')}>
              <ArrowLeft width={15} height={15} className="shrink-0" />
            </IconAction>
          </>
        }
      />

      {loading ? (
        <SkeletonList rows={6} className="h-14 rounded-xl" />
      ) : !currentClass ? (
        <EmptyState icon={School} title="尚未绑定班级" hint="请先在设置中绑定班级" />
      ) : visibleStudents.length === 0 ? (
        <EmptyState icon={Users} title="暂无学生" hint="请先在「分数和名单」导入学生名单" />
      ) : !selected ? (
        <EmptyState
          icon={ListPlus}
          title="还没有独立计分项目"
          hint="点击右上角「新建项目」创建第一个项目"
        />
      ) : (
        <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
          {/* 左：全部学生 + 搜索 */}
          <div className="min-w-0 flex-1">
            <div className="mb-3 flex flex-wrap items-center gap-3">
              <span className="text-sm font-semibold text-fg">{selected}</span>
              <span className="tabular text-xs text-fg-subtle">
                {recorded}/{visibleStudents.length} 已录入
              </span>
            </div>

            <div className="relative mb-4">
              <Search
                width={18}
                height={18}
                className="pointer-events-none absolute left-4 top-1/2 shrink-0 -translate-y-1/2 text-fg-subtle"
              />
              <Input
                fullWidth
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="输入姓名、学号、拼音或首字母搜索"
                aria-label="搜索学生"
                className="tabular w-full rounded-2xl border border-line bg-elevated py-3 pl-11 pr-4 text-sm text-fg outline-none transition-all placeholder:text-fg-subtle focus:border-brand-500 focus:ring-4 focus:ring-brand-500/15"
              />
            </div>

            <div className="max-h-[70vh] overflow-auto rounded-2xl border border-line">
              {filteredStudents.map((student) => {
                const key = scoreKey(student.stuId, SCORE_TYPE_EXTRA, selected)
                return (
                  <div
                    key={student.stuId}
                    className="flex items-center gap-3 border-b border-line px-4 py-2 transition-colors last:border-b-0 hover:bg-sunken/40"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="font-bold">{student.name}</div>
                      <div className="tabular text-xs text-fg-muted">{student.studentNo}</div>
                    </div>
                    <ScoreCell
                      score={scores.get(key) ?? null}
                      onCommit={(next) => commitScore(student, selected, next)}
                      onOutOfRange={(next) => {
                        setPendingRange({ student, name: selected, score: next })
                        rangeState.open()
                      }}
                    />
                  </div>
                )
              })}
              {filteredStudents.length === 0 && (
                <div className="py-10 text-center text-sm text-fg-subtle">
                  未找到与“{query}”匹配的学生
                </div>
              )}
            </div>
          </div>

          {/* 右：将分数应用于… */}
          <Card className="flex w-full flex-col gap-5 lg:w-80 lg:shrink-0">
            <div className="flex items-center gap-2">
              <Target width={16} height={16} className="shrink-0 text-brand-600 dark:text-brand-300" />
              <span className="text-sm font-semibold text-fg">将分数应用于…</span>
            </div>

            <div className="flex flex-col gap-2">
              <label className="text-xs font-medium text-fg-subtle" htmlFor="apply-value">
                分数
              </label>
              <Input
                id="apply-value"
                type="number"
                value={applyValue}
                onChange={(event) => setApplyValue(event.target.value)}
                placeholder="输入固定分值"
                aria-label="固定分值"
                className="tabular w-full rounded-xl border border-line bg-elevated px-3 py-2 text-sm text-fg outline-none transition-all placeholder:text-fg-subtle focus:border-brand-500 focus:ring-2 focus:ring-brand-500/15"
              />
              {editingQuick ? (
                <div className="flex items-center gap-2">
                  <Input
                    autoFocus
                    value={quickDraft}
                    onChange={(event) => setQuickDraft(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') {
                        event.preventDefault()
                        commitQuick()
                      } else if (event.key === 'Escape') {
                        setEditingQuick(false)
                      }
                    }}
                    placeholder="如 100, 50, 0"
                    aria-label="编辑快捷分值"
                    className="tabular w-full rounded-xl border border-line bg-elevated px-3 py-2 text-sm text-fg outline-none transition-all placeholder:text-fg-subtle focus:border-brand-500 focus:ring-2 focus:ring-brand-500/15"
                  />
                  <Button size="sm" variant="primary" className="shrink-0" onPress={commitQuick}>
                    保存
                  </Button>
                </div>
              ) : (
                <div className="flex flex-wrap items-center gap-1">
                  <span className="text-xs text-fg-subtle">快捷：</span>
                  {quickScores.map((value) => (
                    <Button
                      key={value}
                      size="sm"
                      variant="ghost"
                      className="tabular"
                      onPress={() => setApplyValue(String(value))}
                    >
                      {value}
                    </Button>
                  ))}
                  <button
                    type="button"
                    onClick={startEditQuick}
                    className="inline-flex items-center gap-1 px-2 text-xs text-fg-subtle transition-colors hover:text-fg"
                  >
                    <Pencil width={12} height={12} className="shrink-0" />
                    编辑
                  </button>
                </div>
              )}
            </div>

            <div className="flex flex-col gap-2">
              <label className="text-xs font-medium text-fg-subtle" htmlFor="apply-target">
                姓名 / 拼音 / 学号
              </label>
              <Input
                id="apply-target"
                value={targetQuery}
                disabled={applyScore === null}
                onChange={(event) => setTargetQuery(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && targetMatches.length > 0) {
                    event.preventDefault()
                    void applyTo(targetMatches[0])
                  }
                }}
                placeholder={applyScore === null ? '请先输入分数' : '输入后回车应用'}
                aria-label="应用到学生"
                className="w-full rounded-xl border border-line bg-elevated px-3 py-2 text-sm text-fg outline-none transition-all placeholder:text-fg-subtle focus:border-brand-500 focus:ring-2 focus:ring-brand-500/15 disabled:opacity-50"
              />
              <div className="flex flex-col gap-1">
                {targetMatches.map((student) => {
                  const current = scores.get(
                    scoreKey(student.stuId, SCORE_TYPE_EXTRA, selected),
                  )?.score
                  return (
                    <button
                      key={student.stuId}
                      type="button"
                      disabled={applying}
                      onClick={() => void applyTo(student)}
                      className="flex items-center gap-3 rounded-xl border border-line bg-sunken px-3 py-2 text-left transition-all hover:border-brand-500/40 hover:shadow-sm disabled:opacity-50"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-semibold text-fg">{student.name}</div>
                        <div className="tabular text-xs text-fg-muted">{student.studentNo}</div>
                      </div>
                      {current != null && (
                        <span className="tabular shrink-0 text-xs text-fg-subtle">{current}</span>
                      )}
                    </button>
                  )
                })}
              </div>
            </div>

            <div className="flex flex-col gap-2 border-t border-line pt-4">
              <Button fullWidth variant="secondary" onPress={bulkState.open}>
                <ListChecks width={15} height={15} className="shrink-0" />
                全部设为…
              </Button>
            </div>
          </Card>
        </div>
      )}

      <Modal state={newState}>
        <Modal.Backdrop>
          <Modal.Container>
            <Modal.Dialog className="sm:max-w-sm">
              <Modal.CloseTrigger />
              <Modal.Header>
                <Modal.Icon className="bg-brand-500/10 text-brand-600 dark:text-brand-300">
                  <ListPlus width={18} height={18} className="shrink-0" />
                </Modal.Icon>
                <Modal.Heading>新建独立计分项目</Modal.Heading>
              </Modal.Header>
              <Modal.Body>
                <Input
                  autoFocus
                  value={newName}
                  onChange={(event) => setNewName(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault()
                      createProject()
                    }
                  }}
                  placeholder="项目名称，例如：课堂参与"
                  aria-label="项目名称"
                />
                <p className="mt-2 text-xs text-fg-subtle">
                  项目名保存后不可重命名；无需预先创建，录入第一个分数即生效。
                </p>
              </Modal.Body>
              <Modal.Footer>
                <Button slot="close" variant="secondary">
                  取消
                </Button>
                <Button variant="primary" onPress={createProject}>
                  创建
                </Button>
              </Modal.Footer>
            </Modal.Dialog>
          </Modal.Container>
        </Modal.Backdrop>
      </Modal>

      <Modal state={bulkState}>
        <Modal.Backdrop>
          <Modal.Container>
            <Modal.Dialog className="sm:max-w-sm">
              <Modal.CloseTrigger />
              <Modal.Header>
                <Modal.Icon className="bg-brand-500/10 text-brand-600 dark:text-brand-300">
                  <Layers width={18} height={18} className="shrink-0" />
                </Modal.Icon>
                <Modal.Heading>全部设为…</Modal.Heading>
              </Modal.Header>
              <Modal.Body className="flex flex-col gap-5">
                <div className="flex flex-col gap-2">
                  <label className="text-xs font-medium text-fg-subtle" htmlFor="bulk-value">
                    分数
                  </label>
                  <Input
                    id="bulk-value"
                    autoFocus
                    type="number"
                    value={bulkValue}
                    onChange={(event) => setBulkValue(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') {
                        event.preventDefault()
                        void applyBulk()
                      }
                    }}
                    placeholder="输入要设置的分数"
                    aria-label="批量分值"
                    className="tabular w-full rounded-xl border border-line bg-elevated px-3 py-2 text-sm text-fg outline-none transition-all placeholder:text-fg-subtle focus:border-brand-500 focus:ring-2 focus:ring-brand-500/15"
                  />
                </div>
                <div className="flex flex-col gap-2">
                  <span className="text-xs font-medium text-fg-subtle">应用范围</span>
                  <ToggleButtonGroup
                    fullWidth
                    disallowEmptySelection
                    selectionMode="single"
                    selectedKeys={new Set([bulkScope])}
                    onSelectionChange={(keys) => {
                      const first = keys.values().next().value
                      if (first === 'all' || first === 'empty') setBulkScope(first)
                    }}
                  >
                    <ToggleButton id="all">应用到全部</ToggleButton>
                    <ToggleButton id="empty">
                      <ToggleButtonGroup.Separator />
                      应用到未填项
                    </ToggleButton>
                  </ToggleButtonGroup>
                  <p className="text-xs text-fg-subtle">
                    将影响 {bulkTargets.length} 名学生
                  </p>
                </div>
              </Modal.Body>
              <Modal.Footer>
                <Button slot="close" variant="secondary">
                  取消
                </Button>
                <Button variant="primary" isDisabled={bulkBusy} onPress={() => void applyBulk()}>
                  确定
                </Button>
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
    </div>
  )
}
