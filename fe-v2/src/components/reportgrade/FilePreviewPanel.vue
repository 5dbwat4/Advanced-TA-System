<script setup lang="ts">
import { unzipSync } from 'fflate'
import { computed, nextTick, ref, watch } from 'vue'

import Spinner from '@/components/ui/Spinner.vue'
import PdfViewer from '@/components/reportgrade/PdfViewer.vue'
import { UAlert, UButton, UIcon, UProgress, UTooltip } from '@/ui'
import { fetchXzzdSubmissionAttachments, type ZjuamSubmissionAttachment } from '@/lib/api'
import { getErrorMessage } from '@/lib/error'
import { formatBytes } from '@/lib/format'

import { isAttachmentCached, loadAttachmentBytes } from './cache'
import { highlightCode, highlightLanguage } from './highlight'
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

const TEXT_PREVIEW_LIMIT = 200_000
const LARGE_FILE_BYTES = 50 * 1024 * 1024

type LoadedFile = {
  attachmentId: number
  bytes: Uint8Array | null
  error: string | null
  progress: FetchProgress | null
  fromCache: boolean
  awaitingConfirm?: boolean
}

const props = defineProps<{
  experimentId: string
  student: GradeStudent | null
}>()

const attachments = ref<ZjuamSubmissionAttachment[] | null>(null)
const loading = ref(false)
const error = ref<string | null>(null)
const activeId = ref<number | null>(null)
const file = ref<LoadedFile | null>(null)
const pendingSaveId = ref<number | null>(null)
const confirmedLargeIds = ref<number[]>([])
const reloadKey = ref(0)

const personId = computed(() => props.student?.personId ?? null)

const active = computed(
  () => attachments.value?.find((item) => item.id === activeId.value) ?? attachments.value?.[0] ?? null,
)
const activeAttachmentId = computed(() => active.value?.id ?? null)
const activeUrl = computed(() => active.value?.url ?? null)
const activeName = computed(() => active.value?.name ?? '')
const activeSize = computed(() => active.value?.size ?? 0)

watch(
  [() => props.experimentId, () => personId.value],
  ([experimentId, pid], _previous, onCleanup) => {
    if (pid == null) {
      attachments.value = null
      activeId.value = null
      error.value = null
      loading.value = false
      return
    }
    let cancelled = false
    onCleanup(() => {
      cancelled = true
    })
    loading.value = true
    error.value = null
    attachments.value = null
    activeId.value = null
    fetchXzzdSubmissionAttachments(experimentId, pid)
      .then((res) => {
        if (cancelled) return
        attachments.value = res.attachments
        activeId.value = res.attachments[0]?.id ?? null
      })
      .catch((err) => {
        if (!cancelled) error.value = getErrorMessage(err, '获取附件失败')
      })
      .finally(() => {
        if (!cancelled) loading.value = false
      })
  },
  { immediate: true },
)

watch(
  () =>
    [
      activeAttachmentId.value,
      activeUrl.value,
      activeName.value,
      activeSize.value,
      reloadKey.value,
      confirmedLargeIds.value.length,
    ] as const,
  ([id, url, name, size], _previous, onCleanup) => {
    if (id == null || !url) {
      file.value = null
      return
    }
    let cancelled = false
    onCleanup(() => {
      cancelled = true
    })
    const attachmentId = id
    file.value = {
      attachmentId,
      bytes: null,
      error: null,
      progress: null,
      fromCache: false,
    }

    const run = async () => {
      if (size > LARGE_FILE_BYTES && !confirmedLargeIds.value.includes(attachmentId)) {
        const cached = await isAttachmentCached(attachmentId, size)
        if (cancelled) return
        if (!cached) {
          file.value = {
            attachmentId,
            bytes: null,
            error: null,
            progress: null,
            fromCache: false,
            awaitingConfirm: true,
          }
          return
        }
      }
      const { bytes, fromCache } = await loadAttachmentBytes(
        { id: attachmentId, name, size, url },
        (progress) => {
          if (cancelled) return
          const previous = file.value
          if (previous && previous.attachmentId === attachmentId) {
            file.value = { ...previous, progress }
          }
        },
      )
      if (!cancelled) {
        file.value = { attachmentId, bytes, error: null, progress: null, fromCache }
      }
    }

    void run().catch((err) => {
      if (cancelled) return
      file.value = {
        attachmentId,
        bytes: null,
        error: getErrorMessage(err, '获取文件失败'),
        progress: null,
        fromCache: false,
      }
    })
  },
  { immediate: true },
)

watch([pendingSaveId, file, attachments], () => {
  const id = pendingSaveId.value
  const current = file.value
  if (id == null || !current || current.attachmentId !== id) return
  if (current.bytes) {
    const target = attachments.value?.find((item) => item.id === id)
    if (target) saveBytes(current.bytes, target.name)
    pendingSaveId.value = null
  } else if (current.error) {
    pendingSaveId.value = null
  }
})

