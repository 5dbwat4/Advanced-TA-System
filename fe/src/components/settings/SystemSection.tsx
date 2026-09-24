import { Button, Input, Modal, Spinner, useOverlayState } from '@heroui/react'
import { useCallback, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'

import ChevronRight from '~icons/lucide/chevron-right'
import GraduationCap from '~icons/lucide/graduation-cap'
import Settings2 from '~icons/lucide/settings-2'
import UserPlus from '~icons/lucide/user-plus'
import { Card } from '@/components/ui/Card'
import {
  addTa,
  apiFetch,
  joinClass,
  listClasses,
  listTas,
  type ClassInfo,
  type Course,
  type Ta,
} from '@/lib/api'
import { useAuth } from '@/lib/auth'
import { cn } from '@/lib/utils'
import { getZjuamCredential } from '@/lib/zjuam'

export function SystemSection({ index = 0 }: { index?: number }) {
  const [courses, setCourses] = useState<Course[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [tas, setTas] = useState<Ta[] | null>(null)
  const [taLoading, setTaLoading] = useState(false)
  const [taError, setTaError] = useState<string | null>(null)
  const [taStudentId, setTaStudentId] = useState('')
  const [taAdding, setTaAdding] = useState(false)
  const [classes, setClasses] = useState<ClassInfo[]>([])
  const [joiningId, setJoiningId] = useState<string | null>(null)
  const { user, refresh } = useAuth()
  const navigate = useNavigate()

  const fetchCourses = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const local = getZjuamCredential()
      const body = local ? { account: local.account, password: local.password } : {}
      const data = await apiFetch<{ courses: Course[] }>('/api/auth/zjuam/courses', {
        method: 'POST',
        body: JSON.stringify(body),
      })
      setCourses(data.courses)
    } catch (error) {
      const message = error instanceof Error ? error.message : '获取课程失败'
      setError(message)
      toast.error(message)
    } finally {
      setLoading(false)
    }
  }, [])

  const fetchTas = useCallback(async () => {
    setTaLoading(true)
    setTaError(null)
    try {
      setTas(await listTas())
    } catch (error) {
      const message = error instanceof Error ? error.message : '获取助教失败'
      setTaError(message)
      toast.error(message)
    } finally {
      setTaLoading(false)
    }
  }, [])

  const fetchClasses = useCallback(async () => {
    try {
      setClasses(await listClasses())
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '获取课程列表失败')
    }
  }, [])

  const joinExisting = async (classId: string) => {
    setJoiningId(classId)
    try {
      await joinClass(classId)
      await refresh()
      toast.success('已加入该课程')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '加入失败')
    } finally {
      setJoiningId(null)
    }
  }

  const courseState = useOverlayState({
    onOpenChange: (open) => {
      if (open) void fetchClasses()
    },
  })

  const taState = useOverlayState({
    onOpenChange: (open) => {
      if (open) void fetchTas()
    },
  })

  const submitTa = async () => {
    const studentId = taStudentId.trim()
    if (!studentId) return
    setTaAdding(true)
    try {
      await addTa(studentId)
      toast.success('已添加新助教')
      setTaStudentId('')
      await fetchTas()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '添加失败')
    } finally {
      setTaAdding(false)
    }
  }

  return (
    <Card index={index} className="flex flex-col gap-4 border-danger/50">
      <div className="flex items-center gap-2">
        <Settings2 width={16} height={16} className="shrink-0 text-danger" />
        <span className="text-sm font-bold text-danger">系统设置</span>
      </div>

      <Modal state={courseState}>
        <Modal.Trigger className="flex w-full items-center gap-3 rounded-xl border border-line bg-sunken px-4 py-3 text-left transition-colors hover:border-danger/40">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-danger/10 text-danger">
                  <GraduationCap width={18} height={18} className="shrink-0" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-sm font-semibold">助教绑定课程</div>
            <div className="truncate text-xs text-fg-subtle">
              从“学在浙大”获取并绑定当前账号的课程
            </div>
          </div>
          <ChevronRight width={18} height={18} className="shrink-0 text-fg-subtle" />
        </Modal.Trigger>
        <Modal.Backdrop>
          <Modal.Container>
            <Modal.Dialog className="sm:max-w-md">
              <Modal.CloseTrigger />
              <Modal.Header>
                <Modal.Icon className="bg-danger/10 text-danger">
            <GraduationCap width={18} height={18} className="shrink-0" />
                </Modal.Icon>
                <Modal.Heading>助教绑定课程</Modal.Heading>
              </Modal.Header>
              <Modal.Body className="flex flex-col gap-4">
                <p className="text-xs text-fg-subtle">
                  将使用你保存的浙大统一身份认证账号登录“学在浙大”，获取你的课程列表。
                </p>
                {error ? (
                  <div className="rounded-xl border border-dashed border-danger/40 py-10 text-center text-xs text-danger">
                    {error}
                  </div>
                ) : loading ? (
                  <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-line py-10 text-center">
                    <Spinner color="current" size="sm" />
                    <div className="text-xs text-fg-subtle">正在登录“学在浙大”并获取课程…</div>
                  </div>
                ) : courses === null ? (
                  <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-line py-10 text-center">
                    <GraduationCap width={24} height={24} className="shrink-0 text-fg-subtle" />
                    <div className="text-sm font-semibold text-fg-muted">尚未获取课程</div>
                    <div className="text-xs text-fg-subtle">点击下方按钮开始获取</div>
                  </div>
                ) : courses.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-line py-10 text-center text-xs text-fg-subtle">
                    未获取到课程
                  </div>
                ) : (
                  <div className="flex max-h-80 flex-col gap-2 overflow-auto">
                    {courses.map((course) => {
                      const existingClass = classes.find(
                        (item) => String(item.xzzdClassId) === String(course.id),
                      )
                      const joined =
                        existingClass !== undefined &&
                        (user?.classes.some((item) => item.id === existingClass.id) ?? false)
                      const adding = existingClass === undefined && course.isInstructor
                      const clickable = adding || (existingClass !== undefined && !joined)
                      const content = (
                        <>
                          <div className="min-w-0 flex-1">
                            <div className="truncate text-sm font-semibold">{course.name}</div>
                            {course.courseCode && (
                              <div className="tabular truncate text-xs text-fg-subtle">
                                {course.courseCode}
                              </div>
                            )}
                          </div>
                          {existingClass && (
                            <span className="rounded-lg bg-brand-500/10 px-2 py-0.5 text-[11px] font-semibold text-brand-600 dark:text-brand-300">
                              已录入
                            </span>
                          )}
                          {joined && (
                            <span className="rounded-lg bg-amber-500/10 px-2 py-0.5 text-[11px] font-semibold text-amber-600 dark:text-amber-300">
                              已加入
                            </span>
                          )}
                          {adding && (
                            <>
                              <span className="rounded-lg bg-brand-500/10 px-2 py-0.5 text-[11px] font-semibold text-brand-600 dark:text-brand-300">
                                任课
                              </span>
                              <span className="rounded-lg bg-brand-500/10 px-2 py-0.5 text-[11px] font-semibold text-brand-600 dark:text-brand-300">
                                点击添加
                              </span>
                            </>
                          )}
                          {clickable && (
                            <ChevronRight width={16} height={16} className="shrink-0 text-fg-subtle" />
                          )}
                          <span className="tabular text-[11px] text-fg-subtle">{course.id}</span>
                        </>
                      )
                      const rowClass =
                        'flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left'
                      const stateClass = existingClass
                        ? 'border-brand-500/40 bg-brand-500/5'
                        : 'border-line bg-sunken'
                      if (!clickable) {
                        return (
                          <div key={course.id} className={cn(rowClass, stateClass)}>
                            {content}
                          </div>
                        )
                      }
                      return (
                        <button
                          key={course.id}
                          type="button"
                          disabled={existingClass !== undefined && joiningId === existingClass.id}
                          onClick={() => {
                            if (existingClass) void joinExisting(existingClass.id)
                            else
                              navigate(
                                `/console/courses/new?id=${course.id}&name=${encodeURIComponent(
                                  course.displayName ?? course.name,
                                )}`,
                              )
                          }}
                          className={cn(
                            rowClass,
                            stateClass,
                            'transition-colors hover:border-brand-500/40 hover:bg-brand-500/5',
                          )}
                        >
                          {content}
                        </button>
                      )
                    })}
                  </div>
                )}
                <Button isPending={loading} onPress={() => void fetchCourses()}>
                  {({ isPending }) => (
                    <>
                      {isPending && <Spinner color="current" size="sm" />}
                      开始获取课程
                    </>
                  )}
                </Button>
              </Modal.Body>
              <Modal.Footer>
                <Button slot="close" variant="secondary">
                  关闭
                </Button>
              </Modal.Footer>
            </Modal.Dialog>
          </Modal.Container>
        </Modal.Backdrop>
      </Modal>

      <Modal state={taState}>
        <Modal.Trigger className="flex w-full items-center gap-3 rounded-xl border border-line bg-sunken px-4 py-3 text-left transition-colors hover:border-danger/40">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-danger/10 text-danger">
                  <UserPlus width={18} height={18} className="shrink-0" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-sm font-semibold">添加新助教</div>
            <div className="truncate text-xs text-fg-subtle">
              输入助教学号，将其加入系统；新助教需等待首次登录后解封
            </div>
          </div>
          <ChevronRight width={18} height={18} className="shrink-0 text-fg-subtle" />
        </Modal.Trigger>
        <Modal.Backdrop>
          <Modal.Container>
            <Modal.Dialog className="sm:max-w-md">
              <Modal.CloseTrigger />
              <Modal.Header>
                <Modal.Icon className="bg-danger/10 text-danger">
            <UserPlus width={18} height={18} className="shrink-0" />
                </Modal.Icon>
                <Modal.Heading>添加新助教</Modal.Heading>
              </Modal.Header>
              <Modal.Body className="flex flex-col gap-4">
                <p className="text-xs text-fg-subtle">
                  输入助教的学号将其加入系统，新助教需等待首次登录后解封。
                </p>
                <div className="flex items-center gap-2">
                  <Input
                    fullWidth
                    type="text"
                    value={taStudentId}
                    onChange={(e) => setTaStudentId(e.target.value)}
                    placeholder="请输入学号"
                    inputMode="numeric"
                    autoComplete="off"
                    aria-label="助教学号"
                  />
                  <Button
                    isDisabled={taStudentId.trim().length === 0}
                    isPending={taAdding}
                    onPress={() => void submitTa()}
                  >
                    {({ isPending }) => (
                      <>
                        {isPending && <Spinner color="current" size="sm" />}
                        添加
                      </>
                    )}
                  </Button>
                </div>
                {taError ? (
                  <div className="rounded-xl border border-dashed border-danger/40 py-8 text-center text-xs text-danger">
                    {taError}
                  </div>
                ) : taLoading ? (
                  <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-line py-8 text-center">
                    <Spinner color="current" size="sm" />
                    <div className="text-xs text-fg-subtle">正在加载助教列表…</div>
                  </div>
                ) : tas === null || tas.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-line py-8 text-center text-xs text-fg-subtle">
                    暂无助教
                  </div>
                ) : (
                  <div className="flex max-h-80 flex-col gap-2 overflow-auto">
                    {tas.map((ta) => (
                      <div
                        key={ta.id}
                        className="flex items-center gap-3 rounded-xl border border-line bg-sunken px-3 py-2.5"
                      >
                        <div className="min-w-0 flex-1">
                          {ta.activated && (
                            <div className="truncate text-sm font-semibold">{ta.name}</div>
                          )}
                          <div className="tabular truncate text-xs text-fg-subtle">
                            {ta.studentId}
                          </div>
                        </div>
                        <div className="flex shrink-0 flex-col items-end gap-1">
                          <span
                            className={
                              ta.activated
                                ? 'rounded-lg bg-brand-500/10 px-2 py-0.5 text-[11px] font-semibold text-brand-600 dark:text-brand-300'
                                : 'rounded-lg bg-amber-500/10 px-2 py-0.5 text-[11px] font-semibold text-amber-600 dark:text-amber-300'
                            }
                          >
                            {ta.activated ? '已激活' : '未解封'}
                          </span>
                          <span className="max-w-32 truncate text-[11px] text-fg-subtle">
                            {ta.classes.length
                              ? ta.classes.map((c) => c.name).join('、')
                              : '未绑定'}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </Modal.Body>
              <Modal.Footer>
                <Button slot="close" variant="secondary">
                  关闭
                </Button>
              </Modal.Footer>
            </Modal.Dialog>
          </Modal.Container>
        </Modal.Backdrop>
      </Modal>
    </Card>
  )
}
