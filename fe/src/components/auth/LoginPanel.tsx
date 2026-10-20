import HCaptcha from '@hcaptcha/react-hcaptcha'
import { Button, Input } from '@heroui/react'
import { startAuthentication } from '@simplewebauthn/browser'
import { AnimatePresence, motion } from 'motion/react'
import { useTheme } from 'next-themes'
import { useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { toast } from 'sonner'

import ArrowRight from '~icons/lucide/arrow-right'
import BookOpenCheck from '~icons/lucide/book-open-check'
import Ellipsis from '~icons/lucide/ellipsis'
import Fingerprint from '~icons/lucide/fingerprint'
import GraduationCap from '~icons/lucide/graduation-cap'
import KeyRound from '~icons/lucide/key-round'
import MonitorSmartphone from '~icons/lucide/monitor-smartphone'
import ShieldCheck from '~icons/lucide/shield-check'
import University from '~icons/lucide/university'
import Users from '~icons/lucide/users'
import { Logo } from '@/components/ui/Logo'
import { PendingButton } from '@/components/ui/PendingButton'
import { ThemeToggle } from '@/components/ui/ThemeToggle'
import { ApiError, isClassSelection, isLoginSelection } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import { getErrorMessage } from '@/lib/error'
import type { IconComponent } from '@/lib/icon'
import { getLastUsers, lastUserIdentifier, type LastUser } from '@/lib/last-user'
import { getAuthenticationOptions } from '@/lib/passkey'
import { getRuntimeInfo, isLocalhostHost } from '@/lib/runtime'
import { homePathFor } from '@/lib/student-route'
import { cn } from '@/lib/utils'

type Method = 'password' | 'zjuam'

const METHODS: { key: Method; icon: IconComponent; label: string }[] = [
  { key: 'password', icon: KeyRound, label: '账号密码' },
  { key: 'zjuam', icon: University, label: '统一身份认证' },
]

const HCAPTCHA_SITEKEY = import.meta.env.VITE_HCAPTCHA_SITEKEY ?? ''

export function LoginPanel() {
  const navigate = useNavigate()
  const location = useLocation()
  const { login } = useAuth()
  const { resolvedTheme } = useTheme()
  const isDark = resolvedTheme === 'dark'
  const [lastUsers] = useState<LastUser[]>(() => getLastUsers())
  const [showFull, setShowFull] = useState(false)
  const [showUserPicker, setShowUserPicker] = useState(false)
  const [method, setMethod] = useState<Method>('password')
  const [identifier, setIdentifier] = useState('')
  const [account, setAccount] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [passkeyLoading, setPasskeyLoading] = useState(false)
  const [prefilled, setPrefilled] = useState(false)
  const [captchaToken, setCaptchaToken] = useState<string | null>(null)
  const [captchaEnabled, setCaptchaEnabled] = useState(Boolean(HCAPTCHA_SITEKEY))
  const [captchaTheme, setCaptchaTheme] = useState<'light' | 'dark'>('light')
  const captchaRef = useRef<HCaptcha>(null)

  useEffect(() => {
    // localhost + 后端 dev 时后端会跳过 hCaptcha，前端也不再展示 / 要求验证
    if (!HCAPTCHA_SITEKEY) return
    let cancelled = false
    void getRuntimeInfo().then((info) => {
      if (cancelled || !info) return
      if (info.dev && isLocalhostHost()) setCaptchaEnabled(false)
    })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    // 已验证时保持组件不变，避免重绘清空勾选；重置后再同步当前主题
    if (!captchaToken) setCaptchaTheme(isDark ? 'dark' : 'light')
  }, [isDark, captchaToken])

  const lastUser = lastUsers[0] ?? null
  const passkeyUsers = lastUsers.filter((item) => item.hasWebauthn)
  const showLastCard = Boolean(lastUser) && !showFull && !showUserPicker
  const lastIdentifier = lastUser ? lastUserIdentifier(lastUser) : ''

  const switchMethod = (next: Method) => {
    if (next === method) return
    setMethod(next)
    setCaptchaToken(null)
    setIdentifier('')
    setAccount('')
    setPassword('')
  }

  const continueWithOtherMethod = (value = lastIdentifier) => {
    if (!lastUser) return
    setShowUserPicker(false)
    setMethod('password')
    setCaptchaToken(null)
    setIdentifier(value)
    setAccount('')
    setPassword('')
    setPrefilled(true)
    setShowFull(true)
  }

  const switchUser = () => {
    if (passkeyUsers.length > 1) {
      setShowUserPicker(true)
      setShowFull(false)
      setCaptchaToken(null)
      return
    }

    setShowUserPicker(false)
    setShowFull(true)
    setPrefilled(false)
    setMethod('password')
    setCaptchaToken(null)
    setIdentifier('')
    setAccount('')
    setPassword('')
  }

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()

    if (captchaEnabled && !captchaToken) {
      toast.error('请先完成人机验证')
      return
    }

    setLoading(true)

    const isZjuam = method === 'zjuam'
    const endpoint = isZjuam ? '/api/auth/zjuam/login' : '/api/auth/login'
    const body = isZjuam
      ? { account: account.trim(), password, captchaToken: captchaToken ?? undefined }
      : { identifier: identifier.trim(), password, captchaToken: captchaToken ?? undefined }

    const from = (location.state as { from?: string } | null)?.from
    try {
      const result = await login(endpoint, body)
      if (isLoginSelection(result)) {
        navigate('/login/select', {
          replace: true,
          state: {
            selectionToken: result.selectionToken,
            candidates: result.candidates,
            from,
          },
        })
        return
      }
      if (isClassSelection(result)) {
        navigate('/login/class', {
          replace: true,
          state: {
            selectionToken: result.selectionToken,
            courses: result.courses,
            from,
          },
        })
        return
      }
      const user = result.user
      toast.success(`欢迎回来，${user.name}`)
      const dest =
        user.role === 'STUDENT' ? homePathFor(user) : user.username ? (from ?? '/console') : '/setup'
      navigate(dest, { replace: true })
    } catch (error) {
      if (captchaEnabled) {
        captchaRef.current?.resetCaptcha()
        setCaptchaToken(null)
      }
      toast.error(getErrorMessage(error, '登录失败'))
    } finally {
      setLoading(false)
    }
  }

  const isZjuam = method === 'zjuam'

  const passkeyLogin = async (hint?: string) => {
    setPasskeyLoading(true)
    try {
      const { options, challengeToken } = await getAuthenticationOptions(hint)
      const assertion = await startAuthentication({ optionsJSON: options })
      const result = await login('/api/auth/passkey/authentication-verify', {
        response: assertion,
        challengeToken,
      })
      if (isLoginSelection(result) || isClassSelection(result)) return
      const user = result.user
      toast.success(`欢迎回来，${user.name}`)
      const from = (location.state as { from?: string } | null)?.from
      const dest =
        user.role === 'STUDENT' ? homePathFor(user) : user.username ? (from ?? '/console') : '/setup'
      navigate(dest, { replace: true })
    } catch (error) {
      if ((error as Error).name === 'NotAllowedError') return
      if (error instanceof ApiError && error.code === 'CREDENTIAL_NOT_FOUND') {
        toast.error('该通行密钥不可用，请改用密码登录')
        if (lastUser && !showFull) continueWithOtherMethod(hint ?? lastIdentifier)
        return
      }
      toast.error(getErrorMessage(error, '登录失败'))
    } finally {
      setPasskeyLoading(false)
    }
  }

  return (
    <div className="relative flex min-h-full flex-col items-center justify-center px-6 py-12">
      <div className="absolute right-4 top-4 flex items-center gap-1">
        <ThemeToggle />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
        className="w-full max-w-sm"
      >
        {/* mobile logo */}
        <div className="mb-8 flex items-center gap-3 lg:hidden">
          <Logo size={40} />
          <div>
            <div className="font-bold tracking-tight">欢迎回来</div>
            <div className="text-xs text-fg-subtle">登录计算机系统课程助教系统</div>
          </div>
        </div>

        <div className="hidden lg:block">
          <h2 className="text-2xl font-bold tracking-tight">欢迎回来</h2>
        </div>

        {showUserPicker ? (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
            className="mt-6 flex flex-col gap-3"
          >
            <div className="flex items-center gap-2 text-xs font-semibold text-fg-muted">
              <Users width={15} height={15} className="shrink-0" />
              选择上次登录用户
            </div>
            <div className="flex flex-col gap-2">
              {passkeyUsers.map((item) => {
                const identifier = lastUserIdentifier(item)
                return (
                  <button
                    key={item.id}
                    type="button"
                    disabled={passkeyLoading}
                    onClick={() => void passkeyLogin(identifier || undefined)}
                    className="flex items-center gap-3 rounded-2xl border border-line bg-sunken p-3 text-left transition-colors hover:bg-elevated disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-500/10 text-brand-600 dark:text-brand-300">
                      {item.role === 'TEACHER' ? (
                        <BookOpenCheck width={18} height={18} className="shrink-0" />
                      ) : item.role === 'STUDENT' ? (
                        <GraduationCap width={18} height={18} className="shrink-0" />
                      ) : (
                        <ShieldCheck width={18} height={18} className="shrink-0" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-semibold text-fg">{item.name}</div>
                      <div className="truncate text-xs text-fg-subtle">
                        {identifier || '—'} · 通行密钥
                      </div>
                    </div>
                    <Fingerprint
                      width={18}
                      height={18}
                      className="shrink-0 text-brand-600 dark:text-brand-300"
                    />
                  </button>
                )
              })}
            </div>
            <Button
              type="button"
              fullWidth
              variant="ghost"
              onPress={() => setShowUserPicker(false)}
            >
              返回
            </Button>
          </motion.div>
        ) : showLastCard && lastUser ? (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
            className="mt-6 flex flex-col gap-4"
          >
            <div className="flex items-center gap-3 rounded-2xl border border-line bg-sunken p-4">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-brand-500/10 text-brand-600 dark:text-brand-300">
                {lastUser.role === 'TEACHER' ? (
                  <BookOpenCheck width={20} height={20} className="shrink-0" />
                ) : lastUser.role === 'STUDENT' ? (
                  <GraduationCap width={20} height={20} className="shrink-0" />
                ) : (
                  <ShieldCheck width={20} height={20} className="shrink-0" />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-semibold text-fg">{lastUser.name}</div>
                <div className="truncate text-xs text-fg-subtle">
                  {lastIdentifier || '—'} ·{' '}
                  {lastUser.role === 'TEACHER'
                    ? '教师'
                    : lastUser.role === 'STUDENT'
                      ? '学生'
                      : '助教'}
                </div>
              </div>
              <span className="shrink-0 rounded-full bg-elevated px-2 py-0.5 text-[10px] font-semibold text-fg-subtle">
                上次登录
              </span>
            </div>

            {lastUser.hasWebauthn && (
              <PendingButton
                type="button"
                fullWidth
                isPending={passkeyLoading}
                onPress={() => passkeyLogin(lastIdentifier || undefined)}
                icon={Fingerprint}
                pendingLabel="验证中"
              >
                使用通行密钥继续
              </PendingButton>
            )}

            <Button type="button" fullWidth variant="secondary" onPress={() => continueWithOtherMethod()}>
              <Ellipsis width={16} height={16} className="shrink-0" />
              其它登录方式
            </Button>

            <Button type="button" fullWidth variant="secondary" onPress={switchUser}>
              <Users width={16} height={16} className="shrink-0" />
              切换用户
            </Button>
          </motion.div>
        ) : (
          <>
            {/* login method selector */}
            <div className="mt-6">
                <div className="mb-1.5 text-xs font-semibold text-fg-muted">登录方式</div>
                <div className="grid grid-cols-2 gap-1 rounded-2xl border border-line bg-sunken p-1.5">
                  {METHODS.map((item) => {
                    const active = method === item.key
                    return (
                      <button
                        key={item.key}
                        type="button"
                        onClick={() => switchMethod(item.key)}
                        className={cn(
                          'relative flex items-center justify-center gap-1.5 rounded-xl py-2 text-xs font-semibold transition-colors',
                          active ? 'text-fg' : 'text-fg-subtle hover:text-fg-muted',
                        )}
                      >
                        {active && (
                          <motion.span
                            layoutId="login-method-pill"
                            className="absolute inset-0 rounded-xl bg-elevated shadow-sm ring-1 ring-line"
                            transition={{ type: 'spring', stiffness: 500, damping: 35 }}
                          />
                        )}
                        <item.icon
                          width={16}
                          height={16}
                          className={cn('shrink-0', 'relative', active && 'text-brand-600 dark:text-brand-300')}
                        />
                        <span className="relative">{item.label}</span>
                      </button>
                    )
                  })}
                </div>
              </div>

            <AnimatePresence mode="wait">
              <motion.form
                key={method}
                onSubmit={submit}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
                className="mt-6 flex flex-col gap-4"
              >
                {isZjuam ? (
                  <div>
                    <label className="mb-1.5 block text-xs font-semibold text-fg-muted">
                      统一身份认证账号
                    </label>
                    <Input
                      fullWidth
                      value={account}
                      onChange={(e) => setAccount(e.target.value)}
                      placeholder="请输入统一身份认证账号"
                      autoComplete="username"
                      autoFocus
                      required
                    />
                  </div>
                ) : (
                  <div>
                    <label className="mb-1.5 block text-xs font-semibold text-fg-muted">
                      用户名 / 学号
                    </label>
                    <Input
                      fullWidth
                      value={identifier}
                      onChange={(e) => setIdentifier(e.target.value)}
                      placeholder="请输入用户名或学号"
                      autoComplete="username"
                      autoFocus={!prefilled}
                      required
                    />
                  </div>
                )}
                <div>
                  <label className="mb-1.5 block text-xs font-semibold text-fg-muted">密码</label>
                  <Input
                    fullWidth
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="请输入密码"
                    autoComplete="current-password"
                    autoFocus={prefilled && !isZjuam}
                    required
                  />
                </div>
                {isZjuam && (
                  <p className="text-xs text-fg-subtle">使用学校统一身份认证登录，无需本地账号</p>
                )}
                {captchaEnabled && (
                  <div className="flex justify-center">
                    <HCaptcha
                      key={captchaTheme}
                      ref={captchaRef}
                      sitekey={HCAPTCHA_SITEKEY}
                      theme={captchaTheme}
                      onVerify={(token) => setCaptchaToken(token)}
                      onExpire={() => setCaptchaToken(null)}
                      onError={() => setCaptchaToken(null)}
                      languageOverride="zh"
                    />
                  </div>
                )}
                <PendingButton
                  type="submit"
                  fullWidth
                  isPending={loading}
                  className="mt-2"
                  icon={ArrowRight}
                  pendingLabel="登录中"
                >
                  登录
                </PendingButton>
              </motion.form>
            </AnimatePresence>

            <div className="mt-6 flex flex-col gap-4">
                <div className="flex items-center gap-3">
                  <div className="h-px flex-1 bg-line" />
                  <span className="text-[10px] font-semibold uppercase tracking-widest text-fg-subtle">
                    或
                  </span>
                  <div className="h-px flex-1 bg-line" />
                </div>
                <PendingButton
                  type="button"
                  variant="ghost"
                  fullWidth
                  isPending={passkeyLoading}
                  onPress={() => passkeyLogin(identifier.trim() || undefined)}
                  icon={Fingerprint}
                  pendingLabel="验证中"
                >
                  使用通行密钥登录
                </PendingButton>
              </div>
          </>
        )}

        <Button
          variant="secondary"
          fullWidth
          className="mt-4"
          onPress={() => navigate('/checkin')}
        >
          <MonitorSmartphone width={15} height={15} className="shrink-0" />
          验收从机
        </Button>
      </motion.div>
    </div>
  )
}
