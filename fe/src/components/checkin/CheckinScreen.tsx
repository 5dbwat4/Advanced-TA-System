import { Spinner } from '@heroui/react'
import type { ReactNode } from 'react'

import { SlaveCard } from '@/components/checkin/SlaveCard'
import { Icon } from '@/components/ui/Icon'
import { useCheckoffSlave } from '@/lib/checkoff-socket'

const statusCardClass =
  'flex flex-col items-center gap-3 rounded-3xl border border-line bg-elevated/80 p-10 text-center shadow-2xl backdrop-blur-xl'

function StatusCard({ children }: { children: ReactNode }) {
  return <div className={statusCardClass}>{children}</div>
}

function ConnectingCard() {
  return (
    <StatusCard>
      <Spinner size="lg" />
      <div className="text-sm text-fg-muted">正在连接…</div>
    </StatusCard>
  )
}

export function CheckinScreen({ token, code }: { token?: string; code?: string }) {
  const { state, connected, closed, error } = useCheckoffSlave({ token, code })

  let content: ReactNode
  if (closed) {
    content = (
      <StatusCard>
        <Icon icon="lucide:circle-check" width={28} className="text-fg-subtle" />
        <div className="text-sm font-semibold text-fg">会话已结束</div>
      </StatusCard>
    )
  } else if (error === 'SESSION_NOT_FOUND') {
    content = (
      <StatusCard>
        <Icon icon="lucide:search-x" width={28} className="text-fg-subtle" />
        <div className="text-sm font-semibold text-fg">会话不存在或已结束</div>
      </StatusCard>
    )
  } else if (!connected || !state) {
    content = <ConnectingCard />
  } else {
    content = <SlaveCard state={state} />
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#0a0f1e] px-5 py-10 [background-image:repeating-linear-gradient(135deg,rgba(255,255,255,0.035)_0px,rgba(255,255,255,0.035)_1px,transparent_1px,transparent_14px)]">
      <div className="w-full max-w-lg">
        <div className="mb-6 flex items-center justify-center gap-2 text-xs font-semibold uppercase tracking-widest text-white/50">
          <Icon icon="lucide:cpu" width={15} />
          CS-II Checkoff
        </div>
        {content}
      </div>
    </div>
  )
}
