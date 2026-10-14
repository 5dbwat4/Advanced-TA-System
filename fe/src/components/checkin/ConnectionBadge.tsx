import Wifi from '~icons/lucide/wifi'
import WifiOff from '~icons/lucide/wifi-off'
import { useCheckoffConnection } from '@/lib/checkoff-socket'
import { cn } from '@/lib/utils'

/** 右上角的连接状态小块：外形像按钮但不可交互，仅展示 socket.io 连接状态。 */
export function ConnectionBadge() {
  const online = useCheckoffConnection()
  return (
    <div
      role="status"
      className={cn(
        'pointer-events-none absolute right-5 top-5 inline-flex items-center gap-1.5 rounded-full border bg-elevated px-3 py-1 text-xs font-semibold shadow-sm backdrop-blur',
        online ? 'border-success/30 text-success' : 'border-line text-fg-subtle',
      )}
    >
      {online ? (
        <Wifi width={13} height={13} className="shrink-0" />
      ) : (
        <WifiOff width={13} height={13} className="shrink-0" />
      )}
      {online ? 'Connected' : 'Disconnected'}
    </div>
  )
}
