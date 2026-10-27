<script setup lang="ts">
import { GlobalWorkerOptions, TextLayer, getDocument } from 'pdfjs-dist'
import type { PDFDocumentProxy, PDFPageProxy } from 'pdfjs-dist'
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import {
  computed,
  defineComponent,
  h,
  nextTick,
  onBeforeUnmount,
  onMounted,
  ref,
  shallowRef,
  watch,
} from 'vue'
import type { PropType } from 'vue'

import IconAction from '@/components/ui/IconAction.vue'
import Spinner from '@/components/ui/Spinner.vue'
import { UIcon } from '@/ui'

GlobalWorkerOptions.workerSrc = pdfWorkerUrl

const MIN_SCALE = 0.25
const MAX_SCALE = 5
const ZOOM_FACTOR = 1.25
const PAGE_PADDING = 24

type BaseSize = { width: number; height: number }
type PendingScroll = { page: number; offset: number }
type SavedPosition = {
  page: number
  offset: number
  mode: 'scroll' | 'single'
}

const props = defineProps<{
  bytes: Uint8Array
  storageKey?: string
}>()

const scrollRef = ref<HTMLDivElement | null>(null)

const doc = shallowRef<PDFDocumentProxy | null>(null)
const baseSizes = shallowRef<BaseSize[] | null>(null)
const mode = ref<'scroll' | 'single'>('scroll')
const pageNumber = ref(1)
const currentPage = ref(1)
const pendingScroll = ref<PendingScroll | null>(null)
const scale = ref<number | null>(null)
const autoFit = ref(true)
const containerWidth = ref(0)
const error = ref<string | null>(null)

let position: SavedPosition | null = null
let saveTimer: number | null = null
let rafId: number | null = null
let resizeObserver: ResizeObserver | null = null

const numPages = computed(() => doc.value?.numPages ?? 0)

const pageItems = computed<Array<{ number: number; size: BaseSize }>>(() => {
  const sizes = baseSizes.value
  const pdf = doc.value
  if (!sizes || !pdf) return []
  const list =
    mode.value === 'scroll'
      ? sizes.map((_, index) => index + 1)
      : [Math.min(pageNumber.value, pdf.numPages)]
  return list.map((number) => ({ number, size: sizes[number - 1]! }))
})

watch(
  () => [props.bytes, props.storageKey] as const,
  () => {
    doc.value = null
    baseSizes.value = null
    scale.value = null
    autoFit.value = true
    error.value = null

    const saved = props.storageKey ? loadSavedPosition(props.storageKey) : null
    position = saved
    if (saved) {
      mode.value = saved.mode
      pageNumber.value = saved.page
      currentPage.value = saved.page
      pendingScroll.value = { page: saved.page, offset: saved.offset }
    } else {
      pageNumber.value = 1
      currentPage.value = 1
      pendingScroll.value = { page: 1, offset: 0 }
    }

    let cancelled = false
    const task = getDocument({ data: props.bytes.slice() })
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
        doc.value = pdf
        baseSizes.value = sizes
        pageNumber.value = Math.min(pageNumber.value, pdf.numPages)
      },
      (err: unknown) => {
        if (!cancelled) error.value = err instanceof Error ? err.message : '无法解析 PDF'
      },
    )

    return () => {
      cancelled = true
      void task.destroy()
    }
  },
  { immediate: true },
)

watch(
  [doc, baseSizes],
  () => {
    resizeObserver?.disconnect()
    resizeObserver = null
    const element = scrollRef.value
    if (!element) return
    resizeObserver = new ResizeObserver((entries) => {
      const entry = entries[0]
      if (entry) containerWidth.value = entry.contentRect.width
    })
    resizeObserver.observe(element)
  },
  { flush: 'post' },
)

watch([autoFit, baseSizes, containerWidth], () => {
  if (!autoFit.value || !baseSizes.value || containerWidth.value <= 0) return
  const baseWidth = Math.max(...baseSizes.value.map((size) => size.width))
  if (!Number.isFinite(baseWidth) || baseWidth <= 0) return
  scale.value = clamp((containerWidth.value - PAGE_PADDING) / baseWidth, MIN_SCALE, MAX_SCALE)
})

