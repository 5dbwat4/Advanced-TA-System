import { Spinner } from '@heroui/react'
import { GlobalWorkerOptions, TextLayer, getDocument } from 'pdfjs-dist'
import type { PDFDocumentProxy, PDFPageProxy } from 'pdfjs-dist'
import pdfWorkerSource from 'pdfjs-dist/build/pdf.worker.min.mjs?raw'
import { useEffect, useRef, useState } from 'react'
import type { CSSProperties } from 'react'

import ChevronLeft from '~icons/lucide/chevron-left'
import ChevronRight from '~icons/lucide/chevron-right'
import MoveHorizontal from '~icons/lucide/move-horizontal'
import Rows3 from '~icons/lucide/rows-3'
import Square from '~icons/lucide/square'
import ZoomIn from '~icons/lucide/zoom-in'
import ZoomOut from '~icons/lucide/zoom-out'
import { IconAction } from '@/components/ui/IconAction'
import { cn } from '@/lib/utils'

const pdfWorkerBlobUrl = URL.createObjectURL(
  new Blob([pdfWorkerSource], { type: 'text/javascript' }),
)

const MIN_SCALE = 0.25
const MAX_SCALE = 5
const ZOOM_FACTOR = 1.25
/** 滚动容器 p-3 的左右留白合计 */
const PAGE_PADDING = 24

type BaseSize = { width: number; height: number }

type PendingScroll = { page: number; offset: number }

/** 阅读位置：页码 + 页内偏移比例（0–1） */
type SavedPosition = {
  page: number
  offset: number
  mode: 'scroll' | 'single'
}

