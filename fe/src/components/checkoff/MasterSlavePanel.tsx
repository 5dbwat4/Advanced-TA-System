import { Button, Spinner, Tooltip } from '@heroui/react'
import copyToClipboard from 'copy-to-clipboard'
import { motion } from 'motion/react'
import { QRCodeSVG } from 'qrcode.react'
import { toast } from 'sonner'

import MonitorSmartphone from '~icons/lucide/monitor-smartphone'
import QrCode from '~icons/lucide/qr-code'
import { ProgressRing } from '@/components/ui/ProgressRing'
import { useTotp } from '@/lib/totp'
import { cn } from '@/lib/utils'

type MasterSessionView = {
  token: string | null
  secret: string | null
  period: number
  serverTime: number | null
  slaveConnected: boolean
  ready: boolean
}

function CountdownRing({ remaining, period }: { remaining: number; period: number }) {
  const progress = Math.max(0, Math.min(1, remaining / period))
  return (
    <ProgressRing value={progress} size={36} stroke={3} showLabel={false}>
      <span className="tabular text-[10px] font-bold text-fg-muted">{remaining}</span>
    </ProgressRing>
  )
}

export function MasterSlavePanel({ session }: { session: MasterSessionView }) {
  const { code, remaining, period } = useTotp(session.secret, session.period, session.serverTime)

  if (!session.ready) {
    return (
      <div className="flex items-center gap-3 rounded-2xl border border-line bg-elevated px-5 py-4 text-sm text-fg-muted">
        <Spinner size="sm" />
        正在创建会话…
      </div>
    )
  }

  const pin = code ?? '------'
  const url = `${window.location.origin}/checkin/${session.token ?? ''}`

  const copy = async () => {
    const ok = await copyToClipboard(url)
    if (ok) toast.success('链接已复制')
    else toast.error(url)
  }

  const copyCode = async () => {
    if (!code) return
    const ok = await copyToClipboard(code)
    if (ok) toast.success('配对码已复制')
    else toast.error(code)
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
      className="overflow-hidden rounded-2xl border border-brand-500/25 bg-gradient-to-r from-brand-500/8 to-amber-500/5"
    >
      <div className="flex flex-wrap items-center gap-4 px-5 py-4">
        <div className="flex items-center gap-3">
          <div className="relative flex h-12 w-12 items-center justify-center rounded-xl bg-brand-500/15 text-brand-600 dark:text-brand-300">
            <MonitorSmartphone width={22} height={22} className="shrink-0" />
            <motion.span
              className={cn(
                'absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full',
                session.slaveConnected ? 'bg-emerald-500' : 'bg-line',
              )}
              animate={session.slaveConnected ? { scale: [1, 1.3, 1] } : {}}
              transition={{ duration: 1.8, repeat: Infinity }}
            />
          </div>
          <div>
            <div className="text-xs font-semibold text-fg-muted">从机配对码</div>
            <div className="flex items-center gap-2">
              <Tooltip delay={0}>
                <Tooltip.Trigger className="inline-flex">
                  <button
                    type="button"
                    onClick={() => void copyCode()}
                    disabled={!code}
                    className="tabular cursor-pointer text-2xl font-bold tracking-[0.3em] transition-colors hover:text-brand-600 disabled:cursor-default dark:hover:text-brand-300"
                  >
                    {pin}
                  </button>
                </Tooltip.Trigger>
                <Tooltip.Content placement="bottom" showArrow>
                  点击复制配对码
                </Tooltip.Content>
              </Tooltip>
              <CountdownRing remaining={remaining} period={period} />
            </div>
          </div>
        </div>

        <div className="h-10 w-px bg-line" />

        <div className="min-w-0 flex-1">
          <div className="text-xs font-semibold text-fg-muted">从机链接</div>
          <Tooltip delay={0}>
            <Tooltip.Trigger className="block w-full text-left">
              <button
                type="button"
                onClick={() => void copy()}
                className="tabular block w-full cursor-pointer truncate text-sm font-medium transition-colors hover:text-brand-600 dark:hover:text-brand-300"
              >
                {url.replace(/^https?:\/\//, '')}
              </button>
            </Tooltip.Trigger>
            <Tooltip.Content placement="bottom" showArrow className="max-w-xs break-all">
              {url}
            </Tooltip.Content>
          </Tooltip>
        </div>

        <Tooltip delay={0}>
          <Tooltip.Trigger className="inline-flex">
            <Button size="sm" variant="secondary" isIconOnly aria-label="显示二维码">
              <QrCode width={14} height={14} className="shrink-0" />
            </Button>
          </Tooltip.Trigger>
          <Tooltip.Content placement="bottom" offset={8} className="w-auto max-w-none p-2">
            <div className="flex flex-col items-center gap-2">
              <QRCodeSVG
                value={url}
                size={168}
                level="M"
                marginSize={2}
                bgColor="#ffffff"
                fgColor="#000000"
              />
              <span className="text-xs text-fg-subtle">扫码在从机打开</span>
            </div>
          </Tooltip.Content>
        </Tooltip>

        <div className="flex items-center gap-2 text-xs font-semibold">
          <span
            className={cn(
              'h-2 w-2 rounded-full',
              session.slaveConnected ? 'animate-pulse bg-emerald-500' : 'bg-fg-subtle/50',
            )}
          />
          <span
            className={
              session.slaveConnected ? 'text-emerald-600 dark:text-emerald-400' : 'text-fg-subtle'
            }
          >
            {session.slaveConnected ? '已连接' : '等待从机连接…'}
          </span>
        </div>
      </div>
    </motion.div>
  )
}