const currentFile = computed(() =>
  file.value && file.value.attachmentId === activeAttachmentId.value ? file.value : null,
)
const downloading = computed(
  () =>
    currentFile.value != null &&
    currentFile.value.bytes == null &&
    currentFile.value.error == null &&
    !currentFile.value.awaitingConfirm,
)
const percent = computed(() =>
  active.value ? downloadPercent(currentFile.value?.progress ?? null, active.value.size) : null,
)
const downloadLoaded = computed(() => currentFile.value?.progress?.loaded ?? 0)
const downloadTotal = computed(
  () => currentFile.value?.progress?.total ?? (active.value && active.value.size > 0 ? active.value.size : null),
)
const downloadStatusText = computed(() =>
  downloadTotal.value != null
    ? `${formatBytes(downloadLoaded.value)} / ${formatBytes(downloadTotal.value)}${percent.value != null ? ` · ${percent.value}%` : ''}`
    : `已下载 ${formatBytes(downloadLoaded.value)}`,
)

function confirmLargeDownload() {
  if (activeAttachmentId.value == null) return
  const id = activeAttachmentId.value
  if (!confirmedLargeIds.value.includes(id)) {
    confirmedLargeIds.value = [...confirmedLargeIds.value, id]
  }
  if (file.value && file.value.attachmentId === id) {
    file.value = { ...file.value, awaitingConfirm: false }
  }
}

function handleDownload() {
  if (!currentFile.value) return
  if (currentFile.value.bytes) {
    saveBytes(currentFile.value.bytes, activeName.value)
  } else if (active.value) {
    pendingSaveId.value = active.value.id
  }
}

function retry() {
  reloadKey.value += 1
}

const isZip = computed(
  () => currentFile.value?.bytes != null && fileExtension(activeName.value) === 'zip',
)
const zipSidebarOpen = ref(true)
const zipActiveName = ref<string | null>(null)

watch(activeAttachmentId, () => {
  zipActiveName.value = null
})

const zipEntries = computed(() => {
  const bytes = currentFile.value?.bytes
  if (!bytes || !isZip.value) return []
  try {
    return Object.entries(unzipSync(bytes))
      .filter(([name, data]) => !name.endsWith('/') && data.length > 0)
      .filter(([name]) => !isNoiseEntry(name))
      .map(([name, data]) => ({ name, data }))
      .sort((a, b) => a.name.localeCompare(b.name))
  } catch {
    return []
  }
})

const zipActiveEntry = computed(
  () => zipEntries.value.find((entry) => entry.name === zipActiveName.value) ?? zipEntries.value[0] ?? null,
)

const previewInfo = computed(() => {
  if (isZip.value) {
    const entry = zipActiveEntry.value
    if (!entry) return null
    return {
      name: entry.name,
      bytes: entry.data,
      storageKey: `${active.value?.id ?? ''}/${entry.name}`,
    }
  }
  const current = currentFile.value
  if (!current?.bytes) return null
  return {
    name: activeName.value,
    bytes: current.bytes,
    storageKey: `${active.value?.id ?? ''}`,
  }
})

const previewKind = computed(() => (previewInfo.value ? detectFileKind(previewInfo.value.name) : 'other'))
const previewIsText = computed(() =>
  previewInfo.value ? isProbablyText(previewInfo.value.bytes) : false,
)

const imageUrl = ref<string | null>(null)
watch(
  () => [previewInfo.value?.name, previewInfo.value?.bytes] as const,
  ([name, bytes], _previous, onCleanup) => {
    if (!name || !bytes || detectFileKind(name) !== 'image') {
      imageUrl.value = null
      return
    }
    const copy = Uint8Array.from(bytes)
    const blob = new Blob([copy.buffer], { type: lookupMime(name) })
    const url = URL.createObjectURL(blob)
    imageUrl.value = url
    onCleanup(() => URL.revokeObjectURL(url))
  },
  { immediate: true },
)

const previewText = computed(() => {
  if (!previewInfo.value) return ''
  return sanitizeControlCharacters(
    new TextDecoder('utf-8', { fatal: false }).decode(
      previewInfo.value.bytes.slice(0, TEXT_PREVIEW_LIMIT),
    ),
  )
})

const previewHtml = computed(() =>
  previewInfo.value ? highlightCode(previewText.value, highlightLanguage(previewInfo.value.name)) : null,
)

const preRef = ref<HTMLElement | null>(null)
watch(
  [previewText, previewHtml],
  async () => {
    await nextTick()
    if (preRef.value) visualizeControlCharacters(preRef.value)
  },
  { flush: 'post', immediate: true },
)

