import { Button, Spinner } from '@heroui/react'
import { useTheme } from 'next-themes'
import { useEffect, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'

import ArrowLeft from '~icons/lucide/arrow-left'
import CircleCheck from '~icons/lucide/circle-check'
import Cpu from '~icons/lucide/cpu'
import SearchX from '~icons/lucide/search-x'
import { ConnectionBadge } from '@/components/checkin/ConnectionBadge'
import { SlaveCard } from '@/components/checkin/SlaveCard'
import { useCheckoffSlave } from '@/lib/checkoff-socket'
import { cn } from '@/lib/utils'

const statusCardClass =
  'flex flex-col items-center gap-3 rounded-3xl border border-line bg-elevated/80 p-10 text-center shadow-2xl backdrop-blur-xl'

function StatusCard({ children }: { children: ReactNode }) {
  return <div className={statusCardClass}>{children}</div>
}

function BackButton({ onPress }: { onPress: () => void }) {
  return (
    <Button variant="secondary" size="sm" onPress={onPress}>
      <ArrowLeft width={14} height={14} className="shrink-0" />
      返回
    </Button>
  )
}

function ConnectingCard() {
  return (
    <StatusCard>
      <Spinner size="lg" />
      <div className="text-sm text-fg-muted">正在连接…</div>
    </StatusCard>
  )
}

export function CheckinScreen({
  token,
  code,
  onBack,
}: {
  token?: string
  code?: string
  onBack?: () => void
}) {
  const { state, meta, connected, closed, error, sessionToken } = useCheckoffSlave({ token, code })
  const { setTheme } = useTheme()
  const navigate = useNavigate()

  useEffect(() => {
    if (meta?.theme) setTheme(meta.theme)
  }, [meta?.theme, setTheme])

  // 用 pin 码加入成功后，把地址栏推进到 /checkin/<token>：该 token 是稳定的会话标识，
  // 刷新或分享链接即可直接按 token 重新加入，而不再依赖会轮换的 pin。
  useEffect(() => {
    if (!code || !sessionToken) return
    navigate(`/checkin/${sessionToken}`)
  }, [code, sessionToken, navigate])

  const isQuestion = connected && state?.kind === 'ask_question'

  let content: ReactNode
  if (closed) {
    content = (
      <StatusCard>
        <CircleCheck width={28} height={28} className="shrink-0 text-fg-subtle" />
        <div className="text-sm font-semibold text-fg">会话已结束</div>
        {onBack && <BackButton onPress={onBack} />}
      </StatusCard>
    )
  } else if (error === 'SESSION_NOT_FOUND') {
    content = (
      <StatusCard>
        <SearchX width={28} height={28} className="shrink-0 text-fg-subtle" />
        <div className="text-sm font-semibold text-fg">会话不存在或已结束</div>
        {onBack && <BackButton onPress={onBack} />}
      </StatusCard>
    )
  } else if (!connected || !state) {
    content = <ConnectingCard />
  } else {
    content = <SlaveCard state={state} markdownStyle={meta?.markdownStyle} />
  }

  return (
    <div className="diagonal-bg relative flex min-h-screen items-center justify-center px-5 py-10">
      <ConnectionBadge />
      <div className={cn(isQuestion ? 'w-fit max-w-[75%]' : 'w-full max-w-lg')}>
        <div className="mb-6 flex items-center justify-center gap-2 text-xs font-semibold uppercase tracking-widest text-fg-subtle">
          <Cpu width={15} height={15} className="shrink-0" />
          计算机系统课程 Checkoff
        </div>
        {content}
      </div>
    </div>
  )
}
