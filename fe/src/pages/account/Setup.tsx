import { Button, Description, FieldError, Input, Label, Spinner, TextField } from '@heroui/react'
import { motion } from 'motion/react'
import { useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { toast } from 'sonner'

import ArrowRight from '~icons/lucide/arrow-right'
import Check from '~icons/lucide/check'
import Fingerprint from '~icons/lucide/fingerprint'
import Plus from '~icons/lucide/plus'
import { PendingButton } from '@/components/ui/PendingButton'
import { ThemeToggle } from '@/components/ui/ThemeToggle'
import { acceptInvite, unlockStudent, ApiError, type Role } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import { getErrorMessage } from '@/lib/error'
import { clearPendingInvite, readPendingInvite } from '@/lib/onboarding'
import { registerPasskey } from '@/lib/passkey'
import { homePathFor } from '@/lib/student-route'
import { useAppStore } from '@/lib/store'

const ROLE_LABELS: Record<Role, string> = {
  TA: '助教',
  TEACHER: '教师',
  VIEWER: '观察者',
  STUDENT: '学生',
}

export default function Setup() {
  const navigate = useNavigate()
  const { user, loading, refresh, completeSetup, adoptSession, logout } = useAuth()
  const onboardingInfo = useAppStore((state) => state.onboardingInfo)
  const setOnboarding = useAppStore((state) => state.setOnboarding)
  const setOnboardingInfo = useAppStore((state) => state.setOnboardingInfo)
  const [pendingInvite] = useState(() => readPendingInvite())

  const [studentId, setStudentId] = useState(user?.studentId ?? '')
  const [username, setUsername] = useState('')
  const [name, setName] = useState(user?.name && user.name !== user.studentId ? user.name : '')
  const [password, setPassword] = useState('')
  const [saving, setSaving] = useState(false)
  const [bound, setBound] = useState(user?.hasWebauthn ?? false)
  const [binding, setBinding] = useState(false)
  const [touched, setTouched] = useState({ username: false, name: false })
  const [submitted, setSubmitted] = useState(false)
  const [serverError, setServerError] = useState<{ field: 'username' | 'name'; message: string } | null>(
    null,
  )

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Spinner size="lg" />
      </div>
    )
  }

  if (!user && !pendingInvite) {
    return (
      <div className="relative flex min-h-screen items-center justify-center px-6 py-12">
        <div className="absolute right-4 top-4 flex items-center gap-1">
          <ThemeToggle />
        </div>
        <div className="w-full max-w-sm rounded-2xl border border-line bg-elevated p-6 text-center">
          <h1 className="text-xl font-bold tracking-tight">完善账号信息</h1>
          <p className="mt-2 text-sm text-fg-muted">请先登录，或通过邀请链接创建账号。</p>
          <Button fullWidth className="mt-5" onPress={() => navigate('/login')}>
            去登录
          </Button>
        </div>
      </div>
    )
  }

  if (user?.role === 'STUDENT' && user.username) {
    return <Navigate to="/student-console" replace />
  }

  const isInvite = !user && Boolean(pendingInvite)
  const inviteInfo =
    pendingInvite ?? (onboardingInfo && !('source' in onboardingInfo) ? onboardingInfo : null)
  const loginInfo = onboardingInfo && 'source' in onboardingInfo ? onboardingInfo : null
  const source = isInvite ? 'invite' : (loginInfo?.source ?? (inviteInfo ? 'invite' : 'login'))
  const className = isInvite
    ? pendingInvite?.className || '未命名课程'
    : inviteInfo?.className || loginInfo?.className || user?.classes[0]?.name || '未绑定课程'
  const role = isInvite
    ? (pendingInvite?.role ?? 'TA')
    : (inviteInfo?.role ?? loginInfo?.role ?? user?.role ?? 'TA')
  const identifier = loginInfo?.identifier || user?.studentId || user?.username || '—'

  const message =
    source === 'invite'
      ? `你正在创建新账号，因为你收到了来自 ${inviteInfo?.inviterName || '课程成员'} 的邀请链接。`
      : source === 'zjuam'
        ? `你正在创建新账号，因为你使用学在浙大登录了学号 ${identifier}，对应了 ${className} 课程。`
        : `你正在创建新账号，因为你使用学号 / 用户名 ${identifier} 登录了 ${className} 课程。`

  const alreadyComplete = Boolean(user?.username)
  const hasBoundStudentId = Boolean(user?.studentId)
  const hasExistingPassword = Boolean(user?.hasPassword)
  const needsIdentityProof = !hasBoundStudentId && !hasExistingPassword

  const usernameError =
    serverError?.field === 'username'
      ? serverError.message
      : !username.trim()
        ? '请输入用户名'
        : ''
  const nameError =
    serverError?.field === 'name' ? serverError.message : !name.trim() ? '请输入姓名' : ''
  const showUsernameError = Boolean(usernameError) && (touched.username || submitted)
  const showNameError = Boolean(nameError) && (touched.name || submitted)

  const bindPasskey = async () => {
    setBinding(true)
    try {
      const ok = await registerPasskey()
      if (!ok) return
      setBound(true)
      toast.success('已绑定通行密钥')
    } catch (error) {
      toast.error(getErrorMessage(error, '绑定失败'))
    } finally {
      setBinding(false)
    }
  }

  const finish = (target: string) => {
    setOnboarding(false)
    setOnboardingInfo(null)
    clearPendingInvite()
    navigate(target, { replace: true })
  }

  const abandon = () => {
    clearPendingInvite()
    setOnboarding(false)
    setOnboardingInfo(null)
    logout()
    navigate('/login', { replace: true })
  }

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    setSubmitted(true)
    setTouched({ username: true, name: true })
    setServerError(null)
    if (!username.trim() || !name.trim()) return
    if (needsIdentityProof && !studentId.trim() && !password) return
    setSaving(true)
    try {
      if (isInvite && pendingInvite) {
        const result = await acceptInvite({
          token: pendingInvite.token,
          studentId: studentId.trim() || undefined,
          username: username.trim(),
          name: name.trim(),
          password: password || undefined,
        })
        adoptSession(result)
        toast.success('账号已创建')
        finish(homePathFor(result.user))
      } else if (user?.role === 'STUDENT') {
        await unlockStudent({
          username: username.trim(),
          name: name.trim(),
          studentId: studentId.trim() || undefined,
          password: password || undefined,
        })
        await refresh()
        toast.success('账号已创建')
        finish('/student-console')
      } else {
        const updated = await completeSetup({
          username: username.trim(),
          name: name.trim(),
          studentId: studentId.trim() || undefined,
          password: password || undefined,
        })
        toast.success('账号已创建')
        finish(homePathFor(updated))
      }
    } catch (error) {
      if (error instanceof ApiError && error.code === 'USERNAME_TAKEN') {
        setServerError({ field: 'username', message: '该用户名已被占用' })
      } else {
        toast.error(getErrorMessage(error, '创建账号失败'))
      }
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
        className="w-full max-w-lg"
      >
        <div className="text-center">
          <h1 className="text-2xl font-bold tracking-tight">完善账号信息</h1>
        </div>

        <div className="mt-6 rounded-2xl border border-line bg-sunken p-4">
          <p className="text-sm leading-relaxed text-fg-muted">{message}</p>
        </div>
        <div className="mt-4 grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
          <span className="text-fg-subtle">课程</span>
          <span className="font-semibold text-fg">{className}</span>
          <span className="text-fg-subtle">身份</span>
          <span className="font-semibold text-fg">{ROLE_LABELS[role]}</span>
        </div>

        {alreadyComplete ? (
          <div className="mt-6 flex flex-col gap-3 rounded-2xl border border-line p-4 text-center">
            <p className="text-sm text-fg-muted">该账号信息已完善，无需再次创建。</p>
            <PendingButton
              fullWidth
              variant="secondary"
              onPress={() => finish(homePathFor(user!))}
            >
              返回首页
            </PendingButton>
          </div>
        ) : (
          <form onSubmit={submit} className="mt-6 flex flex-col gap-4">
            <div className="grid gap-3">
              <TextField
                fullWidth
                name="username"
                isRequired
                isInvalid={showUsernameError}
                value={username}
                onChange={(value) => {
                  setUsername(value)
                  if (serverError?.field === 'username') setServerError(null)
                }}
              >
                <Label className="mb-1.5 text-xs font-semibold text-fg-muted">用户名</Label>
                <Input
                  placeholder="设置后可用于登录"
                  autoComplete="username"
                  maxLength={32}
                  autoFocus
                  onBlur={() => setTouched((prev) => ({ ...prev, username: true }))}
                />
                {showUsernameError ? (
                  <FieldError className="text-[11px] text-danger">{usernameError}</FieldError>
                ) : (
                  <Description className="text-[11px] text-fg-subtle">
                    将会作为你的登录凭据。
                  </Description>
                )}
              </TextField>
              <TextField
                fullWidth
                name="name"
                isRequired
                isInvalid={showNameError}
                value={name}
                onChange={(value) => {
                  setName(value)
                  if (serverError?.field === 'name') setServerError(null)
                }}
              >
                <Label className="mb-1.5 text-xs font-semibold text-fg-muted">姓名</Label>
                <Input
                  placeholder="张三"
                  autoComplete="name"
                  maxLength={32}
                  onBlur={() => setTouched((prev) => ({ ...prev, name: true }))}
                />
                {showNameError ? (
                  <FieldError className="text-[11px] text-danger">{nameError}</FieldError>
                ) : (
                  <Description className="text-[11px] text-fg-subtle">
                    将会展示在各个页面上，推荐使用真实姓名，也可以使用你觉得不会被人误解的名称。
                  </Description>
                )}
              </TextField>
            </div>

            <div className="flex items-center gap-3 py-1">
              <div className="h-px flex-1 bg-line" />
              <span className="text-[10px] font-semibold uppercase tracking-widest text-fg-subtle">
                登录信息
              </span>
              <div className="h-px flex-1 bg-line" />
            </div>

            <div className="flex flex-col gap-4 rounded-2xl border border-line p-4">
              {!hasBoundStudentId && (
                <div>
                  <label className="mb-1.5 block text-xs font-semibold text-fg-muted">
                    学工号（选填）
                  </label>
                  <Input
                    fullWidth
                    value={studentId}
                    onChange={(event) => setStudentId(event.target.value)}
                    placeholder="请输入学工号"
                    autoComplete="off"
                    maxLength={32}
                  />
                  <p className="mt-1.5 text-[11px] leading-relaxed text-fg-subtle">
                    学工号绑定后不可修改，绑定后可用统一身份认证登录或找回密码。
                  </p>
                </div>
              )}

              <div>
                <label className="mb-1.5 block text-xs font-semibold text-fg-muted">
                  密码（选填）
                </label>
                <Input
                  fullWidth
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder={hasExistingPassword ? '留空则不更改密码' : '至少 8 位'}
                  minLength={password ? 8 : undefined}
                  autoComplete="new-password"
                />
                {hasBoundStudentId && !hasExistingPassword && (
                  <p className="mt-1.5 text-[11px] leading-relaxed text-fg-subtle">
                    如果不设置密码，后续只能使用浙大统一身份认证登录；进入工作台后也可以重新设置 / 修改密码。
                  </p>
                )}
                {needsIdentityProof && (
                  <>
                    <p className="mt-1.5 text-[11px] leading-relaxed text-fg-subtle">
                      密码设置后可用于用户名 / 密码登录，进入工作台后也可以修改。
                    </p>
                    <p className="mt-1.5 text-[11px] leading-relaxed text-danger">
                      至少要提供学工号或密码之一。
                    </p>
                  </>
                )}
              </div>

              {user && (
                <div className="flex flex-col gap-1">
                  <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-500/10 text-brand-600 dark:text-brand-300">
                      <Fingerprint width={18} height={18} className="shrink-0" />
                    </div>
                    <span className="flex-1 text-xs font-semibold text-fg-muted">
                      WebAuthn（选填）
                    </span>
                    <PendingButton
                      size="sm"
                      variant={bound ? 'ghost' : 'secondary'}
                      isPending={binding}
                      isDisabled={bound}
                      onPress={bindPasskey}
                      icon={bound ? Check : Plus}
                    >
                      {bound ? '已绑定' : '立即绑定本设备'}
                    </PendingButton>
                  </div>
                  <p className="text-[11px] text-fg-subtle">
                    Touch ID · Face ID · Windows Hello
                  </p>
                </div>
              )}
            </div>

            <PendingButton
              type="submit"
              fullWidth
              size="lg"
              isPending={saving}
              isDisabled={
                !username.trim() ||
                !name.trim() ||
                (needsIdentityProof && !studentId.trim() && !password) ||
                (password.length > 0 && password.length < 8)
              }
              className="mt-2 bg-gradient-to-r from-brand-600 to-brand-700 shadow-lg shadow-brand-600/25"
              icon={ArrowRight}
              pendingLabel="创建中"
            >
              创建账号
            </PendingButton>
          </form>
        )}

        <div className="mt-4 flex justify-center">
          <Button size="sm" variant="ghost" onPress={abandon}>
            放弃
          </Button>
        </div>
      </motion.div>
    </div>
  )
}
