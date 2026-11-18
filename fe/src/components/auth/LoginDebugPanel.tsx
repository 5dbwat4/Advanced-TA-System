import { Checkbox, TextArea } from '@heroui/react'
import { motion } from 'motion/react'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'

import { Logo } from '@/components/ui/Logo'
import { PendingButton } from '@/components/ui/PendingButton'
import { ThemeToggle } from '@/components/ui/ThemeToggle'
import { apiFetch, getToken, setToken, type User } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import { getErrorMessage } from '@/lib/error'
import { homePathFor } from '@/lib/student-route'
import { useAppStore } from '@/lib/store'

export function LoginDebugPanel() {
  const navigate = useNavigate()
  const { adoptSession } = useAuth()
  const setOnboarding = useAppStore((state) => state.setOnboarding)
  const setOnboardingInfo = useAppStore((state) => state.setOnboardingInfo)
  const debugMode = useAppStore((state) => state.debugMode)
  const setDebugMode = useAppStore((state) => state.setDebugMode)
  const [jwt, setJwt] = useState('')
  const [loading, setLoading] = useState(false)

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    const token = jwt.trim()
    if (!token) {
      toast.error('请输入 JWT')
      return
    }

    setLoading(true)
    const previousToken = getToken()
    setToken(token)
    try {
      const { user } = await apiFetch<{ user: User }>('/api/auth/me')
      adoptSession({ token, user })

      if (!user.username && !debugMode) {
        setOnboardingInfo({
          source: 'login',
          identifier: user.studentId ?? null,
          className: user.classes[0]?.name ?? null,
          role: user.role,
        })
        setOnboarding(true)
      } else {
        setOnboarding(false)
        setOnboardingInfo(null)
      }

      toast.success(`欢迎回来，${user.name}`)
      navigate(homePathFor(user), { replace: true })
    } catch (error) {
      setToken(previousToken)
      toast.error(getErrorMessage(error, '登录失败'))
    } finally {
      setLoading(false)
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
        <div className="mb-8 flex items-center gap-3 lg:hidden">
          <Logo size={40} />
        </div>

        <h2 className="text-2xl font-bold tracking-tight">Input a JWT to login</h2>

        <form onSubmit={submit} className="mt-6 flex flex-col gap-4">
          <div>
            <label htmlFor="jwt" className="mb-1.5 block text-xs font-semibold text-fg-muted">
              JWT
            </label>
            <TextArea
              id="jwt"
              fullWidth
              rows={6}
              value={jwt}
              onChange={(event) => setJwt(event.target.value)}
              placeholder="eyJhbGciOiJIUzI1NiIs..."
              autoComplete="off"
              spellCheck={false}
              className="w-full font-mono text-xs"
              style={{ resize: 'vertical' }}
            />
          </div>

          <Checkbox isSelected={debugMode} onChange={setDebugMode}>
            <Checkbox.Content>
              <Checkbox.Control>
                <Checkbox.Indicator />
              </Checkbox.Control>
              <span className="text-xs text-fg-muted">
                Skip setup procedure(Not recommend, as it can be buggy)
              </span>
            </Checkbox.Content>
          </Checkbox>

          <PendingButton
            type="submit"
            fullWidth
            className="mt-2"
            isPending={loading}
            isDisabled={!jwt.trim()}
            pendingLabel="登录中"
          >
            Login using that JWT
          </PendingButton>
        </form>
      </motion.div>
    </div>
  )
}
