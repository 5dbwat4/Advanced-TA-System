import { Button, Input } from '@heroui/react'
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
import { unlockStudent } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import { getErrorMessage } from '@/lib/error'
import { registerPasskey } from '@/lib/passkey'

export default function StudentUnlock() {
  const navigate = useNavigate()
  const { user, refresh, logout } = useAuth()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [saving, setSaving] = useState(false)
  const [bound, setBound] = useState(user?.hasWebauthn ?? false)
  const [binding, setBinding] = useState(false)

  if (!user) return null
  if (user.role !== 'STUDENT') return <Navigate to="/console" replace />
  if (user.username) return <Navigate to="/student-console" replace />

  const bindPasskey = async () => {
    setBinding(true)
    try {
      const ok = await registerPasskey()
      if (!ok) return
      setBound(true)
      await refresh()
      toast.success('已绑定通行密钥')
    } catch (error) {
      toast.error(getErrorMessage(error, '绑定失败'))
    } finally {
      setBinding(false)
    }
  }

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    setSaving(true)
    try {
      await unlockStudent({
        username: username.trim(),
        password: password ? password : undefined,
      })
      await refresh()
      toast.success('设置成功')
      navigate('/student-console', { replace: true })
    } catch (error) {
      toast.error(getErrorMessage(error, '解封失败'))
    } finally {
      setSaving(false)
    }
  }

  const classNames = user.classes.map((item) => item.name).join('、') || '未绑定班级'

  const cancelLogin = () => {
    logout()
    navigate('/login', { replace: true })
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
          <h1 className="text-2xl font-bold tracking-tight">首次进入</h1>
        </div>

        <div className="mt-4 overflow-hidden rounded-xl border border-line text-left">
          <table className="w-full border-collapse text-xs">
            <tbody className="divide-y divide-line">
              <tr>
                <th scope="row" className="w-16 bg-sunken px-3 py-2 text-left font-medium text-fg-subtle">
                  姓名
                </th>
                <td className="px-3 py-2 text-fg">{user.name}</td>
              </tr>
              <tr>
                <th scope="row" className="w-16 bg-sunken px-3 py-2 text-left font-medium text-fg-subtle">
                  学号
                </th>
                <td className="px-3 py-2 text-fg">{user.studentId ?? '—'}</td>
              </tr>
              <tr>
                <th scope="row" className="w-16 bg-sunken px-3 py-2 text-left font-medium text-fg-subtle">
                  班级
                </th>
                <td className="px-3 py-2 text-fg">{classNames}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <form onSubmit={submit} className="mt-6 flex flex-col gap-4">
          <div>
            <label className="mb-1.5 block text-xs font-semibold text-fg-muted">用户名</label>
            <Input
              fullWidth
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="设置后可用于登录"
              minLength={1}
              maxLength={32}
              autoComplete="username"
              autoFocus
              required
            />
          </div>

          <div className="flex flex-col gap-4 rounded-2xl border border-line p-4">
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-fg-muted">密码（选填）</label>
              <Input
                fullWidth
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="留空则不设置密码"
                minLength={password ? 8 : undefined}
                autoComplete="new-password"
              />
            </div>

            <div className="flex flex-col gap-1">
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-500/10 text-brand-600 dark:text-brand-300">
                  <Fingerprint width={18} height={18} className="shrink-0" />
                </div>
                <span className="flex-1 text-xs font-semibold text-fg-muted">WebAuthn（选填）</span>
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
              <p className="text-[11px] text-fg-subtle">Touch ID · Face ID · Windows Hello</p>
            </div>
          </div>

          <p className="text-[11px] text-fg-subtle">
            设置用户名后，你可以用用户名或密码登录；也可以继续使用统一身份认证。
          </p>

          <PendingButton
            type="submit"
            fullWidth
            size="lg"
            isPending={saving}
            isDisabled={!username.trim() || (password.length > 0 && password.length < 8)}
            className="mt-1 bg-gradient-to-r from-brand-600 to-brand-700 shadow-lg shadow-brand-600/25"
            icon={ArrowRight}
            pendingLabel="进入中"
          >
            进入
          </PendingButton>

          <Button type="button" fullWidth variant="ghost" onPress={cancelLogin}>
            取消登录
          </Button>
        </form>
      </motion.div>
    </div>
  )
}