watch(
  [mode, pendingScroll, baseSizes, scale],
  async () => {
    const target = pendingScroll.value
    const sizes = baseSizes.value
    if (mode.value !== 'scroll' || target == null || !sizes || scale.value == null) return
    await nextTick()
    const container = scrollRef.value
    if (!container) return
    const page = Math.min(target.page, sizes.length)
    const element = container.querySelector<HTMLElement>(`[data-pdf-page="${page}"]`)
    if (!element) return
    const offset =
      element.getBoundingClientRect().top -
      container.getBoundingClientRect().top -
      PAGE_PADDING / 2 +
      target.offset * element.offsetHeight
    container.scrollTop += offset
    currentPage.value = page
    pendingScroll.value = null
  },
  { flush: 'post' },
)

function scheduleSave(next: SavedPosition) {
  position = next
  if (!props.storageKey) return
  if (saveTimer != null) window.clearTimeout(saveTimer)
  saveTimer = window.setTimeout(() => {
    saveTimer = null
    const key = props.storageKey
    if (key && position) writeSavedPosition(key, position)
  }, 500)
}

watch(
  [mode, pageNumber],
  () => {
    if (mode.value !== 'single') return
    scheduleSave({ page: pageNumber.value, offset: 0, mode: 'single' })
  },
  { immediate: true },
)

