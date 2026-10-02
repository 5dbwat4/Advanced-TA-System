import { Spinner } from '@heroui/react'
import { GlobalWorkerOptions, TextLayer, getDocument } from 'pdfjs-dist'
import type { PDFDocumentProxy, PDFPageProxy } from 'pdfjs-dist'
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
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

GlobalWorkerOptions.workerSrc = workerUrl

const MIN_SCALE = 0.25
const MAX_SCALE = 5
const ZOOM_FACTOR = 1.25
/** 滚动容器 p-3 的左右留白合计 */
const PAGE_PADDING = 24

type BaseSize = { width: number; height: number }

export function PdfViewer({ bytes }: { bytes: Uint8Array }) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const rafRef = useRef<number | null>(null)

  const [doc, setDoc] = useState<PDFDocumentProxy | null>(null)
  const [baseSizes, setBaseSizes] = useState<BaseSize[] | null>(null)
  const [mode, setMode] = useState<'scroll' | 'single'>('scroll')
  const [pageNumber, setPageNumber] = useState(1)
  const [currentPage, setCurrentPage] = useState(1)
  const [pendingScrollPage, setPendingScrollPage] = useState<number | null>(null)
  const [scale, setScale] = useState<number | null>(null)
  const [autoFit, setAutoFit] = useState(true)
  const [containerWidth, setContainerWidth] = useState(0)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setDoc(null)
    setBaseSizes(null)
    setPageNumber(1)
    setCurrentPage(1)
    setScale(null)
    setAutoFit(true)
    setError(null)

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
      },
      (err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : '无法解析 PDF')
      },
    )

    return () => {
      cancelled = true
      void task.destroy()
    }
  }, [bytes])

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
    if (mode !== 'scroll' || pendingScrollPage == null || !baseSizes) return
    const container = scrollRef.current
    if (!container) return
    const target = container.querySelector<HTMLElement>(`[data-pdf-page="${pendingScrollPage}"]`)
    if (target) {
      const offset =
        target.getBoundingClientRect().top - container.getBoundingClientRect().top - PAGE_PADDING / 2
      container.scrollTop += offset
      setCurrentPage(pendingScrollPage)
    }
    setPendingScrollPage(null)
  }, [mode, pendingScrollPage, baseSizes])

  useEffect(
    () => () => {
      if (rafRef.current != null) window.cancelAnimationFrame(rafRef.current)
    },
    [],
  )

  const handleScroll = () => {
    if (rafRef.current != null) return
    rafRef.current = window.requestAnimationFrame(() => {
      rafRef.current = null
      const container = scrollRef.current
      if (!container) return
      const threshold = container.getBoundingClientRect().top + container.clientHeight * 0.35
      let current = 1
      for (const element of container.querySelectorAll<HTMLElement>('[data-pdf-page]')) {
        if (element.getBoundingClientRect().top <= threshold) {
          current = Number(element.dataset.pdfPage)
        }
      }
      setCurrentPage(current)
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
      setPendingScrollPage(currentPage)
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
