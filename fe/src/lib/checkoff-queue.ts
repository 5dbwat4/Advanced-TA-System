import { toast } from 'sonner'

import { fetchCheckoffSessions } from '@/lib/api'
import { useCheckoffQueueUpdates } from '@/lib/checkoff-socket'
import { useAsyncData } from '@/lib/request'

export function useCheckoffQueueSession(classId: string | null | undefined) {
  const { data, loading, error, reload } = useAsyncData(
    () => (classId ? fetchCheckoffSessions(classId) : Promise.resolve(null)),
    [classId],
  )
  const session =
    data?.sessions.find((candidate) => candidate.classId === classId && !candidate.closedAt) ??
    null

  useCheckoffQueueUpdates(
    classId,
    reload,
    session
      ? (event) => toast.info(`${event.name}位序发生变动，预叫号被停止`)
      : undefined,
  )

  return { session, enabled: session !== null, loading, error, reload }
}
