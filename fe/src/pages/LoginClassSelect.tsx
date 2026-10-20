import { Button, Modal, useOverlayState } from '@heroui/react'
import { useState } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import { toast } from 'sonner'

import GraduationCap from '~icons/lucide/graduation-cap'
import Plus from '~icons/lucide/plus'
import ShieldCheck from '~icons/lucide/shield-check'
import { Logo } from '@/components/ui/Logo'
import { PendingButton } from '@/components/ui/PendingButton'
import { ApiError, type ClassSelectCourse, type User } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import { getErrorMessage } from '@/lib/error'
import { cn } from '@/lib/utils'

type ClassSelectState = {
  selectionToken: string
  courses: ClassSelectCourse[]
  from?: string
}

type ClassType = '2026-sys1' | '2026-sys2' | '2026-sys3'

const TYPE_OPTIONS: Array<{ value: ClassType; label: string }> = [
  { value: '2026-sys1', label: '系统I' },
  { value: '2026-sys2', label: '系统II' },
  { value: '2026-sys3', label: '系统III' },
]

export default function LoginClassSelect() {
  const location = useLocation()
  const navigate = useNavigate()
  const { selectClass } = useAuth()
  const state = location.state as ClassSelectState | null
  const [pendingKey, setPendingKey] = useState<string | null>(null)
  const [typeCourse, setTypeCourse] = useState<ClassSelectCourse | null>(null)
  const [type, setType] = useState<ClassType>('2026-sys1')
  const typeState = useOverlayState({
    onOpenChange: (open) => {
      if (!open) setTypeCourse(null)
    },
  })

  if (!state?.selectionToken) {
    return <Navigate to="/login" replace />
  }

  const { selectionToken, courses, from } = state

  const finish = (user: User) => {
    toast.success(user.username ? `欢迎回来，${user.name}` : '班级已绑定，请完善信息')
    const dest = user.username ? (from ?? '/console') : '/setup'
    navigate(dest, { replace: true })
  }

  const choose = async (course: ClassSelectCourse, classType?: ClassType) => {
    setPendingKey(course.key)
    try {
      const user = await selectClass(selectionToken, course.key, classType)
      finish(user)
    } catch (error) {
      toast.error(getErrorMessage(error, '登录失败，请重新登录'))
      if (error instanceof ApiError && error.status === 401) {
        navigate('/login', { replace: true })
      }
    } finally {
      setPendingKey(null)
    }
  }

  const onCourse = (course: ClassSelectCourse) => {
    if (course.registered) {
      void choose(course)
      return
    }
    setTypeCourse(course)
    typeState.open()
  }

  return (
    <div className="diagonal-bg flex min-h-screen items-center justify-center px-5 py-10">
      <div className="w-full max-w-md">
        <div className="mb-6 flex flex-col items-center gap-3 text-center">
          <Logo size={40} />
          <div>
            <h1 className="text-lg font-bold tracking-tight">选择你的班级</h1>
            <p className="mt-1 text-xs text-fg-subtle">请选择本次要进入的班级</p>
          </div>
        </div>

        {courses.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-danger/40 py-10 text-center text-sm text-danger">
            你目前没有可选择的班级，请联系课程教师。
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {courses.map((course) => {
              const Icon = course.registered ? ShieldCheck : Plus
              return (
                <Button
                  key={course.key}
                  variant="secondary"
                  fullWidth
                  className="h-auto justify-start px-4 py-3"
                  isDisabled={pendingKey !== null}
                  onPress={() => onCourse(course)}
                >
                  <span className="flex w-full items-center gap-3 text-left">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-500/10 text-brand-600 dark:text-brand-300">
                      <Icon width={18} height={18} className="shrink-0" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold text-fg">
                        {course.name}
                      </span>
                      <span className="block truncate text-xs text-fg-subtle">
                        {course.registered ? '已录入系统' : '未录入 · 选择后创建班级'}
                      </span>
                    </span>
                    {pendingKey === course.key && (
                      <span className="text-xs text-fg-subtle">进入中…</span>
                    )}
                  </span>
                </Button>
              )
            })}
          </div>
        )}

        <Button
          variant="ghost"
          fullWidth
          className="mt-4"
          onPress={() => navigate('/login', { replace: true })}
        >
          返回登录
        </Button>
      </div>

      {typeCourse && (
        <Modal state={typeState}>
          <Modal.Backdrop>
            <Modal.Container>
              <Modal.Dialog className="sm:max-w-md">
                <Modal.CloseTrigger />
                <Modal.Header>
                  <Modal.Icon className="bg-brand-500/10 text-brand-600 dark:text-brand-300">
                    <GraduationCap width={18} height={18} className="shrink-0" />
                  </Modal.Icon>
                  <Modal.Heading>创建新班级</Modal.Heading>
                </Modal.Header>
                <Modal.Body className="flex flex-col gap-4">
                  <p className="text-xs leading-relaxed text-fg-subtle">
                    “{typeCourse.name}”尚未录入系统。请选择班级类型，确认后会创建班级并将你绑定为本班助教。
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {TYPE_OPTIONS.map((option) => (
                      <button
                        key={option.value}
                        type="button"
                        aria-pressed={type === option.value}
                        onClick={() => setType(option.value)}
                        className={cn(
                          'rounded-xl border px-4 py-2.5 text-sm font-semibold transition-colors',
                          type === option.value
                            ? 'border-brand-500/60 bg-brand-500/10 text-brand-600 dark:text-brand-300'
                            : 'border-line bg-sunken text-fg-muted hover:border-brand-500/40',
                        )}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                </Modal.Body>
                <Modal.Footer>
                  <Button slot="close" variant="secondary">
                    取消
                  </Button>
                  <PendingButton
                    isPending={pendingKey === typeCourse.key}
                    onPress={() => void choose(typeCourse, type)}
                  >
                    创建并进入
                  </PendingButton>
                </Modal.Footer>
              </Modal.Dialog>
            </Modal.Container>
          </Modal.Backdrop>
        </Modal>
      )}
    </div>
  )
}
