import { Alert, Button, ProgressBar, Spinner, Tooltip } from '@heroui/react'
import { unzipSync } from 'fflate'
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'

import Database from '~icons/lucide/database'
import Download from '~icons/lucide/download'
import File from '~icons/lucide/file'
import FileArchive from '~icons/lucide/file-archive'
import FileCode from '~icons/lucide/file-code'
import FileImage from '~icons/lucide/file-image'
import FileText from '~icons/lucide/file-text'
import FileWarning from '~icons/lucide/file-warning'
import PanelLeftClose from '~icons/lucide/panel-left-close'
import PanelLeftOpen from '~icons/lucide/panel-left-open'
import { fetchXzzdSubmissionAttachments, type ZjuamSubmissionAttachment } from '@/lib/api'
import { getErrorMessage } from '@/lib/error'
import { formatBytes } from '@/lib/format'
import { cn } from '@/lib/utils'

import { isAttachmentCached, loadAttachmentBytes } from './cache'
import { highlightCode, highlightLanguage } from './highlight'
import { PdfViewer } from './PdfViewer'
import {
  detectFileKind,
  downloadPercent,
  fileExtension,
  isProbablyText,
  lookupMime,
  saveBytes,
  type FetchProgress,
  type GradeStudent,
} from './shared'

/** 文本预览最多解码的字节数 */
const TEXT_PREVIEW_LIMIT = 200_000
/** 超过该大小下载前需要用户确认 */
const LARGE_FILE_BYTES = 50 * 1024 * 1024

type LoadedFile = {
  attachmentId: number
  bytes: Uint8Array | null
  error: string | null
  progress: FetchProgress | null
  /** 字节来自本地缓存（未走网络） */
  fromCache: boolean
  /** 大文件等待用户确认下载 */
  awaitingConfirm?: boolean
}

