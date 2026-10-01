import { BrowserMultiFormatReader, type IScannerControls } from '@zxing/browser'
import { BarcodeFormat, DecodeHintType } from '@zxing/library'
import { Button, Input, ListBox, Select } from '@heroui/react'
import { motion } from 'motion/react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'

import Camera from '~icons/lucide/camera'
import CameraOff from '~icons/lucide/camera-off'
import CircleAlert from '~icons/lucide/circle-alert'
import CircleCheck from '~icons/lucide/circle-check'
import CircleX from '~icons/lucide/circle-x'
import Keyboard from '~icons/lucide/keyboard'
import PackageCheck from '~icons/lucide/package-check'
import ScanLine from '~icons/lucide/scan-line'
import { BackLink } from '@/components/ui/BackLink'
import { Card, EmptyState } from '@/components/ui/Card'
import { PageHeader } from '@/components/ui/PageHeader'
import { listDevBoards, returnDevBoard, type DevBoard } from '@/lib/api'
import { getErrorMessage } from '@/lib/error'
import type { IconComponent } from '@/lib/icon'
import { useCurrentClass } from '@/lib/store'
import { cn } from '@/lib/utils'

type ScanStatus = 'returned' | 'in-stock' | 'not-found' | 'error'

type ScanEntry = {
  id: string
  code: string
  status: ScanStatus
  boardLabel?: string
  message?: string
}

const SCAN_COOLDOWN_MS = 4000
const SUPPORTED_FORMATS = 'Code128 / Code39 / QR'
const AUTO_DEVICE = '__auto__'

const STATUS_META: Record<
  ScanStatus,
  { label: string; className: string; icon: IconComponent }
> = {
  returned: { label: '已归还', className: 'text-success', icon: CircleCheck },
  'in-stock': { label: '已在库', className: 'text-fg-muted', icon: PackageCheck },
  'not-found': { label: '未找到', className: 'text-warning', icon: CircleX },
  error: { label: '失败', className: 'text-danger', icon: CircleAlert },
}

function createReader(): BrowserMultiFormatReader {
  const hints = new Map<DecodeHintType, unknown>()
  hints.set(DecodeHintType.POSSIBLE_FORMATS, [
    BarcodeFormat.CODE_128,
    BarcodeFormat.CODE_39,
    BarcodeFormat.QR_CODE,
  ])
  hints.set(DecodeHintType.TRY_HARDER, true)
  return new BrowserMultiFormatReader(hints)
}

function cameraErrorMessage(error: unknown): string {
  if (error instanceof DOMException) {
    if (error.name === 'NotAllowedError') return '未获得摄像头权限，请在浏览器设置中允许后重试'
    if (error.name === 'NotFoundError' || error.name === 'DevicesNotFoundError') {
      return '未检测到可用摄像头'
    }
    if (error.name === 'NotReadableError' || error.name === 'TrackStartError') {
      return '摄像头被其他程序占用，请关闭后重试'
    }
    if (error.name === 'OverconstrainedError') return '当前摄像头不支持所需参数'
  }
  return getErrorMessage(error, '无法启动摄像头')
}