function handleScroll() {
  if (rafId != null) return
  rafId = window.requestAnimationFrame(() => {
    rafId = null
    const container = scrollRef.value
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
    currentPage.value = current
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

function zoomIn() {
  autoFit.value = false
  if (scale.value == null) return
  scale.value = clamp(scale.value * ZOOM_FACTOR, MIN_SCALE, MAX_SCALE)
}

function zoomOut() {
  autoFit.value = false
  if (scale.value == null) return
  scale.value = clamp(scale.value / ZOOM_FACTOR, MIN_SCALE, MAX_SCALE)
}

function toggleMode() {
  if (mode.value === 'scroll') {
    pageNumber.value = currentPage.value
    mode.value = 'single'
  } else {
    pendingScroll.value = { page: currentPage.value, offset: 0 }
    mode.value = 'scroll'
  }
}

onBeforeUnmount(() => {
  if (rafId != null) window.cancelAnimationFrame(rafId)
  if (saveTimer != null) window.clearTimeout(saveTimer)
  resizeObserver?.disconnect()
  resizeObserver = null
  if (props.storageKey && position) writeSavedPosition(props.storageKey, position)
})

const PdfPageView = defineComponent({
  name: 'PdfPageView',
  props: {
    doc: { type: Object as PropType<PDFDocumentProxy | null>, required: true },
    pageNumber: { type: Number, required: true },
    size: { type: Object as PropType<BaseSize>, required: true },
    scale: { type: Number, required: true },
  },
  setup(pageProps) {
    const wrapperRef = ref<HTMLDivElement | null>(null)
    const canvasRef = ref<HTMLCanvasElement | null>(null)
    const textLayerRef = ref<HTMLDivElement | null>(null)
    const visible = ref(false)
    const page = shallowRef<PDFPageProxy | null>(null)
    const status = ref<'idle' | 'rendering' | 'done' | 'error'>('idle')

    let observer: IntersectionObserver | null = null

    onMounted(() => {
      const element = wrapperRef.value
      if (!element) return
      if (typeof IntersectionObserver === 'undefined') {
        visible.value = true
        return
      }
      observer = new IntersectionObserver(
        (entries) => {
          if (entries.some((entry) => entry.isIntersecting)) {
            visible.value = true
            observer?.disconnect()
            observer = null
          }
        },
        { root: element.closest('[data-pdf-scroll]'), rootMargin: '600px 0px' },
      )
      observer.observe(element)
    })

    onBeforeUnmount(() => {
      observer?.disconnect()
      observer = null
    })

    watch(
      [visible, () => pageProps.doc, () => pageProps.pageNumber],
      () => {
        const pdf = pageProps.doc
        if (!visible.value || !pdf) return
        let cancelled = false
        pdf.getPage(pageProps.pageNumber).then(
          (loaded) => {
            if (!cancelled) page.value = loaded
          },
          () => {
            if (!cancelled) status.value = 'error'
          },
        )
        return () => {
          cancelled = true
        }
      },
      { immediate: true },
    )

    watch(
      [page, () => pageProps.scale],
      () => {
        const canvas = canvasRef.value
        const container = textLayerRef.value
        const loaded = page.value
        if (!loaded || !canvas || !container) return
        let cancelled = false
        status.value = 'rendering'

        const viewport = loaded.getViewport({ scale: pageProps.scale })
        const dpr = window.devicePixelRatio || 1
        const renderViewport = loaded.getViewport({ scale: pageProps.scale * dpr })
        canvas.width = Math.floor(renderViewport.width)
        canvas.height = Math.floor(renderViewport.height)
        canvas.style.width = `${viewport.width}px`
        canvas.style.height = `${viewport.height}px`
        container.textContent = ''

        const renderTask = loaded.render({ canvas, viewport: renderViewport })
        const textLayer = new TextLayer({
          textContentSource: loaded.streamTextContent(),
          container,
          viewport,
        })
        const textPromise = textLayer.render()
        void Promise.all([renderTask.promise, textPromise]).then(
          () => {
            if (!cancelled) status.value = 'done'
          },
          () => {
            if (!cancelled) status.value = 'error'
          },
        )

        return () => {
          cancelled = true
          renderTask.cancel()
          textLayer.cancel()
        }
      },
      { immediate: true, flush: 'post' },
    )

    return () => {
      const style: Record<string, string> = {
        '--total-scale-factor': String(pageProps.scale),
        '--scale-round-x': '0.1px',
        '--scale-round-y': '0.1px',
        width: `${pageProps.size.width * pageProps.scale}px`,
        height: `${pageProps.size.height * pageProps.scale}px`,
      }
      return h(
        'div',
        {
          ref: wrapperRef,
          'data-pdf-page': pageProps.pageNumber,
          class:
            'pdf-page relative w-fit shrink-0 overflow-hidden rounded bg-white shadow-sm',
          style,
        },
        [
          h('canvas', {
            ref: canvasRef,
            class: ['block', status.value === 'done' ? 'opacity-100' : 'opacity-0'],
          }),
          h('div', { ref: textLayerRef, class: 'textLayer' }),
          status.value !== 'done'
            ? h(
                'div',
                {
                  class:
                    'absolute inset-0 z-10 flex items-center justify-center bg-white/70',
                },
                [
                  status.value === 'error'
                    ? h(
                        'span',
                        { class: 'text-xs text-danger' },
                        `第 ${pageProps.pageNumber} 页渲染失败`,
                      )
                    : h(Spinner, { size: 'sm' }),
                ],
              )
            : null,
        ],
      )
    }
  },
})

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
    const { page, offset, mode: savedMode } = parsed
    if (typeof page !== 'number' || !Number.isFinite(page) || page < 1) return null
    if (typeof offset !== 'number' || !Number.isFinite(offset)) return null
    if (savedMode !== 'scroll' && savedMode !== 'single') return null
    return { page: Math.floor(page), offset: clamp(offset, 0, 1), mode: savedMode }
  } catch {
    return null
  }
}

function writeSavedPosition(key: string, saved: SavedPosition): void {
  try {
    window.localStorage.setItem(POSITION_STORAGE_PREFIX + key, JSON.stringify(saved))
  } catch {
    // localStorage 不可用时静默忽略
  }
}
</script>

<template>
  <p v-if="error" class="p-4 text-xs text-danger">{{ error }}</p>
  <div
    v-else-if="!doc || !baseSizes"
    class="flex h-full items-center justify-center gap-2 text-xs text-fg-subtle"
  >
    <Spinner size="sm" />
    正在解析 PDF…
  </div>
  <div v-else class="flex h-full min-h-0 flex-col">
    <div
      class="flex shrink-0 items-center justify-center gap-2 border-b border-line py-1.5"
    >
      <template v-if="mode === 'single'">
        <IconAction
          label="上一页"
          :disabled="pageNumber <= 1"
          @click="pageNumber = Math.max(1, pageNumber - 1)"
        >
          <UIcon name="i-lucide-chevron-left" class="size-[15px] shrink-0" />
        </IconAction>
        <span class="tabular text-xs text-fg-muted">{{ pageNumber }} / {{ numPages }}</span>
        <IconAction
          label="下一页"
          :disabled="pageNumber >= numPages"
          @click="pageNumber = Math.min(numPages, pageNumber + 1)"
        >
          <UIcon name="i-lucide-chevron-right" class="size-[15px] shrink-0" />
        </IconAction>
      </template>
      <span v-else class="tabular text-xs text-fg-muted">
        第 {{ currentPage }} / {{ numPages }} 页
      </span>
      <div class="mx-1 h-4 w-px bg-line" />
      <IconAction
        label="缩小"
        :disabled="scale != null && scale <= MIN_SCALE"
        @click="zoomOut"
      >
        <UIcon name="i-lucide-zoom-out" class="size-[15px] shrink-0" />
      </IconAction>
      <span class="tabular w-11 text-center text-xs text-fg-muted">
        {{ scale == null ? '—' : `${Math.round(scale * 100)}%` }}
      </span>
      <IconAction
        label="放大"
        :disabled="scale != null && scale >= MAX_SCALE"
        @click="zoomIn"
      >
        <UIcon name="i-lucide-zoom-in" class="size-[15px] shrink-0" />
      </IconAction>
      <IconAction label="适应宽度" @click="autoFit = true">
        <UIcon name="i-lucide-move-horizontal" class="size-[15px] shrink-0" />
      </IconAction>
      <IconAction
        :label="mode === 'scroll' ? '单页模式' : '连续滚动'"
        @click="toggleMode"
      >
        <UIcon
          :name="mode === 'scroll' ? 'i-lucide-square' : 'i-lucide-rows-3'"
          class="size-[15px] shrink-0"
        />
      </IconAction>
    </div>
    <div
      ref="scrollRef"
      data-pdf-scroll
      class="min-h-0 flex-1 overflow-auto bg-sunken p-3"
      @scroll="mode === 'scroll' ? handleScroll : undefined"
    >
      <div v-if="scale != null" class="relative mx-auto flex w-fit flex-col gap-3">
        <PdfPageView
          v-for="item in pageItems"
          :key="item.number"
          :doc="doc"
          :page-number="item.number"
          :size="item.size"
          :scale="scale ?? 1"
        />
      </div>
    </div>
  </div>
</template>

<style>
.pdf-page .textLayer {
  color-scheme: only light;
  position: absolute;
  text-align: initial;
  inset: 0;
  overflow: clip;
  opacity: 1;
  line-height: 1;
  letter-spacing: normal;
  word-spacing: normal;
  -webkit-text-size-adjust: none;
  text-size-adjust: none;
  forced-color-adjust: none;
  transform-origin: 0 0;
  caret-color: CanvasText;
  z-index: 0;
  --min-font-size: 1;
  --text-scale-factor: calc(var(--total-scale-factor) * var(--min-font-size));
  --min-font-size-inv: calc(1 / var(--min-font-size));
}

.pdf-page .textLayer :is(span, br) {
  color: transparent;
  position: absolute;
  white-space: pre;
  cursor: text;
  transform-origin: 0% 0%;
  -webkit-user-select: text;
  user-select: text;
}

.pdf-page .textLayer > :not(.markedContent),
.pdf-page .textLayer .markedContent span:not(.markedContent) {
  z-index: 1;
  --font-height: 0;
  font-size: calc(var(--text-scale-factor) * var(--font-height));
  --scale-x: 1;
  --rotate: 0deg;
  transform: rotate(var(--rotate)) scaleX(var(--scale-x)) scale(var(--min-font-size-inv));
}

.pdf-page .textLayer .markedContent {
  display: contents;
}

.pdf-page .textLayer span[role='img'] {
  -webkit-user-select: none;
  user-select: none;
  cursor: default;
}

.pdf-page .textLayer ::selection {
  background: rgb(0 0 255 / 0.25);
}
</style>