export function FilePreviewPanel({
  experimentId,
  student,
}: {
  experimentId: string
  student: GradeStudent | null
}) {
  const [attachments, setAttachments] = useState<ZjuamSubmissionAttachment[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [activeId, setActiveId] = useState<number | null>(null)
  const [file, setFile] = useState<LoadedFile | null>(null)
  const [pendingSaveId, setPendingSaveId] = useState<number | null>(null)
  const [confirmedLargeIds, setConfirmedLargeIds] = useState<number[]>([])
  const [reloadKey, setReloadKey] = useState(0)

  const personId = student?.personId ?? null

  useEffect(() => {
    if (personId == null) {
      setAttachments(null)
      setActiveId(null)
      setError(null)
      setLoading(false)
      return
    }
    let cancelled = false
    setLoading(true)
    setError(null)
    setAttachments(null)
    setActiveId(null)
    fetchXzzdSubmissionAttachments(experimentId, personId)
      .then((res) => {
        if (cancelled) return
        setAttachments(res.attachments)
        setActiveId(res.attachments[0]?.id ?? null)
      })
      .catch((err) => {
        if (!cancelled) setError(getErrorMessage(err, '获取附件失败'))
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [experimentId, personId])

  const active = attachments?.find((item) => item.id === activeId) ?? attachments?.[0] ?? null
  const activeAttachmentId = active?.id ?? null
  const activeUrl = active?.url ?? null
  const activeName = active?.name ?? ''
  const activeSize = active?.size ?? 0

  useEffect(() => {
    if (activeAttachmentId == null || !activeUrl) {
      setFile(null)
      return
    }
    let cancelled = false
    const attachmentId = activeAttachmentId
    setFile({
      attachmentId,
      bytes: null,
      error: null,
      progress: null,
      fromCache: false,
    })

    const run = async () => {
      // 超大文件且未缓存、未确认过时，先弹窗询问
      if (activeSize > LARGE_FILE_BYTES && !confirmedLargeIds.includes(attachmentId)) {
        const cached = await isAttachmentCached(attachmentId, activeSize)
        if (cancelled) return
        if (!cached) {
          setFile({
            attachmentId,
            bytes: null,
            error: null,
            progress: null,
            fromCache: false,
            awaitingConfirm: true,
          })
          return
        }
      }
      const { bytes, fromCache } = await loadAttachmentBytes(
        { id: attachmentId, name: activeName, size: activeSize, url: activeUrl },
        (progress) => {
          if (cancelled) return
          setFile((prev) => (prev && prev.attachmentId === attachmentId ? { ...prev, progress } : prev))
        },
      )
      if (!cancelled) {
        setFile({ attachmentId, bytes, error: null, progress: null, fromCache })
      }
    }

    void run().catch((err) => {
      if (cancelled) return
      setFile({
        attachmentId,
        bytes: null,
        error: getErrorMessage(err, '获取文件失败'),
        progress: null,
        fromCache: false,
      })
    })

    return () => {
      cancelled = true
    }
  }, [activeAttachmentId, activeUrl, activeName, activeSize, reloadKey, confirmedLargeIds])

  useEffect(() => {
    if (pendingSaveId == null || !file || file.attachmentId !== pendingSaveId) return
    if (file.bytes) {
      const target = attachments?.find((item) => item.id === pendingSaveId)
      if (target) saveBytes(file.bytes, target.name)
      setPendingSaveId(null)
    } else if (file.error) {
      setPendingSaveId(null)
    }
  }, [pendingSaveId, file, attachments])

  const currentFile = file && file.attachmentId === activeAttachmentId ? file : null
  const downloading =
    currentFile != null &&
    currentFile.bytes == null &&
    currentFile.error == null &&
    !currentFile.awaitingConfirm
  const percent = active ? downloadPercent(currentFile?.progress ?? null, active.size) : null

  const confirmLargeDownload = () => {
    if (activeAttachmentId == null) return
    const id = activeAttachmentId
    setConfirmedLargeIds((prev) => (prev.includes(id) ? prev : [...prev, id]))
    setFile((prev) =>
      prev && prev.attachmentId === id ? { ...prev, awaitingConfirm: false } : prev,
    )
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex shrink-0 items-center gap-2 border-b border-line px-4 py-2.5">
        <FileText
          width={15}
          height={15}
          className="shrink-0 text-brand-600 dark:text-brand-300"
        />
        <span className="min-w-0 truncate text-sm font-bold">
          {student ? student.name : '文件预览'}
        </span>
        {student && student.studentNo && (
          <span className="tabular shrink-0 text-[11px] text-fg-subtle">{student.studentNo}</span>
        )}
        {active && (
          <div className="ms-auto flex min-w-0 items-center gap-2">
            <span className="min-w-0 truncate text-xs text-fg-subtle">
              {active.name} · {downloading ? `${percent ?? 0}%` : formatBytes(active.size)}
            </span>
            {currentFile?.bytes && currentFile.fromCache && (
              <Tooltip delay={0}>
                <Tooltip.Trigger aria-label="本地缓存资源">
                  <span
                    tabIndex={0}
                    className="inline-flex h-7 w-7 shrink-0 items-center justify-center text-fg-subtle"
                  >
                    <Database width={14} height={14} className="shrink-0" />
                  </span>
                </Tooltip.Trigger>
                <Tooltip.Content showArrow placement="bottom">
                  <Tooltip.Arrow />
                  <p>本地缓存资源</p>
                </Tooltip.Content>
              </Tooltip>
            )}
            {activeUrl && (
              <button
                type="button"
                aria-label="下载文件"
                disabled={currentFile?.error != null}
                onClick={() => {
                  if (!currentFile) return
                  if (currentFile.bytes) saveBytes(currentFile.bytes, active.name)
                  else setPendingSaveId(active.id)
                }}
                className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-fg-subtle transition-colors hover:bg-sunken hover:text-fg disabled:cursor-default disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-fg-subtle"
              >
                <Download width={15} height={15} className="shrink-0" />
              </button>
            )}
          </div>
        )}
      </div>

      {activeUrl && downloading && (
        <div className="shrink-0 border-b border-line">
          <ProgressBar
            aria-label="下载进度"
            size="sm"
            value={percent ?? 0}
            isIndeterminate={percent == null}
          >
            <ProgressBar.Track className="rounded-none">
              <ProgressBar.Fill className="rounded-none" />
            </ProgressBar.Track>
          </ProgressBar>
        </div>
      )}

      {attachments && attachments.length > 1 && (
        <div className="flex shrink-0 flex-wrap gap-1.5 border-b border-line px-4 py-2">
          {attachments.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setActiveId(item.id)}
              className={cn(
                'max-w-full truncate rounded-lg px-2.5 py-1 text-xs transition-colors',
                item.id === active?.id
                  ? 'bg-brand-500/10 font-semibold text-brand-600 dark:text-brand-300'
                  : 'bg-sunken text-fg-muted hover:text-fg',
              )}
            >
              {item.name}
            </button>
          ))}
        </div>
      )}

      <div className="min-h-0 flex-1">
        {!student ? (
          <CenteredHint text="请选择左侧学生查看提交文件" />
        ) : loading ? (
          <CenteredHint text="正在获取提交附件…" spinner />
        ) : error ? (
          <ErrorAlert message={error} />
        ) : !active ? (
          <CenteredHint text="该学生没有提交附件" />
        ) : !activeUrl ? (
          <ErrorAlert message="未获取到下载链接" />
        ) : currentFile?.error ? (
          <div className="p-4">
            <Alert status="danger">
              <Alert.Indicator />
              <Alert.Content>
                <Alert.Description>{currentFile.error}</Alert.Description>
              </Alert.Content>
            </Alert>
            <button
              type="button"
              onClick={() => setReloadKey((key) => key + 1)}
              className="mt-2 text-xs font-semibold text-brand-600 hover:underline dark:text-brand-300"
            >
              重试
            </button>
          </div>
        ) : currentFile?.awaitingConfirm ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
            <FileWarning width={28} height={28} className="text-warning" />
            <p className="text-xs text-fg-muted">
              文件大小过大（{formatBytes(active.size)}），是否继续下载？
            </p>
            <Button size="sm" onPress={confirmLargeDownload}>
              继续下载
            </Button>
          </div>
        ) : !currentFile?.bytes ? (
          <DownloadingHint
            name={active.name}
            size={active.size}
            progress={currentFile?.progress ?? null}
          />
        ) : fileExtension(active.name) === 'zip' ? (
          <ZipViewer bytes={currentFile.bytes} attachmentId={active.id} />
        ) : (
          <FileViewer name={active.name} bytes={currentFile.bytes} storageKey={`${active.id}`} />
        )}
      </div>
    </div>
  )
}