export default function BoardScan() {
  const currentClass = useCurrentClass()
  const classId = currentClass?.id ?? null

  const videoRef = useRef<HTMLVideoElement>(null)
  const readerRef = useRef<BrowserMultiFormatReader | null>(null)
  const controlsRef = useRef<IScannerControls | null>(null)
  const scanningRef = useRef(false)
  const runIdRef = useRef(0)
  const deviceIdRef = useRef<string | null>(null)
  const cooldownsRef = useRef<Map<string, number>>(new Map())
  const boardsRef = useRef<DevBoard[]>([])
  const handleCodeRef = useRef<(raw: string) => void>(() => {})

  const [boards, setBoards] = useState<DevBoard[]>([])
  const [scanning, setScanning] = useState(false)
  const [starting, setStarting] = useState(false)
  const [cameraError, setCameraError] = useState<string | null>(null)
  const [deviceId, setDeviceId] = useState<string | null>(null)
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([])
  const [entries, setEntries] = useState<ScanEntry[]>([])
  const [manualCode, setManualCode] = useState('')
  const [manualBusy, setManualBusy] = useState(false)

  boardsRef.current = boards

  const load = useCallback(async () => {
    if (!classId) {
      setBoards([])
      return
    }
    try {
      const { devBoards } = await listDevBoards(classId)
      setBoards(devBoards)
    } catch (error) {
      toast.error(getErrorMessage(error, '加载开发板失败'))
    }
  }, [classId])

  useEffect(() => {
    void load()
  }, [load])

  const addEntry = useCallback((entry: Omit<ScanEntry, 'id'>) => {
    setEntries((prev) => [{ ...entry, id: crypto.randomUUID() }, ...prev].slice(0, 30))
  }, [])

  const handleCode = useCallback(
    async (raw: string) => {
      const code = raw.trim()
      if (!code) return

      const now = Date.now()
      if ((cooldownsRef.current.get(code) ?? 0) > now) return
      cooldownsRef.current.set(code, now + SCAN_COOLDOWN_MS)

      const lower = code.toLowerCase()
      const board = boardsRef.current.find(
        (item) =>
          item.dbId === code ||
          item.boardId === code ||
          item.dbId.toLowerCase() === lower ||
          item.boardId?.toLowerCase() === lower,
      )

      if (!board) {
        addEntry({ code, status: 'not-found' })
        return
      }
      if (!board.borrowed) {
        addEntry({ code, status: 'in-stock', boardLabel: board.dbId })
        return
      }

      try {
        const { devBoard } = await returnDevBoard(board.id)
        setBoards((prev) => prev.map((item) => (item.id === devBoard.id ? devBoard : item)))
        addEntry({ code, status: 'returned', boardLabel: devBoard.dbId })
        navigator.vibrate?.(80)
      } catch (error) {
        addEntry({
          code,
          status: 'error',
          boardLabel: board.dbId,
          message: getErrorMessage(error, '归还失败'),
        })
      }
    },
    [addEntry],
  )

  handleCodeRef.current = (raw: string) => {
    void handleCode(raw)
  }

  const refreshDevices = useCallback(async () => {
    try {
      const list = await BrowserMultiFormatReader.listVideoInputDevices()
      setDevices(list)
    } catch {
      setDevices([])
    }
  }, [])

  const start = useCallback(async () => {
    if (scanningRef.current) return
    const video = videoRef.current
    if (!video) return

    const runId = ++runIdRef.current
    setCameraError(null)
    setStarting(true)
    try {
      const reader = readerRef.current ?? createReader()
      readerRef.current = reader
      const controls = await reader.decodeFromVideoDevice(
        deviceIdRef.current ?? undefined,
        video,
        (result) => {
          if (result) handleCodeRef.current(result.getText())
        },
      )
      if (runId !== runIdRef.current) {
        controls.stop()
        return
      }
      controlsRef.current = controls
      scanningRef.current = true
      setScanning(true)
      void refreshDevices()
    } catch (error) {
      if (runId !== runIdRef.current) return
      setCameraError(cameraErrorMessage(error))
    } finally {
      if (runId === runIdRef.current) setStarting(false)
    }
  }, [refreshDevices])

  const stop = useCallback(() => {
    runIdRef.current += 1
    controlsRef.current?.stop()
    controlsRef.current = null
    scanningRef.current = false
    setScanning(false)
  }, [])

  const selectDevice = useCallback(
    (id: string | null) => {
      deviceIdRef.current = id
      setDeviceId(id)
      if (scanningRef.current) {
        stop()
        void start()
      }
    },
    [start, stop],
  )

  useEffect(() => {
    const onChange = () => {
      void refreshDevices()
    }
    navigator.mediaDevices?.addEventListener('devicechange', onChange)
    return () => {
      navigator.mediaDevices?.removeEventListener('devicechange', onChange)
    }
  }, [refreshDevices])

  useEffect(() => {
    void start()
    return () => {
      runIdRef.current += 1
      controlsRef.current?.stop()
      controlsRef.current = null
      scanningRef.current = false
    }
  }, [start])

  const submitManual = async () => {
    if (!manualCode.trim()) return
    setManualBusy(true)
    try {
      await handleCode(manualCode)
      setManualCode('')
    } finally {
      setManualBusy(false)
    }
  }

  const returnedCount = entries.filter((entry) => entry.status === 'returned').length
  const notFoundCount = entries.filter((entry) => entry.status === 'not-found').length

  return (
    <div className="mx-auto max-w-6xl">
      <BackLink to="/console/boards">返回开发板</BackLink>

      <PageHeader
        title="扫码归还"
        subtitle={
          <>
            已归还 <span className="tabular">{returnedCount}</span> · 未找到{' '}
            <span className="tabular">{notFoundCount}</span> · 共{' '}
            <span className="tabular">{boards.length}</span> 块开发板
          </>
        }
        actions={
          scanning ? (
            <Button variant="secondary" onPress={stop}>
              <CameraOff width={16} height={16} className="shrink-0" />
              停止扫描
            </Button>
          ) : (
            <Button variant="primary" isPending={starting} onPress={() => void start()}>
              <Camera width={16} height={16} className="shrink-0" />
              开始扫描
            </Button>
          )
        }
      />

      {!classId ? (
        <EmptyState
          icon={ScanLine}
          title="未选择课程"
          hint="请先在右上角选择或绑定一个课程"
        />
      ) : (
        <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
          <Card className="flex flex-col gap-4">
            <div className="relative aspect-[4/3] overflow-hidden rounded-xl border border-line bg-black">
              <video
                ref={videoRef}
                className="h-full w-full object-cover"
                autoPlay
                muted
                playsInline
              />
              {scanning && (
                <div className="pointer-events-none absolute inset-0">
                  <div className="absolute inset-[12%] rounded-2xl border border-white/25">
                    <div className="absolute -left-px -top-px h-8 w-8 rounded-tl-2xl border-l-2 border-t-2 border-brand-400" />
                    <div className="absolute -right-px -top-px h-8 w-8 rounded-tr-2xl border-r-2 border-t-2 border-brand-400" />
                    <div className="absolute -bottom-px -left-px h-8 w-8 rounded-bl-2xl border-b-2 border-l-2 border-brand-400" />
                    <div className="absolute -bottom-px -right-px h-8 w-8 rounded-br-2xl border-b-2 border-r-2 border-brand-400" />
                    <motion.div
                      className="absolute inset-x-2 h-0.5 rounded-full bg-brand-400 shadow-[0_0_12px_2px] shadow-brand-400/60"
                      initial={{ top: '6%' }}
                      animate={{ top: ['6%', '94%', '6%'] }}
                      transition={{ duration: 2.4, repeat: Infinity, ease: 'easeInOut' }}
                    />
                  </div>
                </div>
              )}
              {!scanning && !starting && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/60 px-6 text-center text-sm text-white/80">
                  <ScanLine width={28} height={28} className="shrink-0" />
                  <div>{cameraError ?? '摄像头未开启'}</div>
                </div>
              )}
            </div>

            <div className="flex flex-col gap-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-1.5 text-xs text-fg-subtle">
                  <ScanLine width={14} height={14} className="shrink-0" />
                  支持 {SUPPORTED_FORMATS}
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-fg-muted">摄像头</span>
                  <Select
                    className="min-w-[12rem]"
                    aria-label="选择摄像头"
                    isDisabled={starting}
                    value={deviceId ?? AUTO_DEVICE}
                    onChange={(key) =>
                      selectDevice(key == null || key === AUTO_DEVICE ? null : String(key))
                    }
                  >
                    <Select.Trigger>
                      <Select.Value />
                      <Select.Indicator />
                    </Select.Trigger>
                    <Select.Popover>
                      <ListBox>
                        <ListBox.Item id={AUTO_DEVICE} textValue="自动（后置优先）">
                          自动（后置优先）
                          <ListBox.ItemIndicator />
                        </ListBox.Item>
                        {devices.map((device, index) => (
                          <ListBox.Item
                            key={device.deviceId}
                            id={device.deviceId}
                            textValue={device.label || `摄像头 ${index + 1}`}
                          >
                            {device.label || `摄像头 ${index + 1}`}
                            <ListBox.ItemIndicator />
                          </ListBox.Item>
                        ))}
                      </ListBox>
                    </Select.Popover>
                  </Select>
                </div>
              </div>
              <div className="flex flex-col gap-1.5">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-fg-muted">
                  <Keyboard width={14} height={14} className="shrink-0" />
                  手动录入
                </div>
                <div className="flex items-center gap-2">
                  <Input
                    fullWidth
                    value={manualCode}
                    onChange={(event) => setManualCode(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') {
                        event.preventDefault()
                        void submitManual()
                      }
                    }}
                    placeholder="输入 DB id 或 id 后回车"
                    aria-label="手动录入编码"
                  />
                  <Button
                    variant="secondary"
                    isPending={manualBusy}
                    isDisabled={!manualCode.trim()}
                    onPress={() => void submitManual()}
                  >
                    处理
                  </Button>
                </div>
              </div>
            </div>
          </Card>

          <Card className="flex flex-col gap-3">
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-bold">扫码记录</span>
              {entries.length > 0 && (
                <Button size="sm" variant="ghost" onPress={() => setEntries([])}>
                  清空
                </Button>
              )}
            </div>
            {entries.length === 0 ? (
              <div className="py-12 text-center text-sm text-fg-subtle">
                扫码结果会显示在这里
              </div>
            ) : (
              <ul className="flex max-h-[62vh] flex-col gap-2 overflow-auto">
                {entries.map((entry) => {
                  const meta = STATUS_META[entry.status]
                  const Icon = meta.icon
                  return (
                    <li
                      key={entry.id}
                      className="flex items-start gap-3 rounded-xl border border-line bg-sunken/40 px-3 py-2"
                    >
                      <Icon width={16} height={16} className={cn('mt-0.5 shrink-0', meta.className)} />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="tabular truncate text-sm font-semibold">
                            {entry.code}
                          </span>
                          <span className={cn('ms-auto shrink-0 text-xs font-semibold', meta.className)}>
                            {meta.label}
                          </span>
                        </div>
                        <div className="mt-0.5 truncate text-xs text-fg-subtle">
                          {entry.boardLabel ? `开发板 ${entry.boardLabel}` : '未匹配到开发板'}
                          {entry.message ? ` · ${entry.message}` : ''}
                        </div>
                      </div>
                    </li>
                  )
                })}
              </ul>
            )}
          </Card>
        </div>
      )}
    </div>
  )
}
