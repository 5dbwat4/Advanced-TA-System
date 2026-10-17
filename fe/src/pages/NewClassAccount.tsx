import { Button, Input } from '@heroui/react'
import { motion } from 'motion/react'
import { useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { toast } from 'sonner'

import ArrowRight from '~icons/lucide/arrow-right'
import GraduationCap from '~icons/lucide/graduation-cap'
import { PendingButton } from '@/components/ui/PendingButton'
import { ThemeToggle } from '@/components/ui/ThemeToggle'
import { createClassAccount } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import { getErrorMessage } from '@/lib/error'
import { cn } from '@/lib/utils'

type ClassType = '2026-sys1' | '2026-sys2' | '2026-sys3'

type BindState = {
  bindToken: string
  classId?: string
  className?: string
}

const TYPE_OPTIONS: { value: ClassType; label: string }[] = [
  { value: '2026-sys1', label: '系统I' },
  { value: '2026-sys2', label: '系统II' },
  { value: '2026-sys3', label: '系统III' },
]

function inferType(name: string): ClassType {
  if (name.includes('系统III') || name.includes('系统 III') || name.includes('系统Ⅲ')) {
    return '2026-sys3'
  }
  if (name.includes('系统II') || name.includes('系统 II') || name.includes('系统Ⅱ')) {
    return '2026-sys2'
  }
  if (name.includes('系统I') || name.includes('系统 I') || name.includes('系统Ⅰ')) {
    return '2026-sys1'
  }
  return '2026-sys2'
}

export default function NewClassAccount() {
  const location = useLocation()
  const navigate = useNavigate()
  const { user, adoptSession } = useAuth()

  const state = location.state as BindState | null
  const bindToken = state?.bindToken ?? ''
  const classId = state?.classId ?? ''
  const className = state?.className ?? ''
  const isExisting = Boolean(classId)
  const hasTarget = Boolean(bindToken)

  const [name, setName] = useState(user?.name ?? '')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [type, setType] = useState<ClassType>(() => inferType(className))
  const [saving, setSaving] = useState(false)

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!user) {
      toast.error('登录状态已失效，请重新登录')
      return
    }
    if (!hasTarget) {
      toast.error('缺少课程绑定授权，请从“助教绑定课程”重新获取课程')
      return
    }
    if (!isExisting && !className) {
      toast.error('缺少课程名称，请从“助教绑定课程”重新获取课程')
      return
    }
    if (password.length < 8) {
      toast.error('密码至少 8 位')
      return
    }

    setSaving(true)
    try {
      const result = await createClassAccount({
        bindToken,
        ...(classId ? { classId } : { type }),
        name: name.trim(),
        username: username.trim(),
        password,
      })
      adoptSession(result)
      toast.success(`已创建账号并切换到 ${result.user.name}`)
      navigate('/console', { replace: true })
    } catch (error) {
      toast.error(getErrorMessage(error, '创建账号失败'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center px-6 py-12">
      <div className="absolute right-4 top-4 flex items-center gap-1">
        <ThemeToggle />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.55, ease: [0.16, 1, 0.3, 1] }}
        className="w-full max-w-sm"
      >
        <div className="text-center">
          <div className="mb-3 flex justify-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-500/10 text-brand-600 dark:text-brand-300">
              <GraduationCap width={24} height={24} className="shrink-0" />
            </div>
          </div>
          <h1 className="text-2xl font-bold tracking-tight">为新班级创建账户</h1>
          <p className="mt-1.5 text-xs text-fg-subtle">
            {className || '新班级'} · 当前账号会保留在原班级
          </p>
        </div>

        {!hasTarget ? (
          <div className="mt-6 rounded-2xl border border-dashed border-danger/40 p-6 text-center">
            <p className="text-sm text-danger">
              缺少课程绑定授权，请从“助教绑定课程”重新获取课程。
            </p>
            <Button
              variant="secondary"
              fullWidth
              className="mt-4"
              onPress={() => navigate('/console/settings')}
            >
              返回设置
            </Button>
          </div>
        ) : (
          <form onSubmit={submit} className="mt-6 flex flex-col gap-4">
            <div className="rounded-2xl border border-line bg-sunken px-4 py-3 text-xs text-fg-subtle">
              <div className="flex items-center justify-between gap-3">
                <span>当前学号</span>
                <span className="tabular font-semibold text-fg-muted">{user?.studentId ?? '—'}</span>
              </div>
              <div className="mt-1.5 flex items-center justify-between gap-3">
                <span>目标班级</span>
                <span className="truncate font-semibold text-fg-muted">
                  {className || (isExisting ? '已存在班级' : '新班级')}
                </span>
              </div>
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-semibold text-fg-muted">姓名</label>
              <Input
                fullWidth
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="张三"
                minLength={1}
                maxLength={32}
                autoComplete="name"
                autoFocus
                required
              />
            </div>

            {!isExisting && (
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-fg-muted">课程类别</label>
                <div className="flex flex-wrap gap-2">
                  {TYPE_OPTIONS.map((option) => (
                    <label
                      key={option.value}
                      className={cn(
                        'flex cursor-pointer items-center gap-2 rounded-xl border px-3 py-2 text-xs font-semibold transition-colors',
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
            )}

            <div className="flex items-center gap-3 py-1">
              <div className="h-px flex-1 bg-line" />
              <span className="text-[10px] font-semibold uppercase tracking-widest text-fg-subtle">
                登录信息
              </span>
              <div className="h-px flex-1 bg-line" />
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-semibold text-fg-muted">用户名</label>
              <Input
                fullWidth
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="新账号的登录用户名"
                minLength={1}
                maxLength={32}
                autoComplete="username"
                required
              />
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-semibold text-fg-muted">密码</label>
              <Input
                fullWidth
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="至少 8 位"
                minLength={8}
                autoComplete="new-password"
                required
              />
            </div>

            <p className="text-[11px] text-fg-subtle">
              将复制当前助教的身份信息到新账号；创建成功后会自动切换到新账号。
            </p>

            <PendingButton
              type="submit"
              fullWidth
              size="lg"
              isPending={saving}
              isDisabled={!name.trim() || !username.trim() || password.length < 8}
              className="mt-2 bg-gradient-to-r from-brand-600 to-brand-700 shadow-lg shadow-brand-600/25"
              icon={ArrowRight}
              pendingLabel="创建中"
            >
              创建并进入
            </PendingButton>

            <Button variant="ghost" fullWidth onPress={() => navigate(-1)}>
              取消
            </Button>
          </form>
        )}
      </motion.div>
    </div>
  )
}