function DownloadingHint({
  name,
  size,
  progress,
}: {
  name: string
  size: number
  progress: FetchProgress | null
}) {
  const percent = downloadPercent(progress, size)
  const total = progress?.total ?? (size > 0 ? size : null)
  const loaded = progress?.loaded ?? 0

  return (
    <div className="mx-auto flex h-full w-full max-w-xs flex-col items-center justify-center gap-3 p-6">
      <p className="w-full truncate text-center text-xs font-semibold text-fg-muted">
        正在下载 {name}
      </p>
      <ProgressBar
        aria-label="下载进度"
        value={percent ?? 0}
        isIndeterminate={percent == null}
        className="w-full"
      >
        <ProgressBar.Track>
          <ProgressBar.Fill />
        </ProgressBar.Track>
      </ProgressBar>
      <p className="tabular text-[11px] text-fg-subtle">
        {total != null
          ? `${formatBytes(loaded)} / ${formatBytes(total)}${percent != null ? ` · ${percent}%` : ''}`
          : `已下载 ${formatBytes(loaded)}`}
      </p>
    </div>
  )
}

function ZipViewer({ bytes, attachmentId }: { bytes: Uint8Array; attachmentId: number }) {
  const entries = useMemo(() => {
    try {
      return Object.entries(unzipSync(bytes))
        .filter(([name, data]) => !name.endsWith('/') && data.length > 0)
        .filter(([name]) => !isNoiseEntry(name))
        .map(([name, data]) => ({ name, data }))
        .sort((a, b) => a.name.localeCompare(b.name))
    } catch {
      return []
    }
  }, [bytes])

  const [activeName, setActiveName] = useState<string | null>(null)
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const active = entries.find((entry) => entry.name === activeName) ?? entries[0] ?? null

  if (entries.length === 0) {
    return <CenteredHint text="压缩包内没有可预览的文件" />
  }

  return (
    <div className="relative flex h-full min-h-0">
      {sidebarOpen && (
        <div className="flex w-56 shrink-0 flex-col border-r border-line">
          <div className="flex shrink-0 items-center justify-between gap-1 border-b border-line py-1.5 pe-1.5 ps-3">
            <span className="truncate text-[11px] font-semibold text-fg-subtle">
              压缩包内容（{entries.length}）
            </span>
            <button
              type="button"
              title="收起列表"
              aria-label="收起压缩包内容"
              onClick={() => setSidebarOpen(false)}
              className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-fg-subtle transition-colors hover:bg-sunken hover:text-fg"
            >
              <PanelLeftClose width={14} height={14} className="shrink-0" />
            </button>
          </div>
          <div className="min-h-0 flex-1 overflow-auto p-1.5">
            {entries.map((entry) => (
              <button
                key={entry.name}
                type="button"
                title={entry.name}
                onClick={() => setActiveName(entry.name)}
                className={cn(
                  'mb-0.5 flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-xs transition-colors',
                  entry === active
                    ? 'bg-brand-500/10 font-semibold text-brand-600 dark:text-brand-300'
                    : 'text-fg-muted hover:bg-sunken',
                )}
              >
                <FileIcon name={entry.name} bytes={entry.data} />
                <span className="min-w-0 flex-1 truncate">{leafName(entry.name)}</span>
                <span className="tabular shrink-0 text-[10px] text-fg-subtle">
                  {formatBytes(entry.data.length)}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
      <div className="min-w-0 flex-1">
        {active && (
          <FileViewer
            name={active.name}
            bytes={active.data}
            storageKey={`${attachmentId}/${active.name}`}
          />
        )}
      </div>
      {!sidebarOpen && (
        <div className="absolute left-3 top-3 z-20">
          <Tooltip delay={0}>
            <Button size="sm" variant="secondary" onPress={() => setSidebarOpen(true)}>
              <PanelLeftOpen width={14} height={14} className="shrink-0" />
              {entries.length}
            </Button>
            <Tooltip.Content showArrow placement="right">
              <Tooltip.Arrow />
              <p>展开压缩包内容</p>
            </Tooltip.Content>
          </Tooltip>
        </div>
      )}
    </div>
  )
}

function FileViewer({
  name,
  bytes,
  storageKey,
}: {
  name: string
  bytes: Uint8Array
  storageKey?: string
}) {
  const kind = detectFileKind(name)
  if (kind === 'pdf') return <PdfViewer bytes={bytes} storageKey={storageKey} />
  if (kind === 'image') return <ImagePreview name={name} bytes={bytes} />
  if (isProbablyText(bytes)) return <TextPreview name={name} bytes={bytes} />
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center">
      <File width={28} height={28} className="text-fg-subtle" />
      <p className="text-xs text-fg-subtle">
        暂不支持在线预览该文件（{formatBytes(bytes.length)}）
      </p>
    </div>
  )
}

function ImagePreview({ name, bytes }: { name: string; bytes: Uint8Array }) {
  const [url, setUrl] = useState<string | null>(null)

  useEffect(() => {
    const copy = Uint8Array.from(bytes)
    const blob = new Blob([copy.buffer], { type: lookupMime(name) })
    const objectUrl = URL.createObjectURL(blob)
    setUrl(objectUrl)
    return () => URL.revokeObjectURL(objectUrl)
  }, [name, bytes])

  if (!url) return null
  return (
    <div className="h-full overflow-auto bg-sunken p-3">
      <img src={url} alt={name} className="mx-auto max-w-full rounded shadow-sm" />
    </div>
  )
}

function TextPreview({ name, bytes }: { name: string; bytes: Uint8Array }) {
  const text = useMemo(
    () =>
      sanitizeControlCharacters(
        new TextDecoder('utf-8', { fatal: false }).decode(bytes.slice(0, TEXT_PREVIEW_LIMIT)),
      ),
    [bytes],
  )
  const html = useMemo(() => highlightCode(text, highlightLanguage(name)), [name, text])
  const preRef = useRef<HTMLPreElement>(null)

  useLayoutEffect(() => {
    const root = preRef.current
    if (root) visualizeControlCharacters(root)
  }, [text, html])

  return (
    <div className="h-full overflow-auto p-3">
      <pre
        ref={preRef}
        className={cn(
          'whitespace-pre-wrap break-all font-mono text-xs leading-relaxed',
          html ? 'hljs bg-transparent' : 'text-fg-muted',
        )}
      >
        {html ? <code dangerouslySetInnerHTML={{ __html: html }} /> : text}
      </pre>
      {bytes.length > TEXT_PREVIEW_LIMIT && (
        <p className="mt-2 text-[11px] text-fg-subtle">
          仅展示前 {formatBytes(TEXT_PREVIEW_LIMIT)}
        </p>
      )}
    </div>
  )
}

const CONTROL_ABBREVIATIONS = [
  'NUL',
  'SOH',
  'STX',
  'ETX',
  'EOT',
  'ENQ',
  'ACK',
  'BEL',
  'BS',
  'HT',
  'LF',
  'VT',
  'FF',
  'CR',
  'SO',
  'SI',
  'DLE',
  'DC1',
  'DC2',
  'DC3',
  'DC4',
  'NAK',
  'SYN',
  'ETB',
  'CAN',
  'EM',
  'SUB',
  'ESC',
  'FS',
  'GS',
  'RS',
  'US',
]

/** \t \n \r 负责排版，不做可视化 */
const LAYOUT_CONTROL_CODES = new Set([0x09, 0x0a, 0x0d])
/** 控制字符先替换到私用区，避免 NUL 等被 HTML 解析器吞掉，再在 DOM 中还原成方框 */
const CONTROL_SENTINEL_BASE = 0xe000

function isVisibleControl(code: number): boolean {
  return code === 0x7f || (code < 0x20 && !LAYOUT_CONTROL_CODES.has(code))
}

function controlAbbreviation(code: number): string | null {
  const raw =
    code >= CONTROL_SENTINEL_BASE && code <= CONTROL_SENTINEL_BASE + 0x7f
      ? code - CONTROL_SENTINEL_BASE
      : code
  if (!isVisibleControl(raw)) return null
  return raw === 0x7f ? 'DEL' : CONTROL_ABBREVIATIONS[raw]
}

function sanitizeControlCharacters(text: string): string {
  let result = ''
  for (let index = 0; index < text.length; index += 1) {
    const code = text.charCodeAt(index)
    result += isVisibleControl(code)
      ? String.fromCharCode(CONTROL_SENTINEL_BASE + code)
      : text[index]
  }
  return result
}

function hasControlCharacter(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    if (controlAbbreviation(value.charCodeAt(index))) return true
  }
  return false
}

/** 把不可见控制字符替换成 VSCode 风格的小方框（NUL/SOH/…/DEL） */
function visualizeControlCharacters(root: HTMLElement): void {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  const textNodes: Text[] = []
  while (walker.nextNode()) textNodes.push(walker.currentNode as Text)

  for (const node of textNodes) {
    const value = node.nodeValue ?? ''
    if (!hasControlCharacter(value)) continue
    const fragment = document.createDocumentFragment()
    let buffer = ''
    for (let index = 0; index < value.length; index += 1) {
      const code = value.charCodeAt(index)
      const abbreviation = controlAbbreviation(code)
      if (abbreviation) {
        if (buffer) {
          fragment.append(document.createTextNode(buffer))
          buffer = ''
        }
        const span = document.createElement('span')
        span.className = 'control-char'
        span.textContent = abbreviation
        span.title = `U+${code.toString(16).toUpperCase().padStart(4, '0')}`
        fragment.append(span)
      } else {
        buffer += value[index]
      }
    }
    if (buffer) fragment.append(document.createTextNode(buffer))
    node.replaceWith(fragment)
  }
}

function FileIcon({ name, bytes }: { name: string; bytes: Uint8Array }) {
  const kind = detectFileKind(name)
  if (fileExtension(name) === 'zip') {
    return <FileArchive width={13} height={13} className="shrink-0" />
  }
  if (kind === 'pdf') return <FileText width={13} height={13} className="shrink-0" />
  if (kind === 'image') return <FileImage width={13} height={13} className="shrink-0" />
  if (isProbablyText(bytes)) return <FileCode width={13} height={13} className="shrink-0" />
  return <File width={13} height={13} className="shrink-0" />
}

function CenteredHint({ text, spinner }: { text: string; spinner?: boolean }) {
  return (
    <div className="flex h-full items-center justify-center gap-2 p-6 text-xs text-fg-subtle">
      {spinner && <Spinner size="sm" />}
      {text}
    </div>
  )
}

function ErrorAlert({ message }: { message: string }) {
  return (
    <div className="p-4">
      <Alert status="danger">
        <Alert.Indicator />
        <Alert.Content>
          <Alert.Description>{message}</Alert.Description>
        </Alert.Content>
      </Alert>
    </div>
  )
}

/** 过滤 __MACOSX、隐藏文件等压缩包噪声 */
function isNoiseEntry(name: string): boolean {
  const parts = name.split('/')
  return name.startsWith('__MACOSX/') || parts.some((part) => part.startsWith('.'))
}

function leafName(name: string): string {
  return name.split('/').pop() ?? name
}
