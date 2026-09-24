import { Button, Input, Spinner } from '@heroui/react'
import { motion } from 'motion/react'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'

import { Icon } from '@/components/ui/Icon'
import { ThemeToggle } from '@/components/ui/ThemeToggle'
import { useAuth } from '@/lib/auth'
import { registerPasskey } from '@/lib/passkey'

export default function Setup() {
  const navigate = useNavigate()
  const { user, completeSetup } = useAuth()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [saving, setSaving] = useState(false)
  const [bound, setBound] = useState(user?.hasWebauthn ?? false)
  const [binding, setBinding] = useState(false)

  const bindPasskey = async () => {
    setBinding(true)
    try {
      const ok = await registerPasskey()
      if (!ok) return
      setBound(true)
      toast.success('已绑定通行密钥')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '绑定失败')
    } finally {
      setBinding(false)
    }
  }

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    setSaving(true)
    try {
      await completeSetup({ username: username.trim(), password: password ? password : undefined })
      toast.success('资料已完善')
      navigate('/console', { replace: true })
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '保存失败')
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
          <h1 className="text-2xl font-bold tracking-tight">完善信息</h1>
        </div>

        <form onSubmit={submit} className="mt-6 flex flex-col gap-4">
          <div>
            <label className="mb-1.5 block text-xs font-semibold text-fg-muted">姓名（必填）</label>
            <Input
              fullWidth
              value={username}
              onChange={(e) => setUsername(e.target.value)}
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

          <div className="flex flex-col gap-4 rounded-2xl border border-line p-4">
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-fg-muted">密码（选填）</label>
              <Input
                fullWidth
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="至少 8 位"
                minLength={password ? 8 : undefined}
                autoComplete="new-password"
              />
            </div>

            <div className="flex flex-col gap-1">
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-500/10 text-brand-600 dark:text-brand-300">
                  <Icon icon="lucide:fingerprint" width={18} />
                </div>
                <span className="flex-1 text-xs font-semibold text-fg-muted">Webauthn（选填）</span>
                <Button
                  size="sm"
                  variant={bound ? 'ghost' : 'secondary'}
                  isPending={binding}
                  isDisabled={bound}
                  onPress={bindPasskey}
                >
                  {({ isPending }) => (
                    <>
                      {isPending ? (
                        <Spinner color="current" size="sm" />
                      ) : (
                        <Icon icon={bound ? 'lucide:check' : 'lucide:plus'} width={16} />
                      )}
                      {bound ? '已绑定' : '立即绑定本设备'}
                    </>
                  )}
                </Button>
              </div>
              <p className="text-[11px] text-fg-subtle">Touch ID · Face ID · Windows Hello</p>
            </div>
          </div>

          <Button
            type="submit"
            fullWidth
            size="lg"
            isPending={saving}
            className="mt-2 bg-gradient-to-r from-brand-600 to-brand-700 shadow-lg shadow-brand-600/25"
          >
            {({ isPending }) => (
              <>
                {isPending ? (
                  <Spinner color="current" size="sm" />
                ) : (
                  <Icon icon="lucide:arrow-right" width={16} />
                )}
                {isPending ? '保存中' : '完成'}
              </>
            )}
          </Button>
        </form>
      </motion.div>
    </div>
  )
}
