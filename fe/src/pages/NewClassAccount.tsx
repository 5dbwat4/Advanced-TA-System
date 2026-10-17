import { Button, Input, Switch } from '@heroui/react'
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

type BindState = {
  bindToken: string
  classId?: string
  className?: string
}

export default function NewClassAccount() {
  const location = useLocation()
  const navigate = useNavigate()
  const { user, adoptSession } = useAuth()

  const state = location.state as BindState | null
  const bindToken = state?.bindToken ?? ''
  const classId = state?.classId ?? ''
  const className = state?.className ?? ''
  const hasTarget = Boolean(bindToken) && Boolean(classId)

  const [name, setName] = useState(user?.name ?? '')
  const [username, setUsername] = useState(user?.username ?? '')
  const [password, setPassword] = useState('')
  const [syncLogin, setSyncLogin] = useState(true)
  const [syncPreferences, setSyncPreferences] = useState(true)
  const [saving, setSaving] = useState(false)

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!user) {
      toast.error('登录状态已失效，请重新登录')
      return
    }
    if (!hasTarget) {
      toast.error('缺少课程信息，请先添加课程')
      return
    }
    if (!className) {
      toast.error('缺少课程名称，请重新获取课程')
      return
    }
    if (!syncLogin && password && password.length < 8) {
      toast.error('密码至少 8 位')
      return
    }

    setSaving(true)
    try {
      const result = await createClassAccount({
        bindToken,
        classId,
        name: name.trim(),
        username: username.trim(),
        password: syncLogin ? undefined : password,
        syncLogin,
        syncPreferences,
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
              缺少课程信息，请从“助教绑定课程”重新添加课程。
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
                <span className="truncate font-semibold text-fg-muted">{className || '未命名课程'}</span>
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

            <div className="flex items-center justify-between gap-4 rounded-xl border border-line px-4 py-3">
              <div className="min-w-0">
                <div className="text-xs font-semibold text-fg-muted">从原账号同步登录信息？</div>
                <div className="text-[11px] text-fg-subtle">同步原账号密码</div>
              </div>
              <Switch
                aria-label="从原账号同步登录信息"
                isSelected={syncLogin}
                onChange={setSyncLogin}
              >
                <Switch.Content>
                  <Switch.Control>
                    <Switch.Thumb />
                  </Switch.Control>
                </Switch.Content>
              </Switch>
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-semibold text-fg-muted">密码</label>
              <Input
                fullWidth
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={syncLogin ? '随原账号同步' : '留空则不设置密码'}
                autoComplete="new-password"
                disabled={syncLogin}
              />
            </div>

            <div className="flex items-center justify-between gap-4 rounded-xl border border-line px-4 py-3">
              <div className="min-w-0">
                <div className="text-xs font-semibold text-fg-muted">同步我的偏好信息？</div>
                <div className="text-[11px] text-fg-subtle">复制头像与界面偏好到新账号</div>
              </div>
              <Switch
                aria-label="同步我的偏好信息"
                isSelected={syncPreferences}
                onChange={setSyncPreferences}
              >
                <Switch.Content>
                  <Switch.Control>
                    <Switch.Thumb />
                  </Switch.Control>
                </Switch.Content>
              </Switch>
            </div>

            <PendingButton
              type="submit"
              fullWidth
              size="lg"
              isPending={saving}
              isDisabled={
                !name.trim() ||
                !username.trim() ||
                (!syncLogin && password.length > 0 && password.length < 8)
              }
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