export function PdfViewer({ bytes, storageKey }: { bytes: Uint8Array; storageKey?: string }) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const rafRef = useRef<number | null>(null)
  const positionRef = useRef<SavedPosition | null>(null)
  const saveTimerRef = useRef<number | null>(null)

  const [doc, setDoc] = useState<PDFDocumentProxy | null>(null)
  const [baseSizes, setBaseSizes] = useState<BaseSize[] | null>(null)
  const [mode, setMode] = useState<'scroll' | 'single'>('scroll')
  const [pageNumber, setPageNumber] = useState(1)
  const [currentPage, setCurrentPage] = useState(1)
  const [pendingScroll, setPendingScroll] = useState<PendingScroll | null>(null)
  const [scale, setScale] = useState<number | null>(null)
  const [autoFit, setAutoFit] = useState(true)
  const [containerWidth, setContainerWidth] = useState(0)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setDoc(null)
    setBaseSizes(null)
    setScale(null)
    setAutoFit(true)
    setError(null)

    const saved = storageKey ? loadSavedPosition(storageKey) : null
    positionRef.current = saved
    if (saved) {
      setMode(saved.mode)
      setPageNumber(saved.page)
      setCurrentPage(saved.page)
      setPendingScroll({ page: saved.page, offset: saved.offset })
    } else {
      setPageNumber(1)
      setCurrentPage(1)
      setPendingScroll({ page: 1, offset: 0 })
    }

    // 入口 bundle 由 loader 以 blob URL 执行，workerSrc 里的动态 import 无法解析，
    // 因此从内联源码创建 blob worker，经 workerPort 交给 pdfjs，避免运行时 URL 解析
    const worker = new Worker(pdfWorkerBlobUrl, { type: 'module' })
    GlobalWorkerOptions.workerPort = worker
    // pdfjs 会把 data 的底层 buffer 转移给 worker，这里复制一份避免污染调用方
    const task = getDocument({ data: bytes.slice() })
    task.promise.then(
      async (pdf) => {
        const sizes = await Promise.all(
          Array.from({ length: pdf.numPages }, (_, index) =>
            pdf.getPage(index + 1).then((loaded) => {
              const viewport = loaded.getViewport({ scale: 1 })
              return { width: viewport.width, height: viewport.height }
            }),
          ),
        )
        if (cancelled) return
        setDoc(pdf)
        setBaseSizes(sizes)
        setPageNumber((current) => Math.min(current, pdf.numPages))
      },
      (err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : '无法解析 PDF')
      },
    )

    return () => {
      cancelled = true
      void task.destroy().finally(() => worker.terminate())
    }
  }, [bytes, storageKey])

  useEffect(() => {
    const element = scrollRef.current
    if (!element) return
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0]
      if (entry) setContainerWidth(entry.contentRect.width)
    })
    observer.observe(element)
    return () => observer.disconnect()
  }, [doc, baseSizes])

  useEffect(() => {
    if (!autoFit || !baseSizes || containerWidth <= 0) return
    const baseWidth = Math.max(...baseSizes.map((size) => size.width))
    if (!Number.isFinite(baseWidth) || baseWidth <= 0) return
    setScale(clamp((containerWidth - PAGE_PADDING) / baseWidth, MIN_SCALE, MAX_SCALE))
  }, [autoFit, baseSizes, containerWidth])

  useEffect(() => {
    if (mode !== 'scroll' || pendingScroll == null || !baseSizes || scale == null) return
    const container = scrollRef.current
    if (!container) return
    const page = Math.min(pendingScroll.page, baseSizes.length)
    const target = container.querySelector<HTMLElement>(`[data-pdf-page="${page}"]`)
    if (!target) return
    const offset =
      target.getBoundingClientRect().top -
      container.getBoundingClientRect().top -
      PAGE_PADDING / 2 +
      pendingScroll.offset * target.offsetHeight
    container.scrollTop += offset
    setCurrentPage(page)
    setPendingScroll(null)
  }, [mode, pendingScroll, baseSizes, scale])

  const scheduleSave = (position: SavedPosition) => {
    positionRef.current = position
    if (!storageKey) return
    if (saveTimerRef.current != null) window.clearTimeout(saveTimerRef.current)
    saveTimerRef.current = window.setTimeout(() => {
      saveTimerRef.current = null
      if (positionRef.current) writeSavedPosition(storageKey, positionRef.current)
    }, 500)
  }

  useEffect(
    () => () => {
      if (rafRef.current != null) window.cancelAnimationFrame(rafRef.current)
    },
    [],
  )

  useEffect(() => {
    if (mode !== 'single') return
    scheduleSave({ page: pageNumber, offset: 0, mode: 'single' })
  }, [mode, pageNumber])

  useEffect(
    () => () => {
      if (saveTimerRef.current != null) window.clearTimeout(saveTimerRef.current)
      if (storageKey && positionRef.current) writeSavedPosition(storageKey, positionRef.current)
    },
    [storageKey],
  )

  const handleScroll = () => {
    if (rafRef.current != null) return
    rafRef.current = window.requestAnimationFrame(() => {
      rafRef.current = null
      const container = scrollRef.current
      if (!container) return
      const containerTop = container.getBoundingClientRect().top
      const threshold = containerTop + container.clientHeight * 0.35
      const anchor = containerTop + PAGE_PADDING / 2
      let current = 1
      let currentElement: HTMLElement | null = null
      for (const element of container.querySelectorAll<HTMLElement>('[data-pdf-page]')) {
        if (element.getBoundingClientRect().top <= threshold) {
          current = Number(element.dataset.pdfPage)
          currentElement = element
        }
      }
      setCurrentPage(current)
      const offset = currentElement
        ? clamp(
            (anchor - currentElement.getBoundingClientRect().top) / currentElement.offsetHeight,
            0,
            1,
          )
        : 0
      scheduleSave({ page: current, offset, mode: 'scroll' })
    })
  }

  const zoomIn = () => {
    setAutoFit(false)
    setScale((current) =>
      current == null ? current : clamp(current * ZOOM_FACTOR, MIN_SCALE, MAX_SCALE),
    )
  }

  const zoomOut = () => {
    setAutoFit(false)
    setScale((current) =>
      current == null ? current : clamp(current / ZOOM_FACTOR, MIN_SCALE, MAX_SCALE),
    )
  }

  const toggleMode = () => {
    if (mode === 'scroll') {
      setPageNumber(currentPage)
      setMode('single')
    } else {
      setPendingScroll({ page: currentPage, offset: 0 })
      setMode('scroll')
    }
  }

  if (error) {
    return <p className="p-4 text-xs text-danger">{error}</p>
  }
  if (!doc || !baseSizes) {
    return (
      <div className="flex h-full items-center justify-center gap-2 text-xs text-fg-subtle">
        <Spinner size="sm" />
        正在解析 PDF…
      </div>
    )
  }

  const numbers =
    mode === 'scroll'
      ? baseSizes.map((_, index) => index + 1)
      : [Math.min(pageNumber, doc.numPages)]

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 items-center justify-center gap-2 border-b border-line py-1.5">
        {mode === 'single' ? (
          <>
            <IconAction
              label="上一页"
              isDisabled={pageNumber <= 1}
              onPress={() => setPageNumber((current) => Math.max(1, current - 1))}
            >
              <ChevronLeft width={15} height={15} className="shrink-0" />
            </IconAction>
            <span className="tabular text-xs text-fg-muted">
              {pageNumber} / {doc.numPages}
            </span>
            <IconAction
              label="下一页"
              isDisabled={pageNumber >= doc.numPages}
              onPress={() => setPageNumber((current) => Math.min(doc.numPages, current + 1))}
            >
              <ChevronRight width={15} height={15} className="shrink-0" />
            </IconAction>
          </>
        ) : (
          <span className="tabular text-xs text-fg-muted">
            第 {currentPage} / {doc.numPages} 页
          </span>
        )}
        <div className="mx-1 h-4 w-px bg-line" />
        <IconAction label="缩小" isDisabled={scale != null && scale <= MIN_SCALE} onPress={zoomOut}>
          <ZoomOut width={15} height={15} className="shrink-0" />
        </IconAction>
        <span className="tabular w-11 text-center text-xs text-fg-muted">
          {scale == null ? '—' : `${Math.round(scale * 100)}%`}
        </span>
        <IconAction label="放大" isDisabled={scale != null && scale >= MAX_SCALE} onPress={zoomIn}>
          <ZoomIn width={15} height={15} className="shrink-0" />
        </IconAction>
        <IconAction label="适应宽度" onPress={() => setAutoFit(true)}>
          <MoveHorizontal width={15} height={15} className="shrink-0" />
        </IconAction>
        <IconAction label={mode === 'scroll' ? '单页模式' : '连续滚动'} onPress={toggleMode}>
          {mode === 'scroll' ? (
            <Square width={15} height={15} className="shrink-0" />
          ) : (
            <Rows3 width={15} height={15} className="shrink-0" />
          )}
        </IconAction>
      </div>
      <div
        ref={scrollRef}
        data-pdf-scroll
        onScroll={mode === 'scroll' ? handleScroll : undefined}
        className="min-h-0 flex-1 overflow-auto bg-sunken p-3"
      >
        {scale != null && (
          <div className="relative mx-auto flex w-fit flex-col gap-3">
            {numbers.map((number) => (
              <PdfPageView
                key={number}
                doc={doc}
                pageNumber={number}
                size={baseSizes[number - 1]}
                scale={scale}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function PdfPageView({
  doc,
  pageNumber,
  size,
  scale,
}: {
  doc: PDFDocumentProxy
  pageNumber: number
  size: BaseSize
  scale: number
}) {
  const wrapperRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const textLayerRef = useRef<HTMLDivElement>(null)
  const [visible, setVisible] = useState(false)
  const [page, setPage] = useState<PDFPageProxy | null>(null)
  const [status, setStatus] = useState<'idle' | 'rendering' | 'done' | 'error'>('idle')

  useEffect(() => {
    const element = wrapperRef.current
    if (!element) return
    if (typeof IntersectionObserver === 'undefined') {
      setVisible(true)
      return
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setVisible(true)
          observer.disconnect()
        }
      },
      { root: element.closest('[data-pdf-scroll]'), rootMargin: '600px 0px' },
    )
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    if (!visible) return
    let cancelled = false
    doc.getPage(pageNumber).then(
      (loaded) => {
        if (!cancelled) setPage(loaded)
      },
      () => {
        if (!cancelled) setStatus('error')
      },
    )
    return () => {
      cancelled = true
    }
  }, [visible, doc, pageNumber])

  useEffect(() => {
    const canvas = canvasRef.current
    const container = textLayerRef.current
    if (!page || !canvas || !container) return
    let cancelled = false
    setStatus('rendering')

    const viewport = page.getViewport({ scale })
    const dpr = window.devicePixelRatio || 1
    const renderViewport = page.getViewport({ scale: scale * dpr })
    canvas.width = Math.floor(renderViewport.width)
    canvas.height = Math.floor(renderViewport.height)
    canvas.style.width = `${viewport.width}px`
    canvas.style.height = `${viewport.height}px`
    container.textContent = ''

    const renderTask = page.render({ canvas, viewport: renderViewport })
    const textLayer = new TextLayer({
      textContentSource: page.streamTextContent(),
      container,
      viewport,
    })
    const textPromise = textLayer.render()
    void Promise.all([renderTask.promise, textPromise]).then(
      () => {
        if (!cancelled) setStatus('done')
      },
      () => {
        if (!cancelled) setStatus('error')
      },
    )

    return () => {
      cancelled = true
      renderTask.cancel()
      textLayer.cancel()
    }
  }, [page, scale])

  return (
    <div
      ref={wrapperRef}
      data-pdf-page={pageNumber}
      className="pdf-page relative w-fit shrink-0 overflow-hidden rounded bg-white shadow-sm"
      style={
        {
          '--total-scale-factor': scale,
          width: size.width * scale,
          height: size.height * scale,
        } as CSSProperties
      }
    >
      <canvas
        ref={canvasRef}
        className={cn('block', status === 'done' ? 'opacity-100' : 'opacity-0')}
      />
      <div ref={textLayerRef} className="textLayer" />
      {status !== 'done' && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-white/70">
          {status === 'error' ? (
            <span className="text-xs text-danger">第 {pageNumber} 页渲染失败</span>
          ) : (
            <Spinner size="sm" />
          )}
        </div>
      )}
    </div>
  )
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

const POSITION_STORAGE_PREFIX = 'report-pdf:'

function loadSavedPosition(key: string): SavedPosition | null {
  try {
    const raw = window.localStorage.getItem(POSITION_STORAGE_PREFIX + key)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<SavedPosition> | null
    if (!parsed || typeof parsed !== 'object') return null
    const { page, offset, mode } = parsed
    if (typeof page !== 'number' || !Number.isFinite(page) || page < 1) return null
    if (typeof offset !== 'number' || !Number.isFinite(offset)) return null
    if (mode !== 'scroll' && mode !== 'single') return null
    return { page: Math.floor(page), offset: clamp(offset, 0, 1), mode }
  } catch {
    return null
  }
}

function writeSavedPosition(key: string, position: SavedPosition): void {
  try {
    window.localStorage.setItem(POSITION_STORAGE_PREFIX + key, JSON.stringify(position))
  } catch {
    // localStorage 不可用时静默忽略
  }
}
