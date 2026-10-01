import { Button, Input, Spinner } from '@heroui/react'
import { startAuthentication } from '@simplewebauthn/browser'
import { AnimatePresence, motion } from 'motion/react'
import { useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { toast } from 'sonner'

import ArrowRight from '~icons/lucide/arrow-right'
import BookOpenCheck from '~icons/lucide/book-open-check'
import Cpu from '~icons/lucide/cpu'
import Ellipsis from '~icons/lucide/ellipsis'
import Fingerprint from '~icons/lucide/fingerprint'
import KeyRound from '~icons/lucide/key-round'
import ShieldCheck from '~icons/lucide/shield-check'
import University from '~icons/lucide/university'
import Users from '~icons/lucide/users'
import { ThemeToggle } from '@/components/ui/ThemeToggle'
import { ApiError } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import type { IconComponent } from '@/lib/icon'
import { clearLastUser, getLastUser, lastUserIdentifier, type LastUser } from '@/lib/last-user'
import { getAuthenticationOptions } from '@/lib/passkey'
import { cn } from '@/lib/utils'

type Role = 'TA' | 'TEACHER'
type Method = 'password' | 'zjuam'

const ROLES: { key: Role; icon: IconComponent; label: string }[] = [
  { key: 'TA', icon: ShieldCheck, label: '助教' },
  { key: 'TEACHER', icon: BookOpenCheck, label: '教师' },
]

const METHODS: { key: Method; icon: IconComponent; label: string }[] = [
  { key: 'password', icon: KeyRound, label: '账号密码' },
  { key: 'zjuam', icon: University, label: '统一身份认证' },
]

export function LoginPanel() {
  const navigate = useNavigate()
  const location = useLocation()
  const { login } = useAuth()
  const [lastUser, setLastUser] = useState<LastUser | null>(() => getLastUser())
  const [showFull, setShowFull] = useState(false)
  const [role, setRole] = useState<Role>('TA')
  const [method, setMethod] = useState<Method>('password')
  const [identifier, setIdentifier] = useState('')
  const [account, setAccount] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [passkeyLoading, setPasskeyLoading] = useState(false)
  const [prefilled, setPrefilled] = useState(false)

  const showLastCard = Boolean(lastUser) && !showFull
  const lastIdentifier = lastUser ? lastUserIdentifier(lastUser) : ''

  const switchRole = (next: Role) => {
    if (next === role) return
    setRole(next)
    setMethod('password')
    setIdentifier('')
    setAccount('')
    setPassword('')
  }

  const switchMethod = (next: Method) => {
    if (next === method) return
    setMethod(next)
    setIdentifier('')
    setAccount('')
    setPassword('')
  }

  const continueWithOtherMethod = () => {
    if (!lastUser) return
    setRole(lastUser.role)
    setMethod('password')
    setIdentifier(lastIdentifier)
    setAccount('')
    setPassword('')
    setPrefilled(true)
    setShowFull(true)
  }

  const switchAccount = () => {
    clearLastUser()
    setLastUser(null)
    setShowFull(true)
    setPrefilled(false)
    setRole('TA')
    setMethod('password')
    setIdentifier('')
    setAccount('')
    setPassword('')
  }

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()

    const isZjuam = role === 'TA' && method === 'zjuam'
    const endpoint = isZjuam
      ? '/api/auth/zjuam/login'
      : role === 'TEACHER'
        ? '/api/auth/login/teacher'
        : '/api/auth/login/ta'
    const body = isZjuam
      ? { account: account.trim(), password }
      : { identifier: identifier.trim(), password }

    const from = (location.state as { from?: string } | null)?.from
    setLoading(true)
    try {
      const user = await login(endpoint, body)
      toast.success(`欢迎回来，${user.name}`)
      const dest = user.username ? (from ?? '/console') : '/setup'
      navigate(dest, { replace: true })
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '登录失败')
    } finally {
      setLoading(false)
    }
  }

  const isZjuam = role === 'TA' && method === 'zjuam'

  const passkeyLogin = async (hint?: string) => {
    setPasskeyLoading(true)
    try {
      const { options, challengeToken } = await getAuthenticationOptions(hint)
      const assertion = await startAuthentication({ optionsJSON: options })
      const user = await login('/api/auth/passkey/authentication-verify', {
        response: assertion,
        challengeToken,
      })
      toast.success(`欢迎回来，${user.name}`)
      const from = (location.state as { from?: string } | null)?.from
      const dest = user.username ? (from ?? '/console') : '/setup'
      navigate(dest, { replace: true })
    } catch (error) {
      if ((error as Error).name === 'NotAllowedError') return
      if (error instanceof ApiError && error.code === 'CREDENTIAL_NOT_FOUND') {
        toast.error('该通行密钥不可用，请改用密码登录')
        if (lastUser && !showFull) continueWithOtherMethod()
        return
      }
      toast.error(error instanceof Error ? error.message : '登录失败')
    } finally {
      setPasskeyLoading(false)
    }
  }

  return (
    <div className="relative flex flex-1 flex-col items-center justify-center px-6 py-12">
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
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-brand-500 to-brand-700 text-white shadow-lg shadow-brand-500/25">
            <Cpu width={20} height={20} className="shrink-0" />
          </div>
          <div>
            <div className="font-bold tracking-tight">欢迎回来</div>
            <div className="text-xs text-fg-subtle">登录计算机系统课程助教系统</div>
          </div>
        </div>

        <div className="hidden lg:block">
          <h2 className="text-2xl font-bold tracking-tight">欢迎回来</h2>
          <p className="mt-1 text-sm text-fg-muted">使用助教或教师账号登录</p>
        </div>

        {showLastCard && lastUser ? (
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
                ) : (
                  <ShieldCheck width={20} height={20} className="shrink-0" />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-semibold text-fg">{lastUser.name}</div>
                <div className="truncate text-xs text-fg-subtle">
                  {lastIdentifier || '—'} · {lastUser.role === 'TEACHER' ? '教师' : '助教'}
                </div>
              </div>
              <span className="shrink-0 rounded-full bg-elevated px-2 py-0.5 text-[10px] font-semibold text-fg-subtle">
                上次登录
              </span>
            </div>

            {lastUser.hasWebauthn && (
              <Button
                type="button"
                fullWidth
                isPending={passkeyLoading}
                onPress={() => passkeyLogin(lastIdentifier || undefined)}
              >
                {({ isPending }) => (
                  <>
                    {isPending ? (
                      <Spinner color="current" size="sm" />
                    ) : (
                        <Fingerprint width={16} height={16} className="shrink-0" />
                    )}
                    {isPending ? '验证中' : '使用通行密钥继续'}
                  </>
                )}
              </Button>
            )}

            <Button type="button" fullWidth variant="secondary" onPress={continueWithOtherMethod}>
              <Ellipsis width={16} height={16} className="shrink-0" />
              其它登录方式
            </Button>

            <Button type="button" fullWidth variant="secondary" onPress={switchAccount}>
              <Users width={16} height={16} className="shrink-0" />
              切换账号
            </Button>
          </motion.div>
        ) : (
          <>
            {/* role selector */}
            <div className="mt-6 grid grid-cols-2 gap-2 rounded-2xl border border-line bg-sunken p-1.5">
              {ROLES.map((item) => {
                const active = role === item.key
                return (
                  <button
                    key={item.key}
                    type="button"
                    onClick={() => switchRole(item.key)}
                    className={cn(
                      'relative flex flex-col items-center gap-1 rounded-xl py-2.5 text-xs font-semibold transition-colors',
                      active ? 'text-fg' : 'text-fg-subtle hover:text-fg-muted',
                    )}
                  >
                    {active && (
                      <motion.span
                        layoutId="login-role-pill"
                        className="absolute inset-0 rounded-xl bg-elevated shadow-sm ring-1 ring-line"
                        transition={{ type: 'spring', stiffness: 500, damping: 35 }}
                      />
                    )}
                    <item.icon
                      width={18}
                      height={18}
                      className={cn('shrink-0', 'relative', active && 'text-brand-600 dark:text-brand-300')}
                    />
                    <span className="relative">{item.label}</span>
                  </button>
                )
              })}
            </div>

            {/* login method selector (TA only) */}
            {role === 'TA' && (
              <div className="mt-4">
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
            )}

            <AnimatePresence mode="wait">
              <motion.form
                key={role + method}
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
                <Button type="submit" fullWidth isPending={loading} className="mt-2">
                  {({ isPending }) => (
                    <>
                      {isPending ? (
                        <Spinner color="current" size="sm" />
                      ) : (
                        <ArrowRight width={16} height={16} className="shrink-0" />
                      )}
                      {isPending ? '登录中' : '登录'}
                    </>
                  )}
                </Button>
              </motion.form>
            </AnimatePresence>

            {role === 'TA' && (
              <div className="mt-6 flex flex-col gap-4">
                <div className="flex items-center gap-3">
                  <div className="h-px flex-1 bg-line" />
                  <span className="text-[10px] font-semibold uppercase tracking-widest text-fg-subtle">
                    或
                  </span>
                  <div className="h-px flex-1 bg-line" />
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  fullWidth
                  isPending={passkeyLoading}
                  onPress={() => passkeyLogin(identifier.trim() || undefined)}
                >
                  {({ isPending }) => (
                    <>
                      {isPending ? (
                        <Spinner color="current" size="sm" />
                      ) : (
                      <Fingerprint width={16} height={16} className="shrink-0" />
                      )}
                      {isPending ? '验证中' : '使用通行密钥登录'}
                    </>
                  )}
                </Button>
              </div>
            )}
          </>
        )}

        <p className="mt-6 text-center text-xs text-fg-subtle">
          学生登录暂未开放，敬请期待
        </p>
      </motion.div>
    </div>
  )
}
