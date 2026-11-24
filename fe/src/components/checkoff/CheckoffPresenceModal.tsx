import { Modal, Spinner, useOverlayState } from '@heroui/react'
import Users from '~icons/lucide/users'

import { AvatarImage } from '@/components/ui/AvatarImage'
import type { CheckoffRecord } from '@/lib/api'
import type { CheckoffPeer } from '@/lib/checkoff-socket'
import { formatLocaleDateTime } from '@/lib/format'
import { SCORE_TYPES } from '@/lib/scores'
import { cn } from '@/lib/utils'

const TYPE_LABELS = new Map<number, string>(
  SCORE_TYPES.map((type) => [type.value, type.label]),
)

type CheckoffPresenceModalProps = {
  state: ReturnType<typeof useOverlayState>
  peers: CheckoffPeer[]
  records: CheckoffRecord[]
  recordsLoading: boolean
  currentUserId?: string
}

export function CheckoffPresenceModal({
  state,
  peers,
  records,
  recordsLoading,
  currentUserId,
}: CheckoffPresenceModalProps) {
  return (
    <Modal state={state}>
      <Modal.Backdrop>
        <Modal.Container>
          <Modal.Dialog className="sm:max-w-lg">
            <Modal.CloseTrigger />
            <Modal.Header>
              <Modal.Icon className="bg-brand-500/10 text-brand-600 dark:text-brand-300">
                <Users width={18} height={18} className="shrink-0" />
              </Modal.Icon>
              <Modal.Heading>现在谁正在验收</Modal.Heading>
            </Modal.Header>
            <Modal.Body className="flex flex-col gap-5">
              <section className="flex flex-col gap-2">
                <div className="text-xs font-semibold tracking-wider text-fg-subtle">
                  正在线上 {peers.length}
                </div>
                {peers.length === 0 ? (
                  <p className="rounded-xl border border-dashed border-line py-4 text-center text-xs text-fg-subtle">
                    暂无其他人在验收页
                  </p>
                ) : (
                  peers.map((peer) => {
                    const studentNames =
                      peer.students?.map((student) => student.studentName) ??
                      (peer.studentName ? [peer.studentName] : [])
                    const active = studentNames.length > 0
                    return (
                      <div
                        key={peer.userId}
                        className="flex items-start gap-3 rounded-xl border border-line bg-sunken px-3 py-2"
                      >
                        <AvatarImage
                          id={peer.avatar}
                          size={32}
                          fallback={peer.name.slice(0, 1)}
                        />
                        <div className="min-w-0 flex-1 truncate pt-1.5 text-sm font-semibold text-fg">
                          {peer.name}
                          {peer.userId === currentUserId && (
                            <span className="ml-1 text-xs font-normal text-fg-subtle">（我）</span>
                          )}
                        </div>
                        <span
                          className={cn(
                            'max-w-[60%] pt-1.5 text-right text-xs leading-5',
                            active
                              ? 'font-medium text-brand-600 dark:text-brand-300'
                              : 'text-fg-subtle',
                          )}
                        >
                          {active ? `正在验收 ${studentNames.join('、')}` : '空闲'}
                        </span>
                      </div>
                    )
                  })
                )}
              </section>

              <section className="flex flex-col gap-2">
                <div className="text-xs font-semibold tracking-wider text-fg-subtle">最近保存</div>
                {recordsLoading ? (
                  <div className="flex justify-center py-4">
                    <Spinner size="sm" />
                  </div>
                ) : records.length === 0 ? (
                  <p className="rounded-xl border border-dashed border-line py-4 text-center text-xs text-fg-subtle">
                    暂无记录
                  </p>
                ) : (
                  records.map((record, index) => (
                    <div
                      key={`${record.userId}-${record.type}-${record.updatedAt}-${index}`}
                      className="flex items-center gap-3 rounded-xl border border-line px-3 py-2"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-semibold text-fg">
                          {record.studentName}
                        </div>
                        <div className="truncate text-xs text-fg-muted">
                          {record.experimentMark ? `${record.experimentMark} · ` : ''}
                          {record.experimentTitle} · {TYPE_LABELS.get(record.type) ?? record.type}
                        </div>
                      </div>
                      <div className="shrink-0 text-right">
                        <div className="tabular text-sm font-bold text-fg">{record.score}</div>
                        <div className="text-[11px] text-fg-subtle">
                          {record.graderName ?? '—'} · {formatLocaleDateTime(record.updatedAt)}
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </section>
            </Modal.Body>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </Modal>
  )
}
