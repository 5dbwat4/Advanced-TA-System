import { Spinner } from '@heroui/react'
import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'

import MailCheck from '~icons/lucide/mail-check'
import { Card } from '@/components/ui/Card'
import { PendingButton } from '@/components/ui/PendingButton'
import { getInviteInfo, type InviteInfo, type InvitableRole } from '@/lib/api'
import { getErrorMessage } from '@/lib/error'
import { savePendingInvite } from '@/lib/onboarding'
import { useAppStore } from '@/lib/store'

const ROLE_LABELS: Record<InvitableRole, string> = {
  TA: '助教',
  TEACHER: '教师',
  VIEWER: '观察者',
}

export default function Invite() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const setOnboarding = useAppStore((state) => state.setOnboarding)
  const setOnboardingInfo = useAppStore((state) => state.setOnboardingInfo)
  const token = searchParams.get('token') ?? ''

  const [info, setInfo] = useState<InviteInfo | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!token) {
      setError('邀请链接无效')
      setLoading(false)
      return
    }

    let cancelled = false
    setLoading(true)
    getInviteInfo(token)
      .then((data) => {
        if (!cancelled) setInfo(data)
      })
      .catch((err) => {
        if (!cancelled) setError(getErrorMessage(err, '邀请链接无效或已过期'))
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [token])

  const goSetup = () => {
    if (!info) return
    savePendingInvite({
      token,
      inviterName: info.inviterName,
      className: info.className,
      role: info.role,
      expiresAt: info.expiresAt,
    })
    setOnboardingInfo(info)
    setOnboarding(true)
    navigate('/setup')
  }

  return (
    <div className="mx-auto max-w-xl">
      <Card className="flex flex-col gap-5">
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-brand-500/10 text-brand-600 dark:text-brand-300">
            <MailCheck width={20} height={20} className="shrink-0" />
          </span>
          <div>
            <h1 className="text-lg font-bold tracking-tight">课程邀请</h1>
            <p className="text-xs text-fg-subtle">接受后会在邀请人的课程中获得对应身份</p>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-10">
            <Spinner />
          </div>
        ) : error ? (
          <div className="rounded-xl border border-dashed border-danger/40 px-4 py-8 text-center text-sm text-danger">
            {error}
          </div>
        ) : info ? (
          <>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-xl border border-line bg-sunken px-4 py-3">
                <div className="text-[10px] font-semibold uppercase tracking-widest text-fg-subtle">
                  课程
                </div>
                <div className="mt-1 text-sm font-semibold">{info.className ?? '未命名课程'}</div>
              </div>
              <div className="rounded-xl border border-line bg-sunken px-4 py-3">
                <div className="text-[10px] font-semibold uppercase tracking-widest text-fg-subtle">
                  身份
                </div>
                <div className="mt-1 text-sm font-semibold">{ROLE_LABELS[info.role]}</div>
              </div>
              <div className="rounded-xl border border-line bg-sunken px-4 py-3">
                <div className="text-[10px] font-semibold uppercase tracking-widest text-fg-subtle">
                  邀请人
                </div>
                <div className="mt-1 text-sm font-semibold">{info.inviterName}</div>
              </div>
              <div className="rounded-xl border border-line bg-sunken px-4 py-3">
                <div className="text-[10px] font-semibold uppercase tracking-widest text-fg-subtle">
                  有效期至
                </div>
                <div className="mt-1 text-sm font-semibold">
                  {new Date(info.expiresAt).toLocaleString()}
                </div>
              </div>
            </div>

            <PendingButton fullWidth onPress={goSetup}>
              接受邀请并创建账号
            </PendingButton>
          </>
        ) : null}
      </Card>
    </div>
  )
}
