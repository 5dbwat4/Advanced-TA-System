import { Button } from '@heroui/react'
import { useState } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import { toast } from 'sonner'

import GraduationCap from '~icons/lucide/graduation-cap'
import ShieldCheck from '~icons/lucide/shield-check'
import { Logo } from '@/components/ui/Logo'
import type { LoginCandidate } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import { getErrorMessage } from '@/lib/error'
import { homePathFor } from '@/lib/student-route'

type SelectState = {
  selectionToken: string
  candidates: LoginCandidate[]
  from?: string
}

const ROLE_LABEL: Record<string, string> = {
  TA: '助教',
  TEACHER: '教师',
  STUDENT: '学生',
}

export default function LoginSelect() {
  const location = useLocation()
  const navigate = useNavigate()
  const { selectAccount } = useAuth()
  const state = location.state as SelectState | null
  const [pendingId, setPendingId] = useState<string | null>(null)

  if (!state?.selectionToken || !state.candidates?.length) {
    return <Navigate to="/login" replace />
  }

  const { selectionToken, candidates, from } = state

  const choose = async (candidate: LoginCandidate) => {
    setPendingId(candidate.userId)
    try {
      const user = await selectAccount(selectionToken, candidate.userId)
      toast.success(`欢迎回来，${user.name}`)
      const dest = user.role === 'STUDENT' ? homePathFor(user) : (from ?? '/console')
      navigate(dest, { replace: true })
    } catch (error) {
      toast.error(getErrorMessage(error, '登录失败，请重新登录'))
      navigate('/login', { replace: true })
    } finally {
      setPendingId(null)
    }
  }

  return (
    <div className="diagonal-bg flex min-h-screen items-center justify-center px-5 py-10">
      <div className="w-full max-w-md">
        <div className="mb-6 flex flex-col items-center gap-3 text-center">
          <Logo size={40} />
          <div>
            <h1 className="text-lg font-bold tracking-tight">选择要登录的班级</h1>
            <p className="mt-1 text-xs text-fg-subtle">你的账号同时属于多个班级</p>
          </div>
        </div>

        <div className="flex flex-col gap-2">
          {candidates.map((candidate) => {
            const isStudent = candidate.role === 'STUDENT'
            const Icon = isStudent ? GraduationCap : ShieldCheck
            return (
              <Button
                key={candidate.userId}
                variant="secondary"
                fullWidth
                className="h-auto justify-start px-4 py-3"
                isDisabled={pendingId !== null}
                onPress={() => void choose(candidate)}
              >
                <span className="flex w-full items-center gap-3 text-left">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-500/10 text-brand-600 dark:text-brand-300">
                    <Icon width={18} height={18} className="shrink-0" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-fg">
                      {candidate.name}
                      <span className="ml-2 text-xs font-normal text-fg-subtle">
                        {ROLE_LABEL[candidate.role] ?? candidate.role}
                      </span>
                    </span>
                    <span className="block truncate text-xs text-fg-subtle">
                      {[candidate.studentId, candidate.className].filter(Boolean).join(' · ') ||
                        '未绑定班级'}
                    </span>
                  </span>
                  {pendingId === candidate.userId && (
                    <span className="text-xs text-fg-subtle">登录中…</span>
                  )}
                </span>
              </Button>
            )
          })}
        </div>

        <Button
          variant="ghost"
          fullWidth
          className="mt-4"
          onPress={() => navigate('/login', { replace: true })}
        >
          返回登录
        </Button>
      </div>
    </div>
  )
}