function fileIconName(name: string, bytes: Uint8Array): string {
  const kind = detectFileKind(name)
  if (fileExtension(name) === 'zip') return 'i-lucide-file-archive'
  if (kind === 'pdf') return 'i-lucide-file-text'
  if (kind === 'image') return 'i-lucide-file-image'
  if (isProbablyText(bytes)) return 'i-lucide-file-code'
  return 'i-lucide-file'
}

function isNoiseEntry(name: string): boolean {
  const parts = name.split('/')
  return name.startsWith('__MACOSX/') || parts.some((part) => part.startsWith('.'))
}

function leafName(name: string): string {
  return name.split('/').pop() ?? name
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

const LAYOUT_CONTROL_CODES = new Set([0x09, 0x0a, 0x0d])
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
  return raw === 0x7f ? 'DEL' : (CONTROL_ABBREVIATIONS[raw] ?? null)
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
</script>

<template>
  <div class="flex h-full flex-col">
    <div class="flex shrink-0 items-center gap-2 border-b border-default px-4 py-2.5">
      <UIcon name="i-lucide-file-text" class="size-4 shrink-0 text-primary" />
      <span class="min-w-0 truncate text-sm font-bold">
        {{ student ? student.name : '文件预览' }}
      </span>
      <span
        v-if="student && student.studentId"
        class="shrink-0 text-[11px] tabular-nums text-muted"
      >
        {{ student.studentId }}
      </span>
      <div v-if="active" class="ms-auto flex min-w-0 items-center gap-2">
        <span class="min-w-0 truncate text-xs text-muted">
          {{ active.name }} ·
          {{ downloading ? `${percent ?? 0}%` : formatBytes(active.size) }}
        </span>
        <UTooltip
          v-if="currentFile?.bytes && currentFile?.fromCache"
          text="本地缓存资源"
          arrow
          :content="{ side: 'bottom' }"
        >
          <span class="inline-flex size-7 shrink-0 items-center justify-center text-muted">
            <UIcon name="i-lucide-database" class="size-3.5 shrink-0" />
          </span>
        </UTooltip>
        <UButton
          v-if="activeUrl"
          icon="i-lucide-download"
          color="neutral"
          variant="ghost"
          size="xs"
          square
          aria-label="下载文件"
          :disabled="currentFile?.error != null"
          @click="handleDownload"
        />
      </div>
    </div>

    <div v-if="activeUrl && downloading" class="shrink-0 border-b border-default">
      <UProgress
        class="rounded-none"
        size="sm"
        :model-value="percent === null ? null : percent"
        aria-label="下载进度"
      />
    </div>

    <div
      v-if="attachments && attachments.length > 1"
      class="flex shrink-0 flex-wrap gap-1.5 border-b border-default px-4 py-2"
    >
      <button
        v-for="item in attachments"
        :key="item.id"
        type="button"
        class="max-w-full truncate rounded-lg px-2.5 py-1 text-xs transition-colors"
        :class="
          item.id === active?.id
            ? 'bg-primary/10 font-semibold text-primary'
            : 'bg-muted text-muted hover:text-highlighted'
        "
        @click="activeId = item.id"
      >
        {{ item.name }}
      </button>
    </div>

    <div class="min-h-0 flex-1">
      <div
        v-if="!student"
        class="flex h-full items-center justify-center gap-2 p-6 text-xs text-muted"
      >
        请选择左侧学生查看提交文件
      </div>
      <div
        v-else-if="loading"
        class="flex h-full items-center justify-center gap-2 p-6 text-xs text-muted"
      >
        <Spinner size="sm" />
        正在获取提交附件…
      </div>
      <div v-else-if="error" class="p-4">
        <UAlert variant="subtle" color="error" :description="error" icon="i-lucide-circle-alert" />
      </div>
      <div
        v-else-if="!active"
        class="flex h-full items-center justify-center gap-2 p-6 text-xs text-muted"
      >
        该学生没有提交附件
      </div>
      <div v-else-if="!activeUrl" class="p-4">
        <UAlert
          variant="subtle"
          color="error"
          description="未获取到下载链接"
          icon="i-lucide-circle-alert"
        />
      </div>
      <div v-else-if="currentFile?.error" class="p-4">
        <UAlert
          variant="subtle"
          color="error"
          :description="currentFile?.error ?? ''"
          icon="i-lucide-circle-alert"
        />
        <button
          type="button"
          class="mt-2 text-xs font-semibold text-primary hover:underline"
          @click="retry"
        >
          重试
        </button>
      </div>
      <div
        v-else-if="currentFile?.awaitingConfirm"
        class="flex h-full flex-col items-center justify-center gap-3 p-6 text-center"
      >
        <UIcon name="i-lucide-file-warning" class="size-7 text-warning" />
        <p class="text-xs text-muted">
          文件大小过大（{{ formatBytes(active.size) }}），是否继续下载？
        </p>
        <UButton size="sm" @click="confirmLargeDownload">继续下载</UButton>
      </div>
      <div
        v-else-if="!currentFile?.bytes"
        class="mx-auto flex h-full w-full max-w-xs flex-col items-center justify-center gap-3 p-6"
      >
        <p class="w-full truncate text-center text-xs font-semibold text-muted">
          正在下载 {{ active.name }}
        </p>
        <UProgress class="w-full" :model-value="percent" aria-label="下载进度" />
        <p class="text-[11px] tabular-nums text-muted">{{ downloadStatusText }}</p>
      </div>
      <div v-else class="relative flex h-full min-h-0">
        <div v-if="isZip && zipSidebarOpen" class="flex w-56 shrink-0 flex-col border-r border-default">
          <div
            class="flex shrink-0 items-center justify-between gap-1 border-b border-default py-1.5 pe-1.5 ps-3"
          >
            <span class="truncate text-[11px] font-semibold text-muted">
              压缩包内容（{{ zipEntries.length }}）
            </span>
            <button
              type="button"
              title="收起列表"
              aria-label="收起压缩包内容"
              class="inline-flex size-6 shrink-0 items-center justify-center rounded-md text-muted transition-colors hover:bg-elevated hover:text-highlighted"
              @click="zipSidebarOpen = false"
            >
              <UIcon name="i-lucide-panel-left-close" class="size-3.5 shrink-0" />
            </button>
          </div>
          <div class="min-h-0 flex-1 overflow-auto p-1.5">
            <button
              v-for="entry in zipEntries"
              :key="entry.name"
              type="button"
              :title="entry.name"
              class="mb-0.5 flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-xs transition-colors"
              :class="
                entry === zipActiveEntry
                  ? 'bg-primary/10 font-semibold text-primary'
                  : 'text-muted hover:bg-elevated'
              "
              @click="zipActiveName = entry.name"
            >
              <UIcon :name="fileIconName(entry.name, entry.data)" class="size-3.5 shrink-0" />
              <span class="min-w-0 flex-1 truncate">{{ leafName(entry.name) }}</span>
              <span class="shrink-0 text-[10px] tabular-nums text-muted">
                {{ formatBytes(entry.data.length) }}
              </span>
            </button>
          </div>
        </div>

        <div class="min-w-0 flex-1">
          <div
            v-if="isZip && zipEntries.length === 0"
            class="flex h-full items-center justify-center gap-2 p-6 text-xs text-muted"
          >
            压缩包内没有可预览的文件
          </div>
          <template v-else-if="previewInfo">
            <PdfViewer
              v-if="previewKind === 'pdf'"
              :bytes="previewInfo.bytes"
              :storage-key="previewInfo.storageKey"
            />
            <div v-else-if="previewKind === 'image'" class="h-full overflow-auto bg-elevated p-3">
              <img
                v-if="imageUrl"
                :src="imageUrl"
                :alt="previewInfo.name"
                class="mx-auto max-w-full rounded shadow-sm"
              />
            </div>
            <div v-else-if="previewIsText" class="h-full overflow-auto p-3">
              <pre
                ref="preRef"
                class="whitespace-pre-wrap break-all font-mono text-xs leading-relaxed"
                :class="previewHtml ? 'hljs bg-transparent' : 'text-muted'"
              ><code v-if="previewHtml" v-html="previewHtml" /><template v-else>{{ previewText }}</template></pre>
              <p
                v-if="previewInfo.bytes.length > TEXT_PREVIEW_LIMIT"
                class="mt-2 text-[11px] text-muted"
              >
                仅展示前 {{ formatBytes(TEXT_PREVIEW_LIMIT) }}
              </p>
            </div>
            <div
              v-else
              class="flex h-full flex-col items-center justify-center gap-2 p-6 text-center"
            >
              <UIcon name="i-lucide-file" class="size-7 text-muted" />
              <p class="text-xs text-muted">
                暂不支持在线预览该文件（{{ formatBytes(previewInfo.bytes.length) }}）
              </p>
            </div>
          </template>
        </div>

        <div v-if="isZip && !zipSidebarOpen" class="absolute left-3 top-3 z-20">
          <UTooltip text="展开压缩包内容" arrow :content="{ side: 'right' }">
            <UButton size="xs" variant="soft" @click="zipSidebarOpen = true">
              <UIcon name="i-lucide-panel-left-open" class="size-3.5 shrink-0" />
              {{ zipEntries.length }}
            </UButton>
          </UTooltip>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
:deep(.control-char) {
  display: inline-block;
  min-width: 1.4em;
  margin: 0 1px;
  padding: 0 2px;
  border: 1px solid currentColor;
  border-radius: 2px;
  font-size: 0.75em;
  line-height: 1.2;
  text-align: center;
  opacity: 0.75;
}
</style>
